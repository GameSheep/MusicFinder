/**
 * MusicFinder — Popup UI Controller
 * Manages search, results, favorites, player communication, and all UI interactions.
 */

(function () {
  'use strict';

  // ==================== Constants ====================

  const SEARCH_MAX = 50;
  const SEARCH_DEFAULT = 20;
  const FAV_MAX = 40;

  const SOURCE_NAMES = {
    netease: 'NetEase', qq: 'QQ', bilibili: 'Bilibili',
    youtube: 'YouTube', xiami: 'Xiami', migu: 'Migu',
    fm: 'FM', podcast: 'Podcast', local: 'Local', whitevoice: 'White Noise'
  };

  const VIP_SOURCES = { netease: [1, 4], xiami: [1], qq: [1] };

  const NO_COLLECT = ['fm', 'podcast', 'youtube', 'local', 'whitevoice'];

  // ==================== DOM Refs ====================

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    slideMusic: $('#slideMusic'),
    slideRadio: $('#slideRadio'),
    slidePodcast: $('#slidePodcast'),
    navBtns: $$('.mf-nav-btn'),
    searchInput: $('#musicSearch'),
    searchHistory: $('#searchHistory'),
    platformTabs: $('#platformTabs'),
    musicResults: $('#musicResults'),
    resultList: $('#resultList'),
    resultsEmpty: $('#resultsEmpty'),
    biliPager: $('#bilibiliPager'),
    biliPrev: $('#biliPrev'),
    biliNext: $('#biliNext'),
    biliPageInfo: $('#biliPageInfo'),
    biliPageTitle: $('#biliPageTitle'),
    lyricsPanel: $('#lyricsPanel'),
    lyricsBody: $('#lyricsBody'),
    lyricsToggle: $('#lyricsToggle'),
    currentTime: $('#currentTime'),
    durationTime: $('#durationTime'),
    progressBar: $('#progressBar'),
    btnPlay: $('#btnPlay'),
    btnLoop: $('#btnLoop'),
    btnFavorite: $('#btnFavorite'),
    volumeSlider: $('#volumeSlider'),
    btnMute: $('#btnMute'),
    infoText: $('#playerInfo'),
    alertBox: $('.mf-alert'),
    clipModal: $('#clipModal'),
    clipClose: $('#clipModalClose'),
    clipCancel: $('#clipCancel'),
    clipConfirm: $('#clipConfirm'),
    clipStart: $('#clipStartSlider'),
    clipEnd: $('#clipEndSlider'),
    clipStartLbl: $('#clipStartLabel'),
    clipEndLbl: $('#clipEndLabel'),
    clipLyrics: $('#clipLyricsList'),
    sortBtn: $('#sortBtn'),
    podcastSearch: $('#podcastSearch'),
    podcastGrid: $('#podcastAlbumGrid'),
    podcastEpisodes: $('#podcastEpisodeList')
  };

  // ==================== State ====================

  let state = {
    activeSlide: 1,
    activePlatform: 'netease',
    searchTerm: '',
    currentSearchTab: null,
    results: [],
    favorites: [],
    currentSong: null,
    isPlaying: false,
    isFavorited: false,
    volume: 0.8,
    loopMode: 'none',
    biliPage: 0,
    biliTotal: 0,
    podcastEpisodes: [],
    podcastIndex: 0,
    searchPage: 0,
    searchHasMore: true,
    searchLoading: false,
    sortMode: 0 // 0=none, 1=asc, 2=desc
  };

  // ==================== Offscreen Port ====================

  let playerPort = null;

  async function getPlayerPort() {
    if (playerPort) return playerPort;
    // Create offscreen document if needed
    const clients = await chrome.offscreen?.hasDocument?.();
    if (!clients) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Audio playback for MusicFinder'
      });
    }
    playerPort = chrome.runtime.connect({ name: 'offscreen' });
    // Request current state from player
    playerPort.postMessage({ type: 'getState' });
    // Listen for progress & state pushed back through the port
    playerPort.onMessage.addListener(msg => {
      if (msg.state != null) {
        state.isPlaying = msg.state;
        dom.btnPlay.textContent = msg.state ? '⏸' : '▶';
        if (msg.song) {
          const dur = msg.duration || state.currentSong?.duration;
          const biliPages = msg.biliPages || state.currentSong?.biliPages;
          const biliStart = state.currentSong?.biliStart;
          state.currentSong = { name: msg.song, web: msg.web || '', cover: msg.cover || '', duration: dur, biliPages, biliStart };
        }
        // Update progress display
        if (msg.duration != null && msg.progress != null) {
          dom.progressBar.value = msg.progress;
          const dur = +msg.duration || +state.currentSong?.duration || 0;
          dom.currentTime.textContent = Utils.formatTime(msg.progress, dur);
          if (dur) {
            dom.durationTime.textContent = Utils.formatTime(100, dur);
          }
        }
        if (!msg.state) state.currentSong = null;
        updateBiliPager();
        updateFavUI();
      }
      if (msg.mf_bili_page != null && msg.mf_bili_total != null) {
        state.biliPage = msg.mf_bili_page;
        state.biliTotal = msg.mf_bili_total;
        if (msg.bili_page_title) state.biliPageTitle = msg.bili_page_title;
        if (msg.biliPages && state.currentSong) state.currentSong.biliPages = msg.biliPages;
        updateBiliPager();
      }
      if (msg.progress != null) {
        dom.progressBar.value = msg.progress;
        const dur = +msg.duration || +state.currentSong?.duration || 0;
        if (msg.duration && state.currentSong) {
          state.currentSong.duration = +msg.duration;
        }
        dom.currentTime.textContent = Utils.formatTime(msg.progress, dur);
        if (dur && dom.durationTime.textContent === '0:00') {
          dom.durationTime.textContent = Utils.formatTime(100, dur);
        }
      }
    });
    return playerPort;
  }

  function sendToPlayer(msg) {
    getPlayerPort().then(port => port.postMessage(msg));
  }

  // ==================== Alert ====================

  function flashAlert(msg, dur = 2000) {
    if (!dom.alertBox) return;
    dom.alertBox.textContent = msg;
    dom.alertBox.classList.add('show');
    clearTimeout(dom.alertBox._tid);
    dom.alertBox._tid = setTimeout(() => dom.alertBox.classList.remove('show'), dur);
  }

  // ==================== Init ====================

  async function init() {
    await restoreState();
    bindEvents();
    updatePlayUI();
    updateFavUI();
    // Init podcast tab (event bindings, restore state)
    try { if (typeof Podcast !== 'undefined') Podcast.init(); } catch (e) { console.warn('Podcast init failed:', e); }
    // Init radio tab
    try { initRadio(); } catch (e) { console.warn('Radio init failed:', e); }
    // Connect to player for live progress/duration after popup reopen
    getPlayerPort().catch(() => {});
  }

  async function restoreState() {
    const local = await chrome.storage.local.get(['mf_search_term', 'mf_search_platform', 'mf_search_results', 'mf_play', 'mf_song', 'mf_web', 'mf_cover', 'mf_duration', 'mf_progress', 'mf_bili_page', 'mf_bili_total', 'mf_bili_page_title', 'mf_bili_pages', 'volume', 'mf_history', 'mf_slide']);
    const sync = await chrome.storage.sync.get(['favorites', 'customTheme']);

    if (local.volume != null) {
      state.volume = local.volume;
      dom.volumeSlider.value = local.volume * 100;
    }
    if (local.mf_slide != null) switchSlide(local.mf_slide);

    state.favorites = sync.favorites || [];
    state.isPlaying = local.mf_play === true;
    if (local.mf_song) {
      state.currentSong = {
        name: local.mf_song,
        web: local.mf_web || '',
        cover: local.mf_cover || '',
        duration: +local.mf_duration || 0,
        biliPages: local.mf_bili_pages || undefined,
        biliStart: local.mf_bili_page || 0
      };
      state.biliPageTitle = local.mf_bili_page_title || '';
    } else {
      state.currentSong = null;
      state.biliPageTitle = '';
    }
    state.biliPage = local.mf_bili_page || 0;
    state.biliTotal = local.mf_bili_total || 0;

    // Restore progress display
    if (state.isPlaying && local.mf_progress) {
      const pct = parseFloat(local.mf_progress) || 0;
      dom.progressBar.value = pct;
      const dur = +local.mf_duration || 0;
      dom.currentTime.textContent = Utils.formatTime(pct, dur);
      if (dur) dom.durationTime.textContent = Utils.formatTime(100, dur);
    }

    if (sync.customTheme) {
      document.documentElement.style.setProperty('--accent', sync.customTheme);
    }

    // Restore last search
    if (local.mf_search_term && local.mf_search_platform) {
      state.searchTerm = local.mf_search_term;
      state.activePlatform = local.mf_search_platform;
      dom.searchInput.value = local.mf_search_term;
      activateTab(local.mf_search_platform);
      if (local.mf_search_results) {
        renderResults(local.mf_search_results);
      } else {
        doSearch();
      }
    }

    renderHistory();
  }

  // ==================== Event Binding ====================

  function bindEvents() {
    // Slide nav
    dom.navBtns.forEach(btn => btn.addEventListener('click', () => switchSlide(+btn.dataset.slide)));

    // Search
    dom.searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    dom.searchInput.addEventListener('focus', () => dom.searchHistory.hidden = false);
    dom.searchInput.addEventListener('blur', () => setTimeout(() => dom.searchHistory.hidden = true, 200));

    // Platform tabs
    dom.platformTabs.addEventListener('click', e => {
      const tab = e.target.closest('.mf-tab');
      if (!tab) return;
      activateTab(tab.dataset.platform);
    });

    // Results delegation
    dom.resultList.addEventListener('click', e => {
      const playBtn = e.target.closest('.mf-play-btn');
      const favBtn = e.target.closest('.mf-fav-btn');
      const paidBtn = e.target.closest('.mf-paid-icon');
      const openBtn = e.target.closest('.mf-open-btn');
      const rangeBtn = e.target.closest('.mf-range-btn');

      if (paidBtn) return flashAlert('VIP song — try another source');
      if (playBtn) playResult(playBtn.dataset);
      if (favBtn) toggleFav(favBtn.dataset);
      if (openBtn) openSongPage(openBtn.dataset);
      if (rangeBtn) openClipModal(rangeBtn.dataset);
    });

    // History
    dom.searchHistory.addEventListener('click', e => {
      const li = e.target.closest('li');
      if (!li) return;
      dom.searchInput.value = li.dataset.term;
      dom.searchHistory.hidden = true;
      doSearch();
    });

    // Player controls
    dom.btnPlay.addEventListener('click', togglePlay);
    dom.btnLoop.addEventListener('click', toggleLoop);
    dom.btnFavorite.addEventListener('click', () => toggleFav({
      id: state.currentSong?.id, web: state.currentSong?.web,
      name: state.currentSong?.name, artist: state.currentSong?.artist
    }));
    dom.progressBar.addEventListener('input', () => {
      const pct = dom.progressBar.value / 100;
      sendToPlayer({ position: pct });
    });
    dom.volumeSlider.addEventListener('input', () => {
      state.volume = dom.volumeSlider.value / 100;
      chrome.storage.local.set({ volume: state.volume });
    });
    dom.btnMute.addEventListener('click', () => {
      dom.volumeSlider.value = 0;
      state.volume = 0;
      chrome.storage.local.set({ volume: 0 });
    });

    // Bilibili pager
    dom.biliPrev.addEventListener('click', () => {
      if (state.biliPage > 0) sendToPlayer({ bili_switch_page: state.biliPage - 1 });
    });
    dom.biliNext.addEventListener('click', () => {
      if (state.biliPage + 1 < state.biliTotal) sendToPlayer({ bili_switch_page: state.biliPage + 1 });
    });

    // Clip modal
    dom.clipClose.addEventListener('click', closeClipModal);
    dom.clipCancel.addEventListener('click', closeClipModal);

    // Storage changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.mf_play || changes.mf_song || changes.mf_web || changes.mf_cover) updatePlayUI();
      if (changes.favorites) { state.favorites = changes.favorites.newValue || []; updateFavUI(); }
      if (changes.mf_bili_page || changes.mf_bili_total) updateBiliPager();
      if (changes.mf_progress) {
        const pct = parseFloat(changes.mf_progress.newValue) || 0;
        dom.progressBar.value = pct;
        const dur = +state.currentSong?.duration || 0;
        dom.currentTime.textContent = Utils.formatTime(pct, dur);
        if (dur && dom.durationTime.textContent === '0:00') {
          dom.durationTime.textContent = Utils.formatTime(100, dur);
        }
      }
      if (changes.mf_error && changes.mf_error.newValue) {
        flashAlert(changes.mf_error.newValue, 3000);
        chrome.storage.local.remove('mf_error');
      }
    });

    // Keyboard
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeClipModal();
    });

    // Scroll-to-load-more
    dom.musicResults.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = dom.musicResults;
      if (scrollHeight - scrollTop - clientHeight < 60) {
        loadMore();
      }
    });

    // Sort button
    dom.sortBtn.addEventListener('click', () => {
      state.sortMode = (state.sortMode + 1) % 3;
      updateSortBtn();
      applySort();
    });

    // Window unload — save state
    window.addEventListener('unload', () => {
      chrome.storage.local.set({
        mf_search_term: state.searchTerm,
        mf_search_platform: state.activePlatform,
        mf_slide: state.activeSlide
      });
    });
  }

  // ==================== Tab / Slide Management ====================

  function switchSlide(idx) {
    state.activeSlide = idx;
    dom.navBtns.forEach(b => b.classList.toggle('mf-nav-btn--active', +b.dataset.slide === idx));
    [dom.slideRadio, dom.slideMusic, dom.slidePodcast].forEach((s, i) => {
      s.classList.toggle('mf-slide--active', i === idx);
    });
  }

  function activateTab(platform) {
    state.activePlatform = platform;
    $$('.mf-tab').forEach(t => t.classList.toggle('mf-tab--active', t.dataset.platform === platform));

    const isFav = platform === 'favorites';
    const isLocal = platform === 'local';
    const isSponsor = platform === 'sponsor';

    dom.resultList.classList.toggle('mf-result-list--fav', isFav);
    dom.resultsEmpty.hidden = isFav || isLocal || isSponsor;

    if (isFav) renderFavorites();
    else if (isLocal) showLocalPanel();
    else if (isSponsor) showSponsor();
    else {
      // Always re-search if there's text in the input (or a saved term)
      const v = dom.searchInput.value.trim() || state.searchTerm;
      if (v) { dom.searchInput.value = v; doSearch(); }
    }
  }

  // ==================== Search ====================

  async function doSearch() {
    const term = dom.searchInput.value.trim() || state.searchTerm;
    dom.searchInput.value = term;
    if (!term) return;

    state.searchTerm = term;
    state.currentSearchTab = state.activePlatform;
    state.searchPage = 0;
    state.searchHasMore = true;

    dom.resultList.innerHTML = '<li class="mf-loading">Searching...</li>';
    dom.resultsEmpty.hidden = true;
    dom.musicResults.scrollTop = 0;

    saveHistory(term);

    const [keyword, numStr] = term.split('##');
    const limit = Math.min(parseInt(numStr) || SEARCH_DEFAULT, SEARCH_MAX);

    let results;
    try {
      results = await searchPlatform(state.activePlatform, keyword, limit, 0);
    } catch (e) {
      console.warn('MusicFinder search retry after:', e.message);
      await new Promise(r => setTimeout(r, 600));
      try {
        results = await searchPlatform(state.activePlatform, keyword, limit, 0);
      } catch (e2) {
        console.error('MusicFinder search error:', state.activePlatform, keyword, e2);
        renderSearchError(e2);
        return;
      }
    }
    if (state.currentSearchTab !== state.activePlatform) return;
    state.results = results;
    if (results._total != null) {
      state.searchHasMore = results.length < results._total;
    } else {
      state.searchHasMore = false;
    }
    if (state.sortMode !== 0) applySort();
    else renderResults(results, true);
    chrome.storage.local.set({
      mf_search_term: term,
      mf_search_platform: state.activePlatform,
      mf_search_results: results
    });
  }

  async function loadMore() {
    if (state.searchLoading || !state.searchHasMore) return;
    if (state.activePlatform === 'favorites' || state.activePlatform === 'local' || state.activePlatform === 'sponsor') return;

    state.searchLoading = true;
    const nextPage = state.searchPage + 1;
    const term = state.searchTerm;
    const [keyword] = term.split('##');

    // Append loading indicator
    const loader = document.createElement('li');
    loader.className = 'mf-loading';
    loader.textContent = 'Loading more...';
    loader.id = 'loadMoreSpinner';
    dom.resultList.appendChild(loader);

    try {
      const more = await searchPlatform(state.activePlatform, keyword, SEARCH_DEFAULT, nextPage);
      if (state.currentSearchTab !== state.activePlatform) return;
      if (!more || !more.length) { state.searchHasMore = false; return; }
      if (more._total != null && state.results.length + more.length >= more._total) state.searchHasMore = false;
      state.searchPage = nextPage;
      state.results = state.results.concat(more);
      if (state.sortMode !== 0) applySort();
      else appendResults(more);
    } catch (e) {
      console.warn('MusicFinder loadMore error:', e.message);
    } finally {
      state.searchLoading = false;
      const sp = document.getElementById('loadMoreSpinner');
      if (sp) sp.remove();
    }
  }

  async function searchPlatform(platform, keyword, limit, page = 0) {
    const apis = {
      netease: typeof NetEaseAPI !== 'undefined' ? NetEaseAPI : null,
      qq: typeof QQAPI !== 'undefined' ? QQAPI : null,
      bilibili: typeof BiliAPI !== 'undefined' ? BiliAPI : null,
      youtube: typeof YouTubeAPI !== 'undefined' ? YouTubeAPI : null,
      xiami: typeof XiamiAPI !== 'undefined' ? XiamiAPI : null,
      migu: typeof MiguAPI !== 'undefined' ? MiguAPI : null
    };
    const api = apis[platform];
    if (!api) throw new Error(platform + ' API module not loaded');
    return api.search(keyword, limit, page);
  }

  // ==================== Results Rendering ====================

  function friendlySearchMessage(err) {
    const msg = (err && err.message) || String(err);
    if (/412|risk control|风控/.test(msg))   return { title: 'Bilibili blocked the request', detail: 'Its anti-bot system (412) tripped. Wait a few seconds and retry.' };
    if (/429|too many requests/i.test(msg))  return { title: 'Too many requests', detail: 'Slow down a moment, then retry.' };
    if (/network|failed to fetch|load failed/i.test(msg)) return { title: 'Network error', detail: 'Check your connection and retry.' };
    return { title: 'Search failed', detail: msg };
  }

  function renderSearchError(err) {
    const { title, detail } = friendlySearchMessage(err);
    dom.resultsEmpty.hidden = true;
    dom.resultList.innerHTML = `
      <li class="mf-error mf-error--block">
        <div class="mf-error-icon" aria-hidden="true">⚠</div>
        <div class="mf-error-text">
          <div class="mf-error-title">${esc(title)}</div>
          <div class="mf-error-detail">${esc(detail)}</div>
        </div>
        <button class="mf-error-retry" type="button">Retry</button>
      </li>`;
    const btn = dom.resultList.querySelector('.mf-error-retry');
    if (btn) btn.addEventListener('click', doSearch);
  }

  function buildResultItem(song) {
    const li = document.createElement('li');
    li.className = 'mf-result-item';

    const isVip = isVipSong(song);
    const id = song.id || '';
    const name = song.name || '';
    const artist = (song.artists && song.artists[0]) || 'Unknown';
    const album = song.album || '-';

    li.innerHTML = `
      <div class="mf-result-info">
        <div class="mf-result-name"><span class="mf-marquee-text">${esc(name)}</span>${isVip ? ' <span class="mf-vip-tag">VIP</span>' : ''}</div>
        <div class="mf-result-meta"><span class="mf-marquee-text">${esc(artist)} · ${esc(album)}</span></div>
      </div>
      <div class="mf-result-actions">
        ${state.activePlatform !== 'youtube' ? `<button class="mf-action-btn mf-open-btn" data-web="${esc(state.activePlatform)}" data-page="${esc(song.page || '')}" title="Open">↗</button>` : ''}
        ${!isVip ? `<button class="mf-action-btn mf-play-btn" data-id="${esc(id)}" data-web="${esc(state.activePlatform)}" data-name="${esc(name)}" data-artist="${esc(artist)}" data-duration="${song.duration || 0}" data-cover="${esc(song.cover || '')}" data-page="${esc(song.page || '')}" title="Play">▶</button>` : `<span class="mf-action-btn mf-paid-icon" title="VIP required">🔒</span>`}
        <button class="mf-action-btn mf-fav-btn" data-id="${esc(id)}" data-web="${esc(state.activePlatform)}" data-name="${esc(name)}" data-artist="${esc(artist)}" data-duration="${song.duration || 0}" data-cover="${esc(song.cover || '')}" data-page="${esc(song.page || '')}" title="Favorite">♡</button>
      </div>`;
    return li;
  }

  function renderResults(results, replace) {
    if (!results || !results.length) {
      dom.resultList.innerHTML = '';
      dom.resultsEmpty.hidden = false;
      dom.resultsEmpty.querySelector('p').textContent = state.activePlatform === 'youtube' && !YOUTUBE_CONFIG.apiKey
        ? 'Set YOUTUBE_CONFIG.apiKey in js/api/youtube.js'
        : 'No results found';
      return;
    }

    const frag = document.createDocumentFragment();
    results.forEach(song => frag.appendChild(buildResultItem(song)));

    if (replace) {
      dom.resultList.innerHTML = '';
    }
    dom.resultList.appendChild(frag);
    dom.resultsEmpty.hidden = true;
    initMarquees();
  }

  function appendResults(results) {
    const frag = document.createDocumentFragment();
    results.forEach(song => frag.appendChild(buildResultItem(song)));
    dom.resultList.appendChild(frag);
    initMarquees();
  }

  function updateSortBtn() {
    dom.sortBtn.classList.remove('mf-sort-btn--asc', 'mf-sort-btn--desc');
    if (state.sortMode === 1) {
      dom.sortBtn.classList.add('mf-sort-btn--asc');
      dom.sortBtn.textContent = '↑';
    } else if (state.sortMode === 2) {
      dom.sortBtn.classList.add('mf-sort-btn--desc');
      dom.sortBtn.textContent = '↓';
    } else {
      dom.sortBtn.textContent = '⇅';
    }
  }

  function applySort() {
    if (!state.results.length) return;
    if (state.sortMode === 0) {
      renderResults(state.results, true);
      return;
    }
    const sorted = [...state.results].sort((a, b) => {
      const da = parseFloat(a.duration) || 0;
      const db = parseFloat(b.duration) || 0;
      return state.sortMode === 1 ? da - db : db - da;
    });
    state.results = sorted;
    const scrollTop = dom.musicResults.scrollTop;
    renderResults(sorted, true);
    dom.musicResults.scrollTop = scrollTop;
  }

  function isVipSong(song) {
    return (VIP_SOURCES.xiami && VIP_SOURCES.xiami.includes(song.xiami)) ||
           (VIP_SOURCES.netease && VIP_SOURCES.netease.includes(song.netease)) ||
           (VIP_SOURCES.qq && VIP_SOURCES.qq.includes(song.qq));
  }

  // ==================== Playback ====================

  async function playResult(dataset) {
    const song = {
      id: dataset.id, web: dataset.web, name: dataset.name,
      artist: dataset.artist, duration: dataset.duration,
      cover: dataset.cover, page: dataset.page
    };

    // For Bilibili, fetch pages first
    if (song.web === 'bilibili') {
      try {
        const pages = await BiliAPI.getPages(song.id);
        if (pages && pages.length > 0) {
          song.biliPages = pages;
          song.biliStart = 0;
        }
      } catch (e) { /* proceed without pages */ }
    }

    state.currentSong = song;
    sendToPlayer(song);
  }

  function togglePlay() {
    if (state.isPlaying) {
      sendToPlayer({ type: 'stop', data: {} });
    } else if (state.currentSong) {
      sendToPlayer(state.currentSong);
    }
  }

  function toggleLoop() {
    const modes = ['none', 'one', 'all'];
    const idx = (modes.indexOf(state.loopMode) + 1) % 3;
    state.loopMode = modes[idx];
    dom.btnLoop.dataset.mode = state.loopMode;
    sendToPlayer('loop');
  }

  function openSongPage(dataset) {
    const urls = {
      netease: 'https://music.163.com/#/song?id=' + dataset.page,
      qq: 'https://y.qq.com/n/yqq/song/' + dataset.page + '.html',
      bilibili: 'https://www.bilibili.com/video/' + dataset.page.replace('bitrack_v_', ''),
      xiami: 'https://www.xiami.com/song/' + dataset.page,
      migu: 'http://music.migu.cn/v3/music/song/' + dataset.page
    };
    const url = urls[dataset.web];
    if (url) window.open(url, '_blank');
  }

  // ==================== Favorites ====================

  function toggleFav(dataset) {
    const idx = state.favorites.findIndex(f => f.id === dataset.id && f.web === dataset.web);
    if (idx >= 0) {
      state.favorites.splice(idx, 1);
    } else {
      if (state.favorites.length >= FAV_MAX) {
        flashAlert('Favorites full (max ' + FAV_MAX + '). Remove some first.');
        return;
      }
      state.favorites.unshift({
        id: dataset.id, web: dataset.web, name: dataset.name,
        artist: dataset.artist, duration: dataset.duration,
        cover: dataset.cover, page: dataset.page
      });
    }
    chrome.storage.sync.set({ favorites: state.favorites });
    if (state.activePlatform === 'favorites') renderFavorites();
    updateFavUI();
  }

  function renderFavorites() {
    if (!state.favorites.length) {
      dom.resultList.innerHTML = '<li class="mf-empty-state"><p>No favorites yet. Click ♡ on any song.</p></li>';
      return;
    }
    const frag = document.createDocumentFragment();
    state.favorites.forEach((f, i) => {
      const li = document.createElement('li');
      li.className = 'mf-result-item mf-result-item--fav';
      li.draggable = true;
      li.dataset.index = i;
      li.innerHTML = `
        <div class="mf-result-info">
          <div class="mf-result-name">${esc(f.name)}</div>
          <div class="mf-result-meta">${esc(f.artist || '')} · ${SOURCE_NAMES[f.web] || f.web}</div>
        </div>
        <div class="mf-result-actions">
          <button class="mf-action-btn mf-play-btn" data-id="${esc(f.id)}" data-web="${esc(f.web)}" data-name="${esc(f.name)}" data-artist="${esc(f.artist || '')}" data-duration="${f.duration || 0}" data-cover="${esc(f.cover || '')}" data-page="${esc(f.page || '')}">▶</button>
          <button class="mf-action-btn mf-fav-del" data-index="${i}">✕</button>
        </div>`;
      li.querySelector('.mf-fav-del').addEventListener('click', () => {
        state.favorites.splice(i, 1);
        chrome.storage.sync.set({ favorites: state.favorites });
        renderFavorites();
      });
      frag.appendChild(li);
    });
    dom.resultList.innerHTML = '';
    dom.resultList.appendChild(frag);
    makeSortable(dom.resultList, (from, to) => {
      const [item] = state.favorites.splice(from, 1);
      state.favorites.splice(to, 0, item);
      chrome.storage.sync.set({ favorites: state.favorites });
    });
  }

  // ==================== Sponsor ====================

  function showSponsor() {
    dom.resultList.innerHTML = `
      <li class="mf-sponsor">
        <div class="mf-sponsor-card">
          <div class="mf-sponsor-emoji">☕</div>
          <div class="mf-sponsor-title">赞助作者</div>
          <div class="mf-sponsor-sub">觉得好用的话,请我喝杯咖啡</div>
          <div class="mf-sponsor-qr-wrap">
            <img class="mf-sponsor-qr" src="img/wechat-qr.png" alt="微信收款码">
            <div class="mf-sponsor-qr-fallback">
              <span>二维码即将上线</span>
              <small>放入 img/wechat-qr.png 即自动显示</small>
            </div>
          </div>
          <div class="mf-sponsor-note">微信收款码 · 随意打赏</div>
        </div>
      </li>`;
    const img = dom.resultList.querySelector('.mf-sponsor-qr');
    const fb = dom.resultList.querySelector('.mf-sponsor-qr-fallback');
    if (img && fb) {
      img.addEventListener('load', () => { img.style.display = 'block'; });
      img.addEventListener('error', () => { fb.style.display = 'flex'; });
    }
  }

  function showLocalPanel() {
    dom.resultList.innerHTML = `
      <li class="mf-local-upload">
        <label class="mf-local-label">
          Choose audio files
          <input type="file" accept="audio/*" multiple class="mf-local-input" id="localFileInput">
        </label>
        <p class="mf-local-note">Local playback is limited. Files are not cached.</p>
      </li>`;
    $('#localFileInput').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      state.currentSong = { name: file.name, web: 'local' };
      sendToPlayer({ type: 'local', url, name: file.name });
    });
  }

  // ==================== History ====================

  function saveHistory(term) {
    let history = [];
    chrome.storage.local.get(['mf_history'], r => {
      history = r.mf_history || [];
      history = history.filter(h => h !== term);
      history.unshift(term);
      if (history.length > 5) history.pop();
      chrome.storage.local.set({ mf_history: history });
      renderHistory();
    });
  }

  function renderHistory() {
    chrome.storage.local.get(['mf_history'], r => {
      const history = r.mf_history || [];
      dom.searchHistory.innerHTML = history.length
        ? history.map(h => `<li data-term="${esc(h)}">${esc(h)}</li>`).join('')
        : '<li class="mf-history-empty">No recent searches</li>';
    });
  }

  // ==================== UI Updates ====================

  function updatePlayUI() {
    chrome.storage.local.get(['mf_play', 'mf_song', 'mf_web', 'mf_cover', 'mf_duration', 'mf_bili_page', 'mf_bili_total', 'mf_bili_page_title', 'mf_bili_pages'], r => {
      state.isPlaying = r.mf_play === true;
      if (r.mf_song) {
        if (!state.currentSong || state.currentSong.name !== r.mf_song) {
          state.currentSong = {
            name: r.mf_song,
            web: r.mf_web || '',
            cover: r.mf_cover || '',
            duration: +r.mf_duration || 0,
            biliPages: r.mf_bili_pages || (state.currentSong && state.currentSong.biliPages) || undefined,
            biliStart: r.mf_bili_page || 0
          };
          state.biliPageTitle = r.mf_bili_page_title || '';
        } else {
          state.currentSong.web = r.mf_web || state.currentSong.web;
          state.currentSong.cover = r.mf_cover || state.currentSong.cover;
          state.currentSong.duration = +r.mf_duration || state.currentSong.duration;
          state.currentSong.biliPages = r.mf_bili_pages || state.currentSong.biliPages;
          state.biliPageTitle = r.mf_bili_page_title || state.biliPageTitle;
        }
      }
      if (!state.isPlaying) { state.currentSong = null; state.biliPageTitle = ''; }
      state.biliPage = r.mf_bili_page || 0;
      state.biliTotal = r.mf_bili_total || 0;

      dom.btnPlay.textContent = state.isPlaying ? '⏸' : '▶';
      if (state.currentSong) {
        const src = SOURCE_NAMES[state.currentSong.web] || state.currentSong.web;
        if (dom.infoText) {
          dom.infoText.innerHTML = `<span class="mf-marquee-text">${src} - ${esc(state.currentSong.name)}</span>`;
          setupMarquee(dom.infoText);
        }
      } else {
        if (dom.infoText) {
          dom.infoText.textContent = '';
          dom.infoText.innerHTML = '<span class="mf-marquee-text">未在播放</span>';
        }
      }
      updateBiliPager();
      updateFavUI();
    });
  }

  function updateBiliPager() {
    if (state.biliTotal > 1) {
      dom.biliPager.hidden = false;
      dom.biliPageInfo.textContent = (state.biliPage + 1) + ' / ' + state.biliTotal;

      // Show current page title
      if (dom.biliPageTitle) {
        const pages = state.currentSong?.biliPages;
        if (pages && pages[state.biliPage]) {
          dom.biliPageTitle.textContent = pages[state.biliPage].part || '';
          setupMarquee(dom.biliPageTitle);
        } else {
          dom.biliPageTitle.textContent = '';
        }
      }

      dom.biliPrev.disabled = state.biliPage === 0;
      dom.biliNext.disabled = state.biliPage + 1 >= state.biliTotal;
    } else {
      dom.biliPager.hidden = true;
    }
  }

  function updateFavUI() {
    if (!state.currentSong) return;
    const isFav = state.favorites.some(f =>
      (f.id === state.currentSong.id || f.name === state.currentSong.name) &&
      f.web === state.currentSong.web
    );
    state.isFavorited = isFav;
    dom.btnFavorite.textContent = isFav ? '♥' : '♡';
    dom.btnFavorite.classList.toggle('mf-ctrl-btn--active', isFav);
  }

  // ==================== Radio ====================

  function initRadio() {
    const regionBtns = $$('.mf-region-btn');
    const stationList = $('#radioStationList');
    const searchInput = $('#radioSearch');
    if (!regionBtns.length || !stationList) return;
    if (typeof HK_RADIOS === 'undefined' || typeof RADIO_REGIONS === 'undefined') {
      console.warn('MusicFinder: radio.js data not loaded');
      stationList.innerHTML = '<li class="mf-empty-state"><p>Radio data not available</p></li>';
      return;
    }

    let currentRegion = 'mainland';
    let mainlandStations = [];

    regionBtns.forEach(btn => btn.addEventListener('click', () => {
      regionBtns.forEach(b => b.classList.remove('mf-region-btn--active'));
      btn.classList.add('mf-region-btn--active');
      currentRegion = btn.dataset.region;
      renderRadioContent();
    }));

    stationList.addEventListener('click', async e => {
      // Back button: return to region list
      if (e.target.closest('.mf-back-item')) {
        mainlandStations = [];
        renderRadioContent();
        return;
      }
      const btn = e.target.closest('.mf-radio-play-btn');
      if (!btn) return;
      let url = btn.dataset.url;
      let name = btn.dataset.name;
      // Mainland stations: resolve stream URL from station ID
      if (currentRegion === 'mainland' && btn.dataset.sid) {
        try {
          btn.textContent = '⏳';
          btn.disabled = true;
          url = await fetchRadioStreamUrl(btn.dataset.sid);
          btn.textContent = '▶';
          btn.disabled = false;
        } catch (err) {
          btn.textContent = '⚠';
          btn.disabled = true;
          setTimeout(() => { btn.textContent = '▶'; btn.disabled = false; }, 2000);
          return;
        }
      }
      sendToPlayer({ type: 'radio', url, name });
    });

    if (searchInput) {
      searchInput.addEventListener('input', () => renderRadioContent());
    }

    async function renderRadioContent() {
      const filter = (searchInput?.value || '').trim().toLowerCase();

      if (currentRegion === 'hk') {
        const filtered = HK_RADIOS.filter(r => !filter || r.title.toLowerCase().includes(filter) || r.desc.toLowerCase().includes(filter));
        stationList.innerHTML = filtered.map(r => `
          <li class="mf-station-item">
            <div class="mf-station-info">
              <span class="mf-station-title">${esc(r.title)}</span>
              <span class="mf-station-tags">${esc(r.desc)}</span>
            </div>
            <button class="mf-action-btn mf-radio-play-btn" data-url="${esc(r.address)}" data-name="${esc(r.title)}">▶</button>
          </li>
        `).join('');
        return;
      }

      if (currentRegion === 'custom') {
        stationList.innerHTML = '<li class="mf-empty-state"><p>Enter a stream URL to play</p></li>';
        return;
      }

      // Mainland — show region list or station list
      if (!mainlandStations.length) {
        stationList.innerHTML = RADIO_REGIONS.data.map(r => `
          <li class="mf-station-item mf-region-item" data-region="${r.id}">
            <span class="mf-station-title">${esc(r.title)}</span>
          </li>
        `).join('');
        stationList.querySelectorAll('.mf-region-item').forEach(item => {
          item.addEventListener('click', async () => {
            const id = +item.dataset.region;
            stationList.innerHTML = '<li class="mf-loading">Loading stations...</li>';
            try {
              mainlandStations = await fetchRadioStations(id);
              renderRadioContent();
            } catch (e) {
              stationList.innerHTML = '<li class="mf-error">Failed to load stations</li>';
            }
          });
        });
      } else {
        const filtered = mainlandStations.filter(s => !filter || s.title.toLowerCase().includes(filter));
        const backBtn = `<li class="mf-station-item mf-back-item">
          <span class="mf-station-title">← Back to regions</span>
        </li>`;
        stationList.innerHTML = backBtn + (filtered.length ? filtered.map(s => `
          <li class="mf-station-item">
            <div class="mf-station-info">
              <span class="mf-station-title">${esc(s.title)}</span>
              <span class="mf-station-tags">${esc(s.nowPlaying || '-')}</span>
            </div>
            <button class="mf-action-btn mf-radio-play-btn" data-sid="${esc(s.id)}" data-name="${esc(s.title)}">▶</button>
          </li>
        `).join('') : '<li class="mf-empty-state"><p>No stations found</p></li>');
      }
    }

    // Initial render
    renderRadioContent();
  }

  // ==================== Clip Modal ====================

  function openClipModal(dataset) {
    dom.clipModal.hidden = false;
    const dur = parseInt(dataset.duration) || 0;
    dom.clipStart.value = 0;
    dom.clipEnd.value = 100;
    dom.clipStartLbl.textContent = '0:00';
    dom.clipEndLbl.textContent = Utils.formatTime(100, dur);
    dom.clipConfirm.onclick = () => {
      const start = dom.clipStart.value / 100;
      const end = dom.clipEnd.value / 100;
      sendToPlayer({ position: start, range: { start, end } });
      closeClipModal();
    };
  }

  function closeClipModal() {
    dom.clipModal.hidden = true;
  }

  // ==================== Utilities ====================

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Marquee effect for truncated text
  function setupMarquee(el) {
    if (!el) return;

    // Find the marquee-text span inside
    const textEl = el.querySelector('.mf-marquee-text') || el;
    if (textEl.classList.contains('mf-marquee')) return;

    const isTruncated = textEl.scrollWidth > el.clientWidth;
    if (!isTruncated) return;

    textEl.classList.add('mf-marquee');

    el.addEventListener('mouseenter', () => {
      if (textEl.scrollWidth > el.clientWidth) {
        const distance = textEl.scrollWidth - el.clientWidth;
        const duration = Math.max(3, distance / 30); // 30px per second, minimum 3s
        textEl.style.setProperty('--marquee-distance', `-${distance}px`);
        textEl.style.setProperty('--marquee-duration', `${duration}s`);
        textEl.classList.add('mf-marquee--scrolling');
      }
    });

    el.addEventListener('mouseleave', () => {
      textEl.classList.remove('mf-marquee--scrolling');
    });
  }

  function initMarquees() {
    const targets = document.querySelectorAll('.mf-result-name, .mf-result-meta, .mf-player-info');
    targets.forEach(setupMarquee);
  }

  // ==================== Boot ====================

  document.addEventListener('DOMContentLoaded', init);
})();
