/**
 * MusicFinder — audio engine (offscreen document).
 * Owns the queue and playback state; UIs connect over a port and receive pushes.
 * Only chrome.runtime is available here, so persistence goes to IndexedDB.
 */

import { providers } from '../providers/index.js';
import { parseLrc, trackKey, friendlyError } from '../shared/util.js';
import { loadSnapshot, saveSnapshot } from '../shared/db.js';
import { CMD, READY } from '../shared/player-client.js';

const audio = document.getElementById('audio');
const yt = document.getElementById('yt');
const QUEUE_MAX = 500;
const MODES = ['list', 'loop', 'one', 'shuffle'];

const state = {
  track: null, queue: [], index: -1, playing: false, loading: false,
  duration: 0, volume: 0.8, muted: false, mode: 'list',
  page: 0, pages: null, embed: false, error: ''
};
let lyrics = { key: '', lines: [], loading: false };
let loadToken = 0;
let failStreak = 0;
let pendingSeek = 0;
let restoredTime = 0;
const ports = new Set();

// ---------- outbound ----------

const snapshotTime = () => (audio.src ? audio.currentTime : restoredTime) || 0;
const publicState = () => ({ ...state, currentTime: snapshotTime() });

function post(msg) {
  for (const p of ports) {
    try { p.postMessage(msg); } catch { ports.delete(p); }
  }
}

let persistTimer = 0;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const { track, queue, index, volume, muted, mode, page, pages, duration } = state;
    saveSnapshot({ track, queue, index, volume, muted, mode, page, pages, duration, currentTime: snapshotTime() });
  }, 400);
}

function emitState() {
  post({ type: 'state', state: publicState() });
  persist();
  updateMediaSession();
}

function emitLyrics() {
  post({ type: 'lyrics', ...lyrics });
}

const toast = (text) => post({ type: 'toast', text });

// ---------- loading ----------

async function loadLyrics(track) {
  const key = trackKey(track);
  if (lyrics.key === key) return;
  const provider = providers[track.source];
  if (!provider?.getLyric) {
    lyrics = { key, lines: [], loading: false };
    emitLyrics();
    return;
  }
  lyrics = { key, lines: [], loading: true };
  emitLyrics();
  let lines = [];
  try {
    lines = parseLrc(await provider.getLyric(track));
  } catch (e) {
    console.warn('[player] lyric failed', e);
  }
  if (lyrics.key !== key) return;
  lyrics = { key, lines, loading: false };
  emitLyrics();
}

async function loadTrack(track, { autoplay = true, startAt = 0, page = 0 } = {}) {
  const token = ++loadToken;
  const sameTrack = trackKey(track) === trackKey(state.track);
  Object.assign(state, {
    track, page, error: '', loading: true, embed: false,
    pages: sameTrack ? state.pages : track.pages || null,
    duration: track.duration || 0
  });
  audio.pause();
  pendingSeek = startAt;
  restoredTime = startAt;
  emitState();
  loadLyrics(track);

  const provider = providers[track.source];
  try {
    if (!provider) throw new Error('不支持的来源');
    if (provider.getPages && !state.pages) {
      state.pages = await provider.getPages(track).catch(() => null);
      if (token !== loadToken) return;
      if (state.pages?.length > 1) emitState();
    }
    const src = await provider.getStreamUrl({ ...track, pages: state.pages || undefined }, { page });
    if (token !== loadToken) return;
    if (!src) throw new Error(track.vip ? 'VIP / 付费歌曲' : '没有可用的播放地址');

    if (typeof src === 'object' && src.embed) {
      playEmbed(src.embed);
      return;
    }
    stopEmbed();
    audio.src = src;
    if (autoplay) await audio.play();
    else { state.loading = false; emitState(); }
  } catch (e) {
    if (token !== loadToken || e.name === 'AbortError') return;
    onLoadFailed(e, autoplay);
  }
}

