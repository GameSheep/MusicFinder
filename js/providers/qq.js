/**
 * QQ Music. Referer/Origin for *.y.qq.com injected by rules.json.
 */

import { request, decodeEntities, toHttps, toUnix } from '../shared/util.js';

const MUSICU = 'https://u.y.qq.com/cgi-bin/musicu.fcg';

function toTrack(s) {
  const albummid = s.albummid || s.album?.mid || '';
  return {
    source: 'qq',
    id: s.songmid || s.mid,
    name: s.songname || s.name || s.title || '',
    artists: (s.singer || []).map((a) => a.name),
    album: s.albumname || s.album?.name || '',
    duration: s.interval || 0,
    cover: albummid ? `https://y.gtimg.cn/music/photo_new/T002R150x150M000${albummid}.jpg` : '',
    pubtime: toUnix(s.time_public),
    vip: (s.pay?.payplay ?? s.pay?.pay_play) === 1,
    extra: { songid: String(s.songid || s.id || '') }
  };
}

async function searchLegacy(keyword, page, limit, signal) {
  const q = new URLSearchParams({
    w: keyword, p: String(page + 1), n: String(limit), format: 'json',
    aggr: '1', lossless: '0', cr: '1', new_json: '1', t: '0', ie: 'utf-8'
  });
  const data = await request(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?${q}`, { signal });
  const song = data.data?.song;
  if (!song) throw new Error('QQ 音乐搜索无结果');
  return { list: song.list || [], total: song.totalnum || 0 };
}

async function searchMusicu(keyword, page, limit, signal) {
  const body = {
    comm: { ct: 19, cv: 1859, uin: '0' },
    req: {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: { query: keyword, num_per_page: limit, page_num: page + 1, search_type: 0 }
    }
  };
  const data = await request(MUSICU, { method: 'POST', body: JSON.stringify(body), signal });
  const song = data.req?.data?.body?.song;
  return { list: song?.list || [], total: data.req?.data?.meta?.sum || 0 };
}

export default {
  id: 'qq',
  name: 'QQ 音乐',
  short: 'QQ',
  color: '#31c27c',

  async search(keyword, { page = 0, limit = 20, signal } = {}) {
    let res;
    try {
      res = await searchLegacy(keyword, page, limit, signal);
    } catch (e) {
      if (signal?.aborted) throw e;
      res = await searchMusicu(keyword, page, limit, signal);
    }
    const items = res.list.map(toTrack).filter((t) => t.id);
    return { items, total: res.total, hasMore: (page + 1) * limit < res.total && items.length > 0 };
  },

  async getStreamUrl(track) {
    const guid = String(Math.floor(Math.random() * 1e10));
    const payload = {
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: { guid, songmid: [track.id], songtype: [0], uin: '0', loginflag: 1, platform: '20' }
      },
      comm: { uin: 0, format: 'json', ct: 24, cv: 0 }
    };
    const data = await request(`${MUSICU}?format=json&data=${encodeURIComponent(JSON.stringify(payload))}`);
    const info = data.req_0?.data;
    const purl = info?.midurlinfo?.[0]?.purl;
    if (!purl) return null;
    const sip = (info.sip || []).find((s) => s.startsWith('https')) || info.sip?.[0] || 'https://ws.stream.qqmusic.qq.com/';
    return toHttps(sip + purl);
  },

  async getLyric(track) {
    const q = new URLSearchParams({ songmid: track.id, format: 'json', nobase64: '1', g_tk: '5381' });
    const text = await request(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?${q}`, { type: 'text' });
    const json = JSON.parse(text.replace(/^[^{]*\(|\)\s*;?\s*$/g, ''));
    return decodeEntities(json.lyric || '');
  },

  pageUrl: (t) => `https://y.qq.com/n/ryqq/songDetail/${t.id}`
};
