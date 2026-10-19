/**
 * Mini player bar + full "now playing" sheet (lyrics, queue, Bilibili parts).
 */

import { esc, fmtTime, trackKey } from '../shared/util.js';
import { providers, sourceName } from '../providers/index.js';
import { app } from './app.js';
import { $, $$, coverHtml, trackRow, stateHtml, markCurrent, markFavs } from './dom.js';

const MODE_META = {
  list: { icon: 'order', label: '顺序播放' },
  loop: { icon: 'repeat', label: '列表循环' },
  one: { icon: 'repeat-1', label: '单曲循环' },
  shuffle: { icon: 'shuffle', label: '随机播放' }
};

const el = {};
let lastKey = '';
let lastCoverKey = null;
let lyricKey = null;
let lyricTimes = [];
let lyricIdx = -1;
let seeking = false;
let tab = 'lyrics';
let queueSig = '';
let pagesSig = '';
let open = false;

const setIcon = (btn, name) => btn.querySelector('use').setAttribute('href', `#i-${name}`);
const player = () => app.player;
const st = () => app.player.state;

// ---------------------------------------------------------------- render

function renderState() {
  const s = st();
  const t = s.track;
  const key = trackKey(t);

  document.body.classList.toggle('is-playing', !!s.playing);
  for (const b of [el.miniPlay, el.npPlay]) {
    setIcon(b, s.playing ? 'pause' : 'play');
    b.classList.toggle('is-loading', !!s.loading);
  }

  if (key !== lastKey) {
    lastKey = key;
    app.emit('track', key);
  }

  if (key !== lastCoverKey) {
    lastCoverKey = key;
    const ph = `<svg class="i"><use href="#i-music"/></svg>`;
    swapCover(el.miniCover, t, '', ph);
    swapCover(el.npCover, t, 'xl', ph);
    el.sheetBg.style.backgroundImage = t?.cover ? `url("${t.cover.replace(/"/g, '%22')}")` : 'none';
    el.miniTitle.textContent = t?.name || '未在播放';
    el.npTitle.textContent = t?.name || '未在播放';
    el.npTitle.title = t?.name || '';
    const artists = (t?.artists || []).join(' / ');
    el.npArtist.textContent = artists;
    el.sheetSrc.textContent = t ? `正在播放 · ${providers[t.source]?.name || sourceName(t.source)}` : '正在播放';
    el.npTags.innerHTML = t ? [
      `<span class="tag src" style="--c:${providers[t.source]?.color || '#888'}">${esc(sourceName(t.source))}</span>`,
      t.vip ? '<span class="tag">VIP</span>' : '',
      t.preview ? '<span class="tag ok">30 秒试听</span>' : ''
    ].join('') : '';
    el.btnOpenPage.disabled = !providers[t?.source]?.pageUrl?.(t);
    renderFav();
  }

  const sub = s.error ? `⚠ ${s.error}` : t ? [(t.artists || []).join(' / '), sourceName(t.source)].filter(Boolean).join(' · ') : '搜一首歌开始吧';
  if (el.miniSub.textContent !== sub) el.miniSub.textContent = sub;

  const m = MODE_META[s.mode] || MODE_META.list;
  setIcon(el.npMode, m.icon);
  el.npMode.title = m.label;
  el.npMode.classList.toggle('is-active', s.mode !== 'list');

  setIcon(el.npMute, s.muted || s.volume === 0 ? 'volume-x' : 'volume');
  if (document.activeElement !== el.npVol) {
    el.npVol.value = Math.round((s.muted ? 0 : s.volume) * 100);
    paintRange(el.npVol);
  }

  const hasTrack = !!t;
  for (const b of [el.miniPrev, el.miniNext, el.npPrev, el.npNext]) b.disabled = !hasTrack || s.queue.length < 1;
  el.npSeek.disabled = !s.duration || s.embed;

  renderTime();
  renderQueueIfNeeded();
  renderPagesIfNeeded();
}

function swapCover(box, t, cls, ph) {
  const tmp = document.createElement('div');
  tmp.innerHTML = t ? coverHtml(t.cover, t.source, cls) : `<div class="cover ph ${cls}">${ph}</div>`;
  const next = tmp.firstElementChild;
  next.id = box.id;
  box.replaceWith(next);
  el[box.id] = next;
}

function renderFav() {
  const on = app.favKeys.has(lastKey);
  el.npFav.classList.toggle('is-on', on);
  el.npFav.title = on ? '取消收藏' : '收藏';
  el.npFav.disabled = !st().track || st().track.source === 'local';
}

