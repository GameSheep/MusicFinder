/**
 * Popup entry: boot shared context, wire views, global shortcuts.
 */

import { app } from './app.js';
import { $, $$, toast, installImageFallback } from './dom.js';
import { initMusic, musicView } from './music.js';
import { initNowPlaying, closeSheet, isSheetOpen, togglePlay } from './now-playing.js';
import { initRadio } from './radio.js';
import { initPodcast, podcastView } from './podcast.js';

let view = 'music';

function showView(name) {
  view = name;
  $$('#viewNav [data-view]').forEach((b) => {
    b.classList.toggle('is-on', b.dataset.view === name);
    b.setAttribute('aria-selected', String(b.dataset.view === name));
  });
  $$('.views > .view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === name));
  chrome.storage.session?.set({ mf_view: name }).catch(() => {});
}

const isTyping = (e) => e.target.matches?.('input, textarea, select, [contenteditable="true"]');

function onKey(e) {
  if (e.key === 'Escape') {
    if (isSheetOpen()) { closeSheet(); e.preventDefault(); return; }
    if (isTyping(e)) return;
    if (view === 'music' && musicView.back()) e.preventDefault();
    else if (view === 'podcast' && podcastView.back()) e.preventDefault();
    return;
  }
  if (isTyping(e)) return;
  if (e.key === ' ' && !e.target.closest?.('button')) {
    e.preventDefault();
    togglePlay();
  } else if (e.key === '/' && !isSheetOpen()) {
    e.preventDefault();
    if (view !== 'music') showView('music');
    musicView.focusSearch();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
    e.preventDefault();
    app.player.send('next');
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
    e.preventDefault();
    app.player.send('prev');
  }
}

async function boot() {
  await app.init();
  installImageFallback();

  const { mf_view } = (await chrome.storage.session?.get('mf_view').catch(() => ({}))) || {};
  if (mf_view && mf_view !== 'music') showView(mf_view);

  await app.player.init();
  initNowPlaying();
  await Promise.all([initMusic(), initRadio(), initPodcast()]);

  $('#viewNav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b && b.dataset.view !== view) showView(b.dataset.view);
  });
  $('#btnOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.addEventListener('keydown', onKey);
}

boot().catch((e) => {
  console.error(e);
  toast('初始化失败：' + (e?.message || e), 10000);
});
