/**
 * Apple Music previews (30s) via the public iTunes Search API.
 */

import { request, toUnix } from '../shared/util.js';
import { getSettings } from '../shared/library.js';

function toTrack(t) {
  return {
    source: 'apple',
    id: String(t.trackId),
    name: t.trackName,
    artists: [t.artistName].filter(Boolean),
    album: t.collectionName || '',
    duration: 30,
    cover: (t.artworkUrl100 || '').replace('100x100bb', '150x150bb'),
    preview: true,
    pubtime: toUnix(t.releaseDate),
    extra: { preview: t.previewUrl, url: t.trackViewUrl, fullDuration: (t.trackTimeMillis || 0) / 1000 }
  };
}

export default {
  id: 'apple',
  name: 'Apple Music 试听',
  short: 'Apple',
  color: '#fa2d48',

  async search(keyword, { page = 0, limit = 20, signal } = {}) {
    const { appleCountry } = await getSettings();
    const q = new URLSearchParams({
      media: 'music', entity: 'song', term: keyword,
      limit: String(limit), offset: String(page * limit), country: appleCountry || 'HK'
    });
    const data = await request(`https://itunes.apple.com/search?${q}`, { signal });
    const items = (data.results || []).filter((t) => t.previewUrl).map(toTrack);
    return { items, total: 0, hasMore: (data.results || []).length >= limit };
  },

  getStreamUrl: (track) => track.extra?.preview || null,

  pageUrl: (t) => t.extra?.url || 'https://music.apple.com'
};
