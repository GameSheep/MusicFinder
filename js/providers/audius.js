/**
 * Audius — open, free music catalog (indie / electronic / lo-fi). No API key needed.
 */

import { request, toUnix } from '../shared/util.js';

const API = 'https://api.audius.co/v1';
const APP = 'MusicFinder';

function toTrack(t) {
  return {
    source: 'audius',
    id: t.id,
    name: t.title,
    artists: [t.user?.name].filter(Boolean),
    album: t.genre || '',
    duration: t.duration || 0,
    cover: t.artwork?.['150x150'] || '',
    pubtime: toUnix(t.release_date || t.created_at),
    extra: { permalink: t.permalink || '' }
  };
}

export default {
  id: 'audius',
  name: 'Audius',
  short: 'Audius',
  color: '#cc0fe0',

  async search(keyword, { page = 0, limit = 20, signal } = {}) {
    const q = new URLSearchParams({ query: keyword, limit: String(limit), offset: String(page * limit), app_name: APP });
    const data = await request(`${API}/tracks/search?${q}`, { signal });
    const items = (data.data || []).filter((t) => t.is_streamable !== false).map(toTrack);
    return { items, total: 0, hasMore: (data.data || []).length >= limit };
  },

  getStreamUrl: (track) => `${API}/tracks/${track.id}/stream?app_name=${APP}`,

  pageUrl: (t) => (t.extra?.permalink ? `https://audius.co${t.extra.permalink}` : 'https://audius.co')
};
