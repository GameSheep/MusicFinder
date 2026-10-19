/**
 * Migu Music. Track id = copyrightId (stable, used for page links); songId/contentId in extra.
 */

import { request } from '../shared/util.js';

/** The search API has no duration; the 64 kbps "LQ" file size gives it. */
const lqDuration = (s) => {
  const size = +(s.rateFormats || []).find((f) => f.formatType === 'LQ')?.size;
  return size ? Math.round((size * 8) / 64000) : 0;
};

function toTrack(s) {
  const imgs = s.imgItems || [];
  return {
    source: 'migu',
    id: String(s.copyrightId || s.id),
    name: s.name || s.songName || '',
    artists: (s.singers || []).map((a) => a.name),
    album: s.albums?.[0]?.name || '',
    duration: lqDuration(s),
    cover: (imgs.find((i) => i.imgSizeType === '01') || imgs[0])?.img || '',
    extra: { songId: String(s.id || ''), contentId: String(s.contentId || ''), copyrightId: String(s.copyrightId || ''), lyricUrl: s.lyricUrl || '' }
  };
}

export default {
  id: 'migu',
  name: '咪咕音乐',
  short: '咪咕',
  color: '#e4007f',

  async search(keyword, { page = 0, limit = 20, signal } = {}) {
    const q = new URLSearchParams({
      text: keyword, pageNo: String(page + 1), pageSize: String(limit),
      searchSwitch: JSON.stringify({ song: 1 })
    });
    const data = await request(`https://pd.musicapp.migu.cn/MIGUM3.0/v1.0/content/search_all.do?${q}`, { signal });
    if (data.code !== '000000') throw new Error(data.info || `咪咕接口返回 ${data.code}`);
    const r = data.songResultData || {};
    const total = +r.totalCount || 0;
    const items = (r.result || []).map(toTrack).filter((t) => t.id);
    return { items, total, hasMore: (page + 1) * limit < total && items.length > 0 };
  },

  async getStreamUrl(track) {
    const x = track.extra || {};
    const q = new URLSearchParams({ netType: '01', resourceType: '2', toneFlag: 'PQ' });
    if (x.songId) q.set('songId', x.songId);
    else {
      q.set('copyrightId', x.copyrightId || track.id);
      if (x.contentId) q.set('contentId', x.contentId);
    }
    const data = await request(`https://app.c.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.4?${q}`, {
      headers: { channel: '014000D' }
    });
    return data.data?.url || null;
  },

  async getLyric(track) {
    const url = track.extra?.lyricUrl;
    return url ? request(url, { type: 'text' }) : '';
  },

  pageUrl: (t) => `https://music.migu.cn/v3/music/song/${t.extra?.copyrightId || t.id}`
};