function onLoadFailed(e, autoplay = true) {
  const token = loadToken;
  console.warn('[player] load failed', state.track?.source, state.track?.id, e);
  Object.assign(state, { loading: false, playing: false, error: friendlyError(e) });
  emitState();
  toast(`《${state.track?.name || '未知'}》无法播放：${state.error}`);
  const n = state.queue.length;
  if (autoplay && n > 1 && ++failStreak < Math.min(5, n)) {
    setTimeout(() => { if (token === loadToken) next({ auto: true }); }, 900);
  }
}

function playEmbed(url) {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  yt.src = url;
  Object.assign(state, { embed: true, playing: true, loading: false, duration: 0 });
  failStreak = 0;
  emitState();
}

function stopEmbed() {
  if (yt.getAttribute('src') && yt.getAttribute('src') !== 'about:blank') yt.src = 'about:blank';
}

// ---------- queue ----------

function playIndex(i, opts) {
  if (i < 0 || i >= state.queue.length) return;
  state.index = i;
  loadTrack(state.queue[i], opts);
}

function next({ auto = false } = {}) {
  const n = state.queue.length;
  if (!n) return;
  let i;
  if (state.mode === 'shuffle' && n > 1) {
    do { i = Math.floor(Math.random() * n); } while (i === state.index);
  } else {
    i = state.index + 1;
    if (i >= n) {
      if (auto && state.mode === 'list') {
        state.playing = false;
        emitState();
        return;
      }
      i = 0;
    }
  }
  playIndex(i);
}

function prev() {
  if (audio.src && audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const n = state.queue.length;
  if (!n) return;
  playIndex((state.index - 1 + n) % n);
}

function onEnded() {
  if (state.mode === 'one') {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }
  if (state.pages?.length > 1 && state.page + 1 < state.pages.length) {
    loadTrack(state.track, { page: state.page + 1 });
    return;
  }
  next({ auto: true });
}

// ---------- commands ----------

function resume() {
  if (state.embed) {
    stopEmbed();
    state.playing = false;
    state.embed = false;
    emitState();
    return;
  }
  if (!audio.src) {
    if (state.track) loadTrack(state.track, { startAt: restoredTime, page: state.page });
    return;
  }
  audio.play().catch((e) => { if (e.name !== 'AbortError') onLoadFailed(e, false); });
}

const handlers = {
  play({ queue, index = 0 }) {
    state.queue = (queue || []).slice(0, QUEUE_MAX);
    failStreak = 0;
    playIndex(Math.min(index, state.queue.length - 1));
  },
  playNext({ track }) {
    if (!track) return;
    const key = trackKey(track);
    const existing = state.queue.findIndex((t) => trackKey(t) === key);
    if (existing >= 0) {
      state.queue.splice(existing, 1);
      if (existing < state.index) state.index--;
    }
    if (!state.track) {
      state.queue.unshift(track);
      playIndex(0);
      return;
    }
    state.queue.splice(state.index + 1, 0, track);
    emitState();
    toast(`已添加到下一首播放`);
  },
  toggle() {
    if (state.playing || (audio.src && !audio.paused)) {
      if (state.embed) resume();
      else audio.pause();
    } else resume();
  },
  pause() { audio.pause(); },
  next() { failStreak = 0; next(); },
  prev() { failStreak = 0; prev(); },
  seek({ time }) {
    if (!audio.src) {
      restoredTime = time;
      emitState();
      return;
    }
    if (Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(time, audio.duration - 0.25));
  },
  volume({ value }) {
    state.volume = Math.max(0, Math.min(1, +value));
    state.muted = false;
    audio.volume = state.volume;
    audio.muted = false;
    emitState();
  },
  mute() {
    state.muted = !state.muted;
    audio.muted = state.muted;
    emitState();
  },
  mode({ mode }) {
    state.mode = MODES.includes(mode) ? mode : MODES[(MODES.indexOf(state.mode) + 1) % MODES.length];
    emitState();
  },
  page({ index }) {
    if (state.track && state.pages?.[index]) loadTrack(state.track, { page: index });
  },
  queuePlay({ index }) { failStreak = 0; playIndex(index); },
  queueRemove({ index }) {
    if (index === state.index) return;
    state.queue.splice(index, 1);
    if (index < state.index) state.index--;
    emitState();
  },
  queueClear() {
    state.queue = state.track ? [state.track] : [];
    state.index = state.track ? 0 : -1;
    emitState();
  }
};

async function handle(msg) {
  await ready;
  const fn = handlers[msg?.type];
  if (!fn) return;
  try {
    fn(msg);
  } catch (e) {
    console.error('[player] command failed', msg.type, e);
  }
}

// ---------- audio events ----------

audio.addEventListener('loadedmetadata', () => {
  if (Number.isFinite(audio.duration)) state.duration = audio.duration;
  if (pendingSeek && Number.isFinite(audio.duration)) audio.currentTime = Math.min(pendingSeek, audio.duration - 1);
  pendingSeek = 0;
});
audio.addEventListener('durationchange', () => {
  if (Number.isFinite(audio.duration) && audio.duration !== state.duration) {
    state.duration = audio.duration;
    emitState();
  }
});
audio.addEventListener('playing', () => {
  failStreak = 0;
  Object.assign(state, { playing: true, loading: false, error: '' });
  emitState();
});
audio.addEventListener('pause', () => {
  if (!state.playing) return;
  state.playing = false;
  emitState();
});
audio.addEventListener('waiting', () => {
  if (state.loading) return;
  state.loading = true;
  emitState();
});
audio.addEventListener('canplay', () => {
  if (!state.loading || !audio.paused) return;
  state.loading = false;
  emitState();
});
let lastPersist = 0;
audio.addEventListener('timeupdate', () => {
  if (!ports.size && Date.now() - lastPersist < 10000) return;
  post({ type: 'time', currentTime: audio.currentTime, duration: state.duration });
  if (Date.now() - lastPersist > 10000) {
    lastPersist = Date.now();
    persist();
  }
  if ('setPositionState' in navigator.mediaSession && state.duration) {
    try {
      navigator.mediaSession.setPositionState({ duration: state.duration, position: Math.min(audio.currentTime, state.duration), playbackRate: 1 });
    } catch { /* ignore */ }
  }
});
audio.addEventListener('ended', onEnded);
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src') || state.embed) return;
  const code = audio.error?.code;
  onLoadFailed(new Error(code === 4 ? '音频格式不支持或地址已失效' : '音频加载失败'));
});

