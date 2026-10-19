/**
 * YouTube via Data API v3 (API key configured in Options). Playback uses an embedded iframe.
 */

import { request, decodeEntities, toUnix } from '../shared/util.js';
import { getSettings } from '../shared/library.js';

const API = 'https://www.googleapis.com/youtube/v3';
const pageTokens = new Map();

export default {
  id: 'youtube',
  name: 'YouTube',
  short: 'YouTube',
  color: '#ff0033',

  async search(keyword, { page = 0, limit = 20, signal } = {}) {
    const { youtubeKey } = await getSettings();
    if (!youtubeKey) {
      const err = new Error('请先在设置中填写 YouTube API Key');
      err.code = 'NEED_KEY';
      throw err;
    }
    const q = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: String(Math.min(limit, 50)), q: keyword, key: youtubeKey });
    const token = page > 0 ? pageTokens.get(`${keyword}|${page}`) : '';
    if (page > 0 && !token) return { items: [], total: 0, hasMore: false };
    if (token) q.set('pageToken', token);
    const data = await request(`${API}/search?${q}`, { signal });
    if (data.nextPageToken) pageTokens.set(`${keyword}|${page + 1}`, data.nextPageToken);
    const items = (data.items || []).filter((i) => i.id?.videoId).map((i) => ({
      source: 'youtube',
      id: i.id.videoId,
      name: decodeEntities(i.snippet.title),
      artists: [decodeEntities(i.snippet.channelTitle)],
      album: 'YouTube',
      duration: 0,
      cover: i.snippet.thumbnails?.default?.url || '',
      pubtime: toUnix(i.snippet.publishedAt)
    }));
    return { items, total: data.pageInfo?.totalResults || 0, hasMore: !!data.nextPageToken };
  },

  getStreamUrl: (track) => ({ embed: `https://www.youtube.com/embed/${track.id}?autoplay=1` }),

  pageUrl: (t) => `https://www.youtube.com/watch?v=${t.id}`
};