function paintRange(r) {
  const pct = r.max > 0 ? ((r.value - r.min) / (r.max - r.min)) * 100 : 0;
  r.style.setProperty('--p', pct + '%');
}

function renderTime() {
  const { currentTime = 0, duration = 0, embed } = st();
  const live = !duration || embed;
  el.miniBar.style.transform = `scaleX(${live ? 0 : Math.min(1, currentTime / duration)})`;
  if (!open) return;
  if (!seeking) {
    el.npSeek.value = live ? 0 : Math.round((currentTime / duration) * 1000);
    paintRange(el.npSeek);
    el.npCur.textContent = fmtTime(currentTime);
  }
  el.npDur.textContent = live ? (embed ? '外部播放' : '直播') : fmtTime(duration);
  syncLyric(currentTime);
}

// ---------------------------------------------------------------- lyrics

function renderLyrics() {
  const { key, lines, loading } = player().lyrics;
  lyricKey = key;
  lyricIdx = -1;
  lyricTimes = lines.map((l) => l.t);
  if (!st().track) {
    el.lyrics.innerHTML = stateHtml({ icon: 'music', title: '还没有播放', text: '在列表中点击任意歌曲开始播放' });
  } else if (loading) {
    el.lyrics.innerHTML = '<div class="state"><div class="spinner"></div></div>';
  } else if (!lines.length) {
    el.lyrics.innerHTML = stateHtml({ icon: 'music', title: '暂无歌词', text: esc(st().track.name) });
  } else {
    el.lyrics.innerHTML = lines.map((l, i) => `<p class="lyric" data-i="${i}">${esc(l.text)}</p>`).join('');
  }
  el.lyrics.scrollTop = 0;
  syncLyric(st().currentTime || 0, true);
}

function syncLyric(time, force = false) {
  if (!lyricTimes.length || tab !== 'lyrics' || !open) return;
  let lo = 0;
  let hi = lyricTimes.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lyricTimes[mid] <= time + 0.15) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (idx === lyricIdx && !force) return;
  el.lyrics.children[lyricIdx]?.classList.remove('is-on');
  lyricIdx = idx;
  const line = el.lyrics.children[idx];
  if (!line) return;
  line.classList.add('is-on');
  el.lyrics.scrollTo({
    top: line.offsetTop - el.lyrics.clientHeight / 2 + line.offsetHeight / 2,
    behavior: force ? 'auto' : 'smooth'
  });
}

// ---------------------------------------------------------------- queue & pages

function renderQueueIfNeeded(force = false) {
  const { queue, index } = st();
  el.queueCount.textContent = queue.length ? queue.length : '';
  if (tab !== 'queue' || !open) return;
  const sig = queue.length + '|' + queue.map(trackKey).join(',');
  if (sig === queueSig && !force) {
    markCurrent(el.queueList, lastKey);
    return;
  }
  queueSig = sig;
  el.queueInfo.textContent = queue.length ? `共 ${queue.length} 首 · 当前第 ${index + 1} 首` : '';
  el.queueList.innerHTML = queue.length
    ? queue.map((t, i) => trackRow(t, i, { favKeys: app.favKeys, currentKey: lastKey, removable: i !== index, noQueue: true, index: true })).join('')
    : `<li>${stateHtml({ icon: 'queue', title: '播放列表为空' })}</li>`;
  el.queueList.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
}

function renderPagesIfNeeded() {
  const { pages, page, track } = st();
  const multi = pages?.length > 1;
  el.tabPages.hidden = !multi;
  el.pageCount.textContent = multi ? pages.length : '';
  if (!multi && tab === 'pages') switchTab('lyrics');
  if (!multi || tab !== 'pages' || !open) return;
  const sig = trackKey(track) + '|' + page;
  if (sig === pagesSig) return;
  pagesSig = sig;
  el.pageList.innerHTML = pages.map((p, i) => `
    <li class="row${i === page ? ' is-current' : ''}" data-page="${i}">
      <span class="idx">P${i + 1}</span>
      <div class="row-main"><div class="row-title"><span class="t">${esc(p.part || `第 ${i + 1} P`)}</span></div></div>
      <span class="dur">${fmtTime(p.duration)}</span>
    </li>`).join('');
  el.pageList.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
}

function switchTab(name) {
  tab = name;
  $$('#npTabs button').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === name));
  $$('.np-panel').forEach((p) => p.classList.toggle('is-on', p.dataset.tab === name));
  if (name === 'queue') renderQueueIfNeeded(true);
  if (name === 'pages') { pagesSig = ''; renderPagesIfNeeded(); }
  if (name === 'lyrics') syncLyric(st().currentTime || 0, true);
}

