/**
 * Kugou Music. privilege === 10 means the track requires payment (no free stream).
 */

import { request, cleanText, toHttps, base64ToUtf8 } from '../shared/util.js';

function toTrack(s) {
  const cover = s.trans_param?.union_cover || '';
  return {
    source: 'kugou',
    id: String(s.hash || '').toUpperCase(),
    name: cleanText(s.songname || s.filename),
    artists: cleanText(s.singername).split(/[、,]/).map((a) => a.trim()).filter(Boolean),
    album: cleanText(s.album_name),
    duration: +s.duration || 0,
    cover: cover ? toHttps(cover.replace('{size}', '150')) : '',
    vip: s.privilege === 10,
    extra: { albumId: String(s.album_id || '') }
  };
}

export default {
  id: 'kugou',
  name: '酷狗音乐',
  short: '酷狗',
  color: '#2196f3',

  async search(keyword, { page = 0, limit = 20, signal } = {}) {
    const q = new URLSearchParams({ format: 'json', keyword, page: String(page + 1), pagesize: String(limit), showtype: '1' });
    let data;
    try {
      data = await request(`https://mobilecdn.kugou.com/api/v3/search/song?${q}`, { signal, timeout: 6000 });
    } catch (e) {
      if (signal?.aborted) throw e;
      data = await request(`http://mobilecdn.kugou.com/api/v3/search/song?${q}`, { signal });
    }
    const total = data.data?.total || 0;
    const items = (data.data?.info || []).map(toTrack).filter((t) => t.id);
    return { items, total, hasMore: (page + 1) * limit < total && items.length > 0 };
  },

  async getStreamUrl(track) {
    const data = await request(`https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${track.id}`);
    const url = data.url || (Array.isArray(data.backup_url) ? data.backup_url[0] : '');
    if (!url) throw new Error(data.error || '酷狗未返回播放地址');
    return url;
  },

  async getLyric(track) {
    const found = await request(`https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&hash=${track.id}`);
    const c = found.candidates?.[0];
    if (!c) return '';
    const dl = await request(`https://lyrics.kugou.com/download?ver=1&client=pc&id=${c.id}&accesskey=${c.accesskey}&fmt=lrc&charset=utf8`);
    return dl.content ? base64ToUtf8(dl.content) : '';
  },

  pageUrl: (t) => `https://www.kugou.com/song/#hash=${t.id}&album_id=${t.extra?.albumId || ''}`
};
