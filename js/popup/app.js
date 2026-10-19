/**
 * Popup-wide context shared by the views: player client, favourites, settings.
 */

import { PlayerClient } from '../shared/player-client.js';
import { getFavorites, toggleFavorite, getSettings, slimTrack } from '../shared/library.js';
import { trackKey } from '../shared/util.js';
import { providers } from '../providers/index.js';
import { toast } from './dom.js';

const QUEUE_MAX = 500;

class App extends EventTarget {
  constructor() {
    super();
    this.player = new PlayerClient();
    this.favorites = [];
    this.favKeys = new Set();
    this.settings = null;
    this.windowId = null;
  }

  async init() {
    [this.settings, this.favorites] = await Promise.all([getSettings(), getFavorites()]);
    this.favKeys = new Set(this.favorites.map(trackKey));
    chrome.windows?.getCurrent?.().then((w) => { this.windowId = w.id; }).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.mf_favorites) {
        this.favorites = changes.mf_favorites.newValue || [];
        this.favKeys = new Set(this.favorites.map(trackKey));
        this.emit('favorites');
      }
      if (area === 'sync' && changes.mf_settings) {
        this.settings = { ...this.settings, ...(changes.mf_settings.newValue || {}) };
        this.applyTheme();
      }
    });
    this.applyTheme();
    this.player.on('toast', (text) => toast(text, 3200));
  }

  applyTheme() {
    if (this.settings?.theme) document.documentElement.style.setProperty('--accent', this.settings.theme);
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on(type, fn) {
    this.addEventListener(type, (e) => fn(e.detail));
  }

  get currentKey() {
    return trackKey(this.player.state.track);
  }

  /** Play `items` (tracks only) starting at items[index]. */
  async play(items, index) {
    const target = items[index];
    let queue = items.filter((t) => t && t.type !== 'user').map(slimTrack);
    let start = Math.max(0, queue.findIndex((t) => trackKey(t) === trackKey(target)));
    if (!queue.length) return;
    if (queue.length > QUEUE_MAX) {
      const from = Math.min(Math.max(0, start - 50), queue.length - QUEUE_MAX);
      queue = queue.slice(from, from + QUEUE_MAX);
      start -= from;
    }
    try {
      await this.player.send('play', { queue, index: start });
    } catch (e) {
      toast('播放器启动失败：' + e.message);
    }
  }

  playNext(track) {
    return this.player.send('playNext', { track: slimTrack(track) });
  }

  async toggleFav(track) {
    if (!track) return;
    try {
      const on = await toggleFavorite(track);
      toast(on ? '已加入收藏' : '已取消收藏', 1400);
    } catch (e) {
      toast(e.message);
    }
  }

  openPage(track, page = 0) {
    const url = providers[track?.source]?.pageUrl?.(track, page);
    if (url) chrome.tabs.create({ url });
  }
}

export const app = new App();
