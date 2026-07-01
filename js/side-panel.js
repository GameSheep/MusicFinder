/**
 * MusicFinder — Side Panel (Lyrics Display)
 * Listens for lyrics updates from the offscreen player.
 */

(function () {
  'use strict';

  const titleEl = document.getElementById('songTitle');
  const lyricEl = document.getElementById('lyricText');

  const DEFAULT_TITLE = 'MusicFinder';
  const DEFAULT_LYRIC = 'No lyrics available';

  if (titleEl) titleEl.textContent = DEFAULT_TITLE;
  if (lyricEl) lyricEl.textContent = DEFAULT_LYRIC;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'lyrics' && msg.store_info) {
      const { title, message } = msg.store_info;
      if (titleEl) titleEl.textContent = title || DEFAULT_TITLE;
      if (lyricEl) {
        lyricEl.textContent = message || DEFAULT_LYRIC;
        lyricEl.classList.add('mf-lyric-line--active');
      }
    }
    if (msg.action === 'lyrics-off') {
      if (titleEl) titleEl.textContent = DEFAULT_TITLE;
      if (lyricEl) {
        lyricEl.textContent = DEFAULT_LYRIC;
        lyricEl.classList.remove('mf-lyric-line--active');
      }
    }
  });
})();
