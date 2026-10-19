/**
 * Podcast view: iTunes directory search → show → episodes.
 */

import podcast from '../providers/podcast.js';
import { esc, friendlyError } from '../shared/util.js';
import { app } from './app.js';
import { $, icon, coverHtml, trackRow, stateHtml, skeletonHtml, markCurrent, markFavs } from './dom.js';

const el = {};
let shows = [];
let term = '';
let show = null;       // selected show
let episodes = [];
let token = 0;
let showsScroll = 0;

function renderShows() {
  el.head.innerHTML = term && shows.length ? `<div class="head-row"><span class="head-title"><b>${esc(term)}</b> · ${shows.length} 个节目</span></div>` : '';
  if (!term) {
    el.body.innerHTML = stateHtml({ icon: 'search', title: '搜索播客', text: '数据来自 Apple Podcasts 目录，点击节目即可浏览并连续播放单集' });
    return;
  }
  if (!shows.length) {
    el.body.innerHTML = stateHtml({ icon: 'search', title: '没有找到节目', text: '换个关键词试试' });
    return;
  }
  el.body.innerHTML = `<ul class="list">${shows.map((s, i) => `
    <li class="row" data-show="${i}">
      ${coverHtml(s.cover, 'podcast', '', s.name.slice(0, 1))}
      <div class="row-main">
        <div class="row-title"><span class="t">${esc(s.name)}</span></div>
        <div class="row-sub">${esc([s.author, s.genre, s.count ? `${s.count} 集` : ''].filter(Boolean).join(' · '))}</div>
      </div>
      <span class="row-chev">${icon('chevron-right')}</span>
    </li>`).join('')}</ul>`;
}

function renderEpisodes() {
  el.head.innerHTML = `
    <div class="up-head">
      <button type="button" class="ibtn" data-act="back" title="返回">${icon('chevron-left')}</button>
      ${coverHtml(show.cover, 'podcast', 'md', show.name.slice(0, 1))}
      <div class="up-meta"><div class="up-name">${esc(show.name)}</div><div class="up-sub">${esc(show.author)}${episodes.length ? ` · ${episodes.length} 集` : ''}</div></div>
      ${episodes.length ? `<button type="button" class="btn primary sm" data-act="playall">${icon('play')}播放</button>` : ''}
    </div>`;
  el.body.innerHTML = `<ul class="list" id="episodeList">${episodes.map((t, i) =>
    trackRow(t, i, { favKeys: app.favKeys, currentKey: app.currentKey })
  ).join('')}</ul>`;
}

async function search(q) {
  term = q;
  show = null;
  const my = ++token;
  el.head.innerHTML = '';
  el.body.innerHTML = skeletonHtml(6);
  try {
    shows = await podcast.searchShows(q);
    if (my !== token) return;
    renderShows();
    chrome.storage.local.set({ mf_podcast: { term, shows } });
  } catch (e) {
    if (my !== token) return;
    el.body.innerHTML = stateHtml({ icon: 'alert', cls: 'error', title: '搜索失败', text: esc(friendlyError(e)) });
  }
}

async function openShow(s) {
  showsScroll = el.scroller.scrollTop;
  show = s;
  episodes = [];
  const my = ++token;
  renderEpisodes();
  el.body.innerHTML = skeletonHtml(6);
  el.scroller.scrollTop = 0;
  try {
    episodes = await podcast.getEpisodes(s);
    if (my !== token) return;
    renderEpisodes();
    if (!episodes.length) el.body.innerHTML = stateHtml({ icon: 'music', title: '这个节目还没有可播放的单集' });
  } catch (e) {
    if (my !== token) return;
    el.body.innerHTML = stateHtml({ icon: 'alert', cls: 'error', title: '单集加载失败', text: esc(friendlyError(e)), action: '<button type="button" class="btn primary sm" data-act="reopen">重试</button>' });
  }
}

function back() {
  if (!show) return false;
  token++;
  show = null;
  renderShows();
  el.scroller.scrollTop = showsScroll;
  return true;
}

export async function initPodcast() {
  Object.assign(el, { body: $('#podcastBody'), head: $('#podcastHead'), scroller: $('#podcastScroller'), q: $('#podcastQ') });

  const { mf_podcast } = await chrome.storage.local.get('mf_podcast');
  if (mf_podcast?.term) {
    term = mf_podcast.term;
    shows = mf_podcast.shows || [];
    el.q.value = term;
  }
  renderShows();

  $('#podcastForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = el.q.value.trim();
    if (q) { el.q.blur(); search(q); }
  });

  el.head.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') back();
    else if (act === 'playall' && episodes.length) app.play(episodes, 0);
  });

  el.body.addEventListener('click', (e) => {
    const s = e.target.closest('[data-show]');
    if (s) return openShow(shows[+s.dataset.show]);
    if (e.target.closest('[data-act="reopen"]') && show) return openShow(show);
    const row = e.target.closest('.row[data-key]');
    if (!row) return;
    const i = +row.dataset.i;
    const t = episodes[i];
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'fav') return app.toggleFav(t);
    if (act === 'open') return app.openPage(t);
    if (act === 'next') return app.playNext(t);
    app.play(episodes, i);
  });

  app.on('track', (key) => { const l = $('#episodeList'); if (l) markCurrent(l, key); });
  app.on('favorites', () => { const l = $('#episodeList'); if (l) markFavs(l, app.favKeys); });
}

export const podcastView = { back };
