/**
 * MusicFinder — Podcast Search & UI
 * Handles podcast tab: search iTunes, browse albums, list episodes, play.
 */

const Podcast = (() => {
  // IndexedDB for podcast state persistence
  const DB_NAME = 'mf_podcast';
  const DB_VERSION = 1;
  const STORE = 'podcasts';
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'type' });
        req.result.objectStoreNames.contains(STORE) || req.result.createObjectStore(STORE, { keyPath: 'type' });
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function saveToDB(type, data) {
    if (!db) return;
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ type, ...data });
  }

  function loadFromDB(type) {
    return new Promise((resolve) => {
      if (!db) return resolve(null);
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(type);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  // --- State ---
  let albums = [];
  let episodes = [];
  let currentEpisodeIndex = 0;

  // --- DOM refs ---
  function getDom() {
    return {
      search: document.getElementById('podcastSearch'),
      albumGrid: document.getElementById('podcastAlbumGrid'),
      episodeList: document.getElementById('podcastEpisodeList')
    };
  }

  // --- Render ---
  function renderAlbums(results) {
    const { albumGrid } = getDom();
    if (!results || !results.length) {
      albumGrid.innerHTML = '<div class="mf-empty-state"><p>No podcasts found</p></div>';
      return;
    }
    albums = results;
    albumGrid.innerHTML = results.map((a, i) => `
      <div class="mf-podcast-card" data-index="${i}">
        <img src="${a.cover || ''}" alt="" loading="lazy" onerror="this.src='img/icon128.png'">
        <div class="mf-podcast-info">
          <p class="mf-podcast-name">${Utils.escapeHtml(a.name)}</p>
          <span class="mf-podcast-artist">${Utils.escapeHtml(a.artist || '')}</span>
        </div>
      </div>
    `).join('');

    albumGrid.querySelectorAll('.mf-podcast-card').forEach(card => {
      card.addEventListener('click', () => loadEpisodes(+card.dataset.index));
    });
  }

  async function loadEpisodes(index) {
    const { episodeList } = getDom();
    const album = albums[index];
    if (!album || !album.feedUrl) return;

    episodeList.innerHTML = '<li class="mf-loading">Loading episodes...</li>';

    try {
      episodes = await ItunesAPI.getEpisodes(album.feedUrl);
      if (!episodes.length) {
        episodeList.innerHTML = '<li class="mf-empty-state">No episodes found</li>';
        return;
      }
      renderEpisodes();
    } catch (e) {
      episodeList.innerHTML = '<li class="mf-error">Failed to load episodes</li>';
    }
  }

  function renderEpisodes() {
    const { episodeList } = getDom();
    episodeList.innerHTML = episodes.map((ep, i) => `
      <li class="mf-episode-item" data-index="${i}">
        <div class="mf-episode-info">
          <span class="mf-episode-title">${Utils.escapeHtml(ep.title)}</span>
          <span class="mf-episode-meta">${Utils.escapeHtml(ep.pubDate || '')} · ${ep.duration ? Math.floor(ep.duration / 60) + ' min' : ''}</span>
        </div>
        <button class="mf-action-btn mf-play-btn" data-index="${i}">▶</button>
      </li>
    `).join('');

    episodeList.querySelectorAll('.mf-play-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentEpisodeIndex = +btn.dataset.index;
        playEpisode(currentEpisodeIndex);
      });
    });
  }

  function playEpisode(index) {
    const ep = episodes[index];
    if (!ep || !ep.url) return;

    const port = chrome.runtime.connect({ name: 'offscreen' });
    port.postMessage({
      type: 'podcast',
      url: ep.url,
      name: ep.title,
      episodes,
      index
    });

    saveToDB('lastPodcast', { albums, episodeIndex: index });
  }

  // --- Search ---
  async function search() {
    const { search, albumGrid, episodeList } = getDom();
    const term = search.value.trim();
    if (!term) return;

    albumGrid.innerHTML = '<div class="mf-loading">Searching podcasts...</div>';
    episodeList.innerHTML = '';

    try {
      const data = await ItunesAPI.search(term);
      renderAlbums(data.results || []);
      saveToDB('lastSearch', { term, results: data.results || [] });
    } catch (e) {
      albumGrid.innerHTML = '<div class="mf-error">Search failed</div>';
    }
  }

  // --- Init ---
  async function init() {
    await openDB();
    const { search } = getDom();
    if (search) {
      search.addEventListener('keydown', e => {
        if (e.key === 'Enter') search();
      });
      search.addEventListener('search', search); // clear button
    }

    // Restore previous state
    const saved = await loadFromDB('lastSearch');
    if (saved && saved.results) {
      renderAlbums(saved.results);
    }
  }

  return { init, search, renderAlbums, loadEpisodes, playEpisode };
})();