// ---------------------------------------------------------------- sheet

export function openSheet() {
  open = true;
  el.sheet.classList.add('is-open');
  el.sheet.setAttribute('aria-hidden', 'false');
  queueSig = '';
  pagesSig = '';
  renderTime();
  if (tab === 'queue') renderQueueIfNeeded(true);
  if (tab === 'pages') renderPagesIfNeeded();
  syncLyric(st().currentTime || 0, true);
}

export function closeSheet() {
  if (!open) return false;
  open = false;
  el.sheet.classList.remove('is-open');
  el.sheet.setAttribute('aria-hidden', 'true');
  return true;
}

export const isSheetOpen = () => open;

export const togglePlay = () => { if (st().track) player().send('toggle'); };

// ---------------------------------------------------------------- init

export function initNowPlaying() {
  for (const id of ['miniBar', 'miniOpen', 'miniCover', 'miniTitle', 'miniSub', 'miniPrev', 'miniPlay', 'miniNext',
    'sheet', 'sheetBg', 'sheetClose', 'sheetSrc', 'btnSidePanel', 'btnOpenPage', 'npCover', 'npTitle', 'npArtist',
    'npTags', 'npFav', 'tabPages', 'pageCount', 'queueCount', 'queueInfo', 'queueClear', 'queueList', 'pageList',
    'lyrics', 'npCur', 'npSeek', 'npDur', 'npMode', 'npPrev', 'npPlay', 'npNext', 'npMute', 'npVol']) {
    el[id] = document.getElementById(id);
  }

  const p = player();
  p.on('state', () => {
    renderState();
    if (player().lyrics.key !== lyricKey) renderLyrics();
  });
  p.on('time', renderTime);
  p.on('lyrics', renderLyrics);

  el.miniOpen.addEventListener('click', openSheet);
  el.sheetClose.addEventListener('click', closeSheet);
  el.miniPlay.addEventListener('click', togglePlay);
  el.npPlay.addEventListener('click', togglePlay);
  for (const b of [el.miniPrev, el.npPrev]) b.addEventListener('click', () => p.send('prev'));
  for (const b of [el.miniNext, el.npNext]) b.addEventListener('click', () => p.send('next'));
  el.npMode.addEventListener('click', () => p.send('mode'));
  el.npMute.addEventListener('click', () => p.send('mute'));
  el.npFav.addEventListener('click', () => app.toggleFav(st().track));
  el.btnOpenPage.addEventListener('click', () => app.openPage(st().track, st().page));
  el.btnSidePanel.addEventListener('click', () => {
    if (!chrome.sidePanel?.open || app.windowId == null) return;
    chrome.sidePanel.open({ windowId: app.windowId }).catch(() => {});
  });

  el.npSeek.addEventListener('input', () => {
    seeking = true;
    paintRange(el.npSeek);
    el.npCur.textContent = fmtTime((el.npSeek.value / 1000) * (st().duration || 0));
  });
  el.npSeek.addEventListener('change', () => {
    const time = (el.npSeek.value / 1000) * (st().duration || 0);
    seeking = false;
    st().currentTime = time;
    p.send('seek', { time });
  });

  let volTimer = 0;
  el.npVol.addEventListener('input', () => {
    paintRange(el.npVol);
    clearTimeout(volTimer);
    volTimer = setTimeout(() => p.send('volume', { value: el.npVol.value / 100 }), 60);
  });

  el.lyrics.addEventListener('click', (e) => {
    const line = e.target.closest('.lyric');
    if (line && lyricTimes[+line.dataset.i] != null) p.send('seek', { time: lyricTimes[+line.dataset.i] });
  });

  $('#npTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });

  el.queueList.addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    const i = +row.dataset.i;
    const t = st().queue[i];
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'remove') return p.send('queueRemove', { index: i });
    if (act === 'fav') return app.toggleFav(t);
    if (act === 'open') return app.openPage(t);
    if (i !== st().index) p.send('queuePlay', { index: i });
  });
  el.queueClear.addEventListener('click', () => p.send('queueClear'));

  el.pageList.addEventListener('click', (e) => {
    const row = e.target.closest('[data-page]');
    if (row) p.send('page', { index: +row.dataset.page });
  });

  app.on('favorites', () => {
    renderFav();
    markFavs(el.queueList, app.favKeys);
  });

  renderState();
  renderLyrics();
}
