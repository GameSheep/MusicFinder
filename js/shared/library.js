/**
 * MusicFinder — favorites, search history and settings (chrome.storage).
 * Favorites live in storage.local (no 8KB/item sync quota); legacy sync data is migrated once.
 */

import { trackKey } from './util.js';

export const FAV_MAX = 1000;
const HISTORY_MAX = 10;

export const DEFAULT_SETTINGS = {
  theme: '#7c5cff',
  defaultSource: 'netease',
  youtubeKey: '',
  appleCountry: 'HK',
  pageSize: 20
};

export async function getSettings() {
  const { mf_settings } = await chrome.storage.sync.get('mf_settings');
  return { ...DEFAULT_SETTINGS, ...(mf_settings || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.sync.set({ mf_settings: next });
  return next;
}

// ---- Favorites ----

export function migrateLegacy(f) {
  if (!f || !f.web || f.web === 'xiami') return null;
  const t = {
    source: f.web,
    id: String(f.id),
    name: f.name || '',
    artists: f.artist ? [f.artist] : [],
    album: '',
    duration: +f.duration || 0,
    cover: f.cover || ''
  };
  if (f.web === 'qq') {
    const [mid, songid] = String(f.id).split('__');
    t.id = mid;
    t.extra = { songid };
  } else if (f.web === 'bilibili') {
    t.id = String(f.id).replace('bitrack_v_', '').split('-')[0];
  } else if (f.web === 'migu') {
    t.extra = { copyrightId: String(f.id) };
  }
  return t;
}

export async function getFavorites() {
  const { mf_favorites } = await chrome.storage.local.get('mf_favorites');
  if (Array.isArray(mf_favorites)) return mf_favorites;
  const { favorites } = await chrome.storage.sync.get('favorites');
  const migrated = (favorites || []).map(migrateLegacy).filter(Boolean);
  await chrome.storage.local.set({ mf_favorites: migrated });
  return migrated;
}

export async function setFavorites(list) {
  await chrome.storage.local.set({ mf_favorites: list.slice(0, FAV_MAX) });
}

/** Returns true if the track is now a favorite. */
export async function toggleFavorite(track) {
  const list = await getFavorites();
  const key = trackKey(track);
  const idx = list.findIndex((t) => trackKey(t) === key);
  if (idx >= 0) {
    list.splice(idx, 1);
    await setFavorites(list);
    return false;
  }
  if (list.length >= FAV_MAX) throw new Error(`收藏已满（最多 ${FAV_MAX} 首）`);
  list.unshift(slimTrack(track));
  await setFavorites(list);
  return true;
}

/** Drop transient fields before persisting. */
export function slimTrack(t) {
  const { source, id, name, artists, album, duration, cover, pubtime, vip, preview, extra } = t;
  return { source, id, name, artists, album, duration, cover, pubtime, vip, preview, extra };
}

// ---- Search history ----

export async function getHistory() {
  const { mf_history } = await chrome.storage.local.get('mf_history');
  return Array.isArray(mf_history) ? mf_history.filter((h) => typeof h === 'string') : [];
}

export async function pushHistory(term) {
  const list = (await getHistory()).filter((h) => h !== term);
  list.unshift(term);
  await chrome.storage.local.set({ mf_history: list.slice(0, HISTORY_MAX) });
}

export const clearHistory = () => chrome.storage.local.set({ mf_history: [] });
