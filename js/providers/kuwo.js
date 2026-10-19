/**
 * Kuwo Music. Search responds with a JS object literal using single quotes.
 */

import { request, cleanText, lrcTag } from '../shared/util.js';

/** Convert Kuwo's single-quoted pseudo-JSON into JSON. Apostrophes inside values survive. */
function looseJson(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!inStr) {
      if (c === "'") { inStr = true; out += '"'; } else out += c;
      continue;
    }
    if (c === '\\') { out += c + (text[++i] ?? ''); continue; }
    if (c === "'") {
      const rest = text.slice(i + 1).match(/^\s*([,:}\]])/);
      if (rest || i === text.length - 1) { inStr = false; out += '"'; continue; }
      out += "'";
      continue;
    }
    if (c === '"') { out += '\\"'; continue; }
    if (c === '\n' || c === '\r' || c === '\t') { out += ' '; continue; }
    out += c;
  }
  return JSON.parse(out);
}

function toTrack(s) {
  const id = String(s.MUSICRID || '').replace('MUSIC_', '');
  const pic = s.web_albumpic_short || '';
  return {
    source: 'kuwo',
    id,
    name: cleanText(s.SONGNAME || s.NAME),
    artists: cleanText(s.ARTIST).split(/[&、]/).map((a) => a.trim()).filter(Boolean),
    album: cleanText(s.ALBUM),
    duration: +s.DURATION || 0,
    cover: pic ? `https://img4.kuwo.cn/star/albumcover/${pic.replace(/^120\//, '300/')}` : ''
  };
}

export default {
  id: 'kuwo',
  name: '酷我音乐',
  short: '酷我',
  color: '#ffb300',

  async search(keyword, { page = 0, limit = 20, signal } = {}) {
    const q = new URLSearchParams({
      client: 'kt', all: keyword, pn: String(page), rn: String(limit), ft: 'music',
      itemset: 'web_2013', rformat: 'json', encoding: 'utf8', vipver: '1', newver: '1', show_copyright_off: '1'
    });
    const text = await request(`https://search.kuwo.cn/r.s?${q}`, { type: 'text', signal });
    const data = looseJson(text);
    const total = +data.TOTAL || 0;
    const items = (data.abslist || []).map(toTrack).filter((t) => t.id);
    return { items, total, hasMore: (page + 1) * limit < total && items.length > 0 };
  },

  async getStreamUrl(track) {
    try {
      const url = (await request(
        `https://antiserver.kuwo.cn/anti.s?type=convert_url&format=mp3&response=url&rid=MUSIC_${track.id}`,
        { type: 'text' }
      )).trim();
      if (/^https?:\/\//.test(url)) return url;
    } catch (e) {
      console.warn('[kuwo] convert_url failed', e);
    }
    const data = await request(`https://antiserver.kuwo.cn/anti.s?type=convert_url3&format=mp3&br=128kmp3&rid=${track.id}`);
    return data.url || null;
  },

  async getLyric(track) {
    const data = await request(`https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${track.id}`);
    const lines = data.data?.lrclist || [];
    return lines.map((l) => lrcTag(+l.time || 0) + cleanText(l.lineLyric)).join('\n');
  },

  pageUrl: (t) => `https://www.kuwo.cn/play_detail/${t.id}`
};
