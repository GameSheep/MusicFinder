/**
 * MusicFinder — Audio Player Engine
 * Runs in offscreen document. Handles all audio playback.
 * Communicates with popup via chrome.runtime.connect + chrome.storage.
 */

(function () {
  'use strict';

  const audio = document.querySelector('audio');
  const source = document.querySelector('source');
  const ytFrame = document.getElementById('youtubePlayer');

  // --- State ---
  let currentSong = null;
  let biliPages = [];
  let biliCurrentPage = 0;
  let isLoopMode = false;

  // --- API module map ---
  const API = {
    netease: NetEaseAPI,
    qq: QQAPI,
    bilibili: BiliAPI,
    youtube: YouTubeAPI,
    xiami: XiamiAPI,
    migu: MiguAPI
  };

  // --- Storage helpers ---
  // ponytail: chrome.storage may be unavailable in some offscreen contexts
  function safeStorage(key, val) {
    try { chrome.storage.local.set({ [key]: val }); } catch (e) {}
  }
  function updateStorage(obj) {
    try { chrome.storage.local.set(obj); } catch (e) {}
  }

  function notifyPlayState(playing, extra = {}) {
    const songName = currentSong ? currentSong.name : '';
    const songWeb  = currentSong ? currentSong.web : '';
    const songCov  = currentSong ? currentSong.cover : '';
    const dur      = currentSong && isFinite(audio.duration) ? audio.duration : undefined;
    const page     = (extra.mf_bili_page != null) ? extra.mf_bili_page : 0;
    const total    = (extra.mf_bili_total != null) ? extra.mf_bili_total : 0;
    const title    = extra.mf_bili_page_title || (biliPages[page] && biliPages[page].part) || '';
    // Primary: push through the port for instant UI update in popup
    if (playerPort) {
      try {
        playerPort.postMessage({
          state: playing,
          song: songName,
          web: songWeb,
          cover: songCov,
          duration: dur,
          biliPages: biliPages.length ? biliPages : undefined,
          mf_bili_page: page,
          mf_bili_total: total,
          bili_page_title: title,
          ...extra
        });
      } catch (e) {}
    }
    // Best-effort: also write through service-worker proxy for session restore
    try {
      chrome.runtime.sendMessage({
        action: 'storage',
        store_info: {
          mf_play: playing,
          mf_song: songName,
          mf_web: songWeb,
          mf_cover: songCov,
          mf_duration: dur,
          mf_bili_page: page,
          mf_bili_total: total,
          mf_bili_pages: biliPages.length ? biliPages : undefined,
          mf_bili_page_title: title,
          ...extra
        }
      });
    } catch (e) {}
  }

  // --- Progress ---
  // Send through the port (direct popup↔offscreen channel) for live updates.
  // Also persist to storage (throttled) so popup restore shows correct time.
  let lastStorageWrite = 0;
  function sendProgress() {
    if (!audio.duration || !currentSong || !isFinite(audio.duration)) return;
    const pct = +((audio.currentTime / audio.duration) * 100).toFixed(1);
    if (!isFinite(pct)) return;
    if (playerPort) {
      try {
        playerPort.postMessage({
          progress: pct,
          duration: audio.duration
        });
      } catch (e) {}
    }
    // ponytail: throttle storage writes to every 2s for popup restore on reopen
    const now = Date.now();
    if (now - lastStorageWrite > 2000) {
      lastStorageWrite = now;
      try {
        chrome.runtime.sendMessage({
          action: 'storage',
          store_info: { mf_progress: pct, mf_duration: audio.duration }
        });
      } catch (e) {}
    }
  }

  audio.addEventListener('timeupdate', sendProgress);

  // --- Playback functions ---

  let playId = 0;
  function safePlay(notifyExtra) {
    const id = ++playId;
    audio.play().then(() => {
      if (id === playId) notifyPlayState(true, notifyExtra);
    }).catch(e => {
      if (e.name !== 'AbortError') console.warn('MusicFinder: play failed', e.message);
    });
  }

  function playAudio(url) {
    ytFrame.src = '';
    source.src = url;
    audio.loop = isLoopMode;
    audio.load();
    safePlay();
  }

  function playBiliPage(url) {
    source.src = url;
    audio.loop = false;
    audio.load();
    safePlay({ mf_bili_page: biliCurrentPage, mf_bili_total: biliPages.length });

    audio.onended = () => {
      if (biliCurrentPage + 1 < biliPages.length) {
        biliCurrentPage++;
        const nextPage = biliPages[biliCurrentPage];
        BiliAPI.getAudioUrl('bitrack_v_' + extractBvid(currentSong.id) + '-' + nextPage.cid)
          .then(url => { if (url) playBiliPage(url); })
          .catch(e => console.error('MusicFinder: biliPage next getAudioUrl failed', e));
      } else {
        notifyPlayState(false);
      }
    };
  }

  function playYouTube(videoId) {
    source.src = '';
    audio.pause();
    const url = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1';
    ytFrame.src = url;
    notifyPlayState(true);
  }

  function playSong(song) {
    currentSong = song;
    biliPages = [];
    biliCurrentPage = 0;

    const module = API[song.web];
    if (!module) return;

    if (song.web === 'youtube') {
      playYouTube(song.id);
      return;
    }

    module.getSongUrl(song.id).then(url => {
      if (!url) {
        safeStorage('mf_error', song.name + ' 无法播放');
        return;
      }
      if (song.web === 'bilibili' && song.biliPages && song.biliPages.length > 1) {
        biliPages = song.biliPages;
        biliCurrentPage = song.biliStart || 0;
        playBiliPage(url);
      } else {
        playAudio(url);
        notifyPlayState(true);
      }

      // Load lyrics for non-Bilibili platforms
      if (song.web !== 'bilibili' && song.web !== 'youtube') {
        loadLyrics(song);
      }
    }).catch(e => {
      console.error('MusicFinder: getSongUrl failed for', song.web, song.id, e);
      safeStorage('mf_error', (song.name || 'Unknown') + ' 无法播放');
    });
  }

  function loadLyrics(song) {
    const module = API[song.web];
    if (!module || !module.getLyric) return;
    module.getLyric(song.id).then(data => {
      const lyrics = Utils.parseLyrics(data.lyric || '');
      const title = song.artist ? song.name + ' - ' + song.artist : song.name;
      if (lyrics.length) {
        chrome.runtime.sendMessage({ action: 'lyrics', store_info: { title, message: lyrics[0].c, iconUrl: './logo.png' } });
        // Track lyric timing
        let idx = 0;
        const onTime = () => {
          if (audio.currentTime === 0) idx = 0;
          if (idx < lyrics.length && audio.currentTime >= lyrics[idx].t) {
            idx++;
            if (idx > 0) {
              chrome.runtime.sendMessage({ action: 'lyrics', store_info: { title, message: lyrics[idx - 1].c, iconUrl: './logo.png' } });
            }
          }
        };
        audio.addEventListener('timeupdate', onTime, { once: false });
      }
    }).catch(() => {});
  }

  function stop() {
    audio.pause();
    ytFrame.src = '';
    notifyPlayState(false);
  }

  function togglePause() {
    if (currentSong && currentSong.web === 'youtube') {
      stop();
      return;
    }
    if (audio.paused) {
      safePlay();
    } else {
      audio.pause();
      notifyPlayState(false);
    }
  }

  // --- Playlist ---
  let playlist = [];
  let playIndex = 0;
  let playFailed = 0;

  function playNextInList() {
    playIndex++;
    if (playIndex >= playlist.length) playIndex = 0;
    const next = playlist[playIndex];
    if (!next) return;
    const mod = API[next.web];
    if (!mod) return;
    mod.getSongUrl(next.id).then(url => {
      if (!url) {
        playFailed++;
        if (playFailed < playlist.length) playNextInList();
        return;
      }
      playFailed = 0;
      currentSong = next;
      playAudio(url);
      notifyPlayState(true);
    }).catch(e => {
      console.error('MusicFinder: playNextInList getSongUrl failed', next.web, next.id, e);
      playFailed++;
      if (playFailed < playlist.length) playNextInList();
    });
  }

  function playPlaylist(list, shuffle) {
    playlist = shuffle ? list.sort(() => Math.random() - 0.5) : [...list];
    playIndex = 0;
    playFailed = 0;
    if (!playlist.length) return;
    const first = playlist[0];
    const mod = API[first.web];
    if (!mod) return;
    mod.getSongUrl(first.id).then(url => {
      if (!url) { playNextInList(); return; }
      currentSong = first;
      playAudio(url);
      audio.onended = playNextInList;
      notifyPlayState(true);
    }).catch(e => {
      console.error('MusicFinder: playPlaylist getSongUrl failed', first.web, first.id, e);
      playNextInList();
    });
  }

  // --- Radio / Podcast / White noise ---
  function playRadio(url, name) {
    currentSong = { name, web: 'fm' };
    source.src = url;
    audio.loop = false;
    audio.load();
    safePlay();
  }

  function playPodcast(url, name, episodes, index) {
    currentSong = { name, web: 'podcast' };
    source.src = url;
    audio.loop = false;
    audio.load();
    safePlay();
    audio.onended = () => {
      if (episodes && index + 1 < episodes.length) {
        playPodcast(episodes[index + 1].url, episodes[index + 1].title, episodes, index + 1);
      }
    };
  }

  function playWhiteNoise(name) {
    currentSong = { name, web: 'whitevoice' };
    const url = 'https://raw.githubusercontent.com/yourusername/musicfinder/main/sounds/' + name + '.mp3';
    source.src = url;
    audio.loop = true;
    audio.load();
    safePlay();
  }

  function playLocal(url, name) {
    currentSong = { name, web: 'local' };
    source.src = url;
    audio.loop = true;
    audio.load();
    safePlay();
  }

  function seekTo(position) {
    if (audio.readyState >= 2) {
      audio.currentTime = audio.duration * position;
      safePlay();
    }
  }

  // --- Message handling ---
  // ponytail: capture port ref to push progress/state back to popup directly
  let playerPort = null;

  chrome.runtime.onConnect.addListener(port => {
    playerPort = port;
    port.onMessage.addListener(msg => {
      try {
        if (msg.type === 'getState') {
          // Send current state to popup
          const curPage = biliPages.length ? biliCurrentPage : 0;
          port.postMessage({
            state: !audio.paused,
            song: currentSong ? currentSong.name : '',
            web: currentSong ? currentSong.web : '',
            cover: currentSong ? currentSong.cover : '',
            duration: isFinite(audio.duration) ? audio.duration : 0,
            progress: audio.duration && isFinite(audio.duration) ? (audio.currentTime / audio.duration) * 100 : 0,
            mf_bili_page: biliPages.length ? biliCurrentPage : null,
            mf_bili_total: biliPages.length || null,
            bili_page_title: biliPages[curPage] ? biliPages[curPage].part : '',
            biliPages: biliPages.length ? biliPages : null
          });
          return;
        }
        if (msg.type === 'stop') return togglePause();
        if (msg === 'loop') { isLoopMode = !isLoopMode; audio.loop = isLoopMode; return; }
        if (msg.position) return seekTo(msg.position);
        if (msg.playList) return playPlaylist(msg.likeList, msg.random);
        if (msg.bili_switch_page != null && biliPages.length) {
          biliCurrentPage = msg.bili_switch_page;
          const p = biliPages[biliCurrentPage];
          if (p) {
            BiliAPI.getAudioUrl('bitrack_v_' + extractBvid(currentSong.id) + '-' + p.cid)
              .then(url => { if (url) playBiliPage(url); })
              .catch(e => console.error('MusicFinder: bili_switch_page getAudioUrl failed', e));
          }
          return;
        }
        if (msg.type === 'radio') return playRadio(msg.url, msg.name);
        if (msg.type === 'podcast') return playPodcast(msg.url, msg.name, msg.episodes, msg.index);
        if (msg.type === 'whitevoice') return playWhiteNoise(msg.name);
        if (msg.type === 'local') return playLocal(msg.url, msg.name);

        // Default: play a song
        if (msg.id && msg.web) {
          playSong(msg);
        }
      } catch (e) {
        console.error('Player error:', e);
      }
    });
  });

  // Volume from service worker
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'background' && msg.store_info && msg.store_info.volume != null) {
      audio.volume = msg.store_info.volume;
    }
  });

  // Initialize
  updateStorage({ mf_play: false });

  function extractBvid(id) {
    return id.replace('bitrack_v_', '').split('-')[0];
  }
})();
