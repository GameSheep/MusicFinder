/**
 * Side panel: large synced lyrics + transport controls.
 */

import { PlayerClient } from './shared/player-client.js';
import { getSettings } from './shared/library.js';
import { esc, fmtTime, trackKey } from './shared/util.js';
import { sourceName } from './providers/index.js';

const $ = (id) => document.getElementById(id);
const el = Object.fromEntries(['bg', 'cover', 'title', 'sub', 'lyrics', 'cur', 'seek', 'dur', 'prev', 'play', 'next'].map((id) => [id, $(id)]));
const player = new PlayerClient();

let coverKey = null;
let times = [];
let idx = -1;
let seeking = false;

function paint(r) {
  r.style.setProperty('--p', (r.value / r.max) * 100 + '%');
}

function renderState() {
  const s = player.state;
  const t = s.track;
  el.play.querySelector('use').setAttribute('href', s.playing ? '#i-pause' : '#i-play');
  for (const b of [el.prev, el.next, el.play]) b.disabled = !t;

  const key = trackKey(t);
  if (key !== coverKey) {
    coverKey = key;
    el.title.textContent = t?.name || '未在播放';
    el.sub.textContent = t ? [(t.artists || []).join(' / '), sourceName(t.source)].filter(Boolean).join(' · ') : '在弹窗中选择歌曲开始播放';
    el.cover.innerHTML = t?.cover
      ? `<img src="${esc(t.cover)}" alt="" referrerpolicy="no-referrer">`
      : '<svg class="i"><use href="#i-music"/></svg>';
    el.bg.style.backgroundImage = t?.cover ? `url("${t.cover.replace(/"/g, '%22')}")` : 'none';
  }
  renderTime();
}

function renderTime() {
  const { currentTime = 0, duration = 0, embed } = player.state;
  const live = !duration || embed;
  el.seek.disabled = live;
  if (!seeking) {
    el.seek.value = live ? 0 : Math.round((currentTime / duration) * 1000);
    paint(el.seek);
    el.cur.textContent = fmtTime(currentTime);
  }
  el.dur.textContent = live ? (embed ? '外部播放' : '直播') : fmtTime(duration);
  syncLyric(currentTime);
}

function renderLyrics() {
  const { lines, loading } = player.lyrics;
  times = lines.map((l) => l.t);
  idx = -1;
  if (!player.state.track) el.lyrics.innerHTML = '<p class="empty">还没有播放</p>';
  else if (loading) el.lyrics.innerHTML = '<p class="empty">歌词加载中…</p>';
  else if (!lines.length) el.lyrics.innerHTML = '<p class="empty">暂无歌词</p>';
  else el.lyrics.innerHTML = lines.map((l, i) => `<p class="lyric" data-i="${i}">${esc(l.text)}</p>`).join('');
  el.lyrics.scrollTop = 0;
  syncLyric(player.state.currentTime || 0, true);
}

function syncLyric(time, force = false) {
  if (!times.length) return;
  let lo = 0, hi = times.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time + 0.15) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (found === idx && !force) return;
  el.lyrics.children[idx]?.classList.remove('is-on');
  idx = found;
  const line = el.lyrics.children[idx];
  if (!line) return;
  line.classList.add('is-on');
  el.lyrics.scrollTo({ top: line.offsetTop - el.lyrics.clientHeight / 2 + line.offsetHeight / 2, behavior: force ? 'auto' : 'smooth' });
}

el.play.addEventListener('click', () => player.send('toggle'));
el.prev.addEventListener('click', () => player.send('prev'));
el.next.addEventListener('click', () => player.send('next'));
el.seek.addEventListener('input', () => {
  seeking = true;
  paint(el.seek);
  el.cur.textContent = fmtTime((el.seek.value / 1000) * (player.state.duration || 0));
});
el.seek.addEventListener('change', () => {
  seeking = false;
  player.send('seek', { time: (el.seek.value / 1000) * (player.state.duration || 0) });
});
el.lyrics.addEventListener('click', (e) => {
  const line = e.target.closest('.lyric');
  if (line) player.send('seek', { time: times[+line.dataset.i] });
});

let lyricKey = null;
player.on('state', () => {
  renderState();
  if (player.lyrics.key !== lyricKey) { lyricKey = player.lyrics.key; renderLyrics(); }
});
player.on('time', renderTime);
player.on('lyrics', () => { lyricKey = player.lyrics.key; renderLyrics(); });

getSettings().then((s) => document.documentElement.style.setProperty('--accent', s.theme));
player.init().then(() => { renderState(); renderLyrics(); });