// ---------- media session ----------

function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const t = state.track;
  try {
    navigator.mediaSession.metadata = t
      ? new MediaMetadata({
        title: t.name,
        artist: (t.artists || []).join(' / '),
        album: t.album || '',
        artwork: t.cover ? [{ src: t.cover, sizes: '150x150' }] : []
      })
      : null;
    navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
  } catch { /* ignore */ }
}

for (const [action, fn] of [
  ['play', () => resume()],
  ['pause', () => audio.pause()],
  ['previoustrack', () => prev()],
  ['nexttrack', () => next()],
  ['seekto', (d) => handlers.seek({ time: d.seekTime })]
]) {
  try { navigator.mediaSession.setActionHandler(action, fn); } catch { /* unsupported */ }
}

// ---------- wiring ----------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'mf-player') return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener(handle);
  ready.then(() => {
    port.postMessage({ type: 'state', state: publicState() });
    port.postMessage({ type: 'lyrics', ...lyrics });
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.channel !== CMD) return false;
  handle(msg).then(() => sendResponse({ ok: true }));
  return true;
});

const ready = (async () => {
  const snap = await loadSnapshot();
  if (snap) {
    Object.assign(state, {
      track: snap.track || null, queue: snap.queue || [], index: snap.index ?? -1,
      volume: snap.volume ?? 0.8, muted: !!snap.muted, mode: snap.mode || 'list',
      page: snap.page || 0, pages: snap.pages || null, duration: snap.duration || 0
    });
    restoredTime = snap.currentTime || 0;
  }
  audio.volume = state.volume;
  audio.muted = state.muted;
  if (state.track) loadLyrics(state.track);
})();

ready.then(() => chrome.runtime.sendMessage({ channel: READY }).catch(() => {}));
