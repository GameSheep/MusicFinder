/**
 * Podcasts — iTunes podcast directory + RSS feed episodes. Not a search chip; used by the Podcast view.
 */

import { request, cleanText, parseClock } from '../shared/util.js';

function text(el, sel) {
  const n = el.getElementsByTagName(sel)[0];
  return n ? cleanText(n.textContent) : '';
}

export default {
  id: 'podcast',
  name: '播客',
  short: '播客',
  color: '#8e5cff',

  async searchShows(term, { limit = 30, signal } = {}) {
    const q = new URLSearchParams({ media: 'podcast', term, limit: String(limit) });
    const data = await request(`https://itunes.apple.com/search?${q}`, { signal });
    return (data.results || []).filter((s) => s.feedUrl).map((s) => ({
      id: String(s.collectionId),
      name: s.collectionName || s.trackName || '',
      author: s.artistName || '',
      genre: s.primaryGenreName || '',
      cover: s.artworkUrl100 || s.artworkUrl600 || '',
      feedUrl: s.feedUrl,
      count: s.trackCount || 0
    }));
  },

  async getEpisodes(show, { signal } = {}) {
    const xml = await request(show.feedUrl, { type: 'text', signal, timeout: 20000 });
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('RSS 解析失败');
    return [...doc.getElementsByTagName('item')].map((item) => {
      const url = item.getElementsByTagName('enclosure')[0]?.getAttribute('url') || '';
      const date = text(item, 'pubDate');
      const img = item.getElementsByTagName('itunes:image')[0]?.getAttribute('href');
      return {
        source: 'podcast',
        id: url,
        name: text(item, 'title'),
        artists: [show.name],
        album: date ? new Date(date).toLocaleDateString('zh-CN') : '',
        duration: parseClock(text(item, 'itunes:duration')),
        cover: img || show.cover,
        extra: { url }
      };
    }).filter((e) => e.id);
  },

  getStreamUrl: (track) => track.extra?.url || track.id,

  pageUrl: (t) => t.extra?.url || t.id
};
