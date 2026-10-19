/**
 * Bilibili — video audio tracks + UP 主 (uploader) search and their uploads.
 * Referer injected by rules.json; search endpoints are WBI-signed (MD5 global from js/lib/md5.js).
 */

import { request, cleanText, toHttps, parseClock, fmtCount, toUnix } from '../shared/util.js';

const API = 'https://api.bilibili.com';
const MIXIN_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52];
// Browser fingerprint params the space API's risk control expects alongside WBI.
const DM_PARAMS = {
  dm_img_list: '[]',
  dm_img_str: 'V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ',
  dm_cover_img_str: 'QU5HTEUgKE5WSURJQSwgTlZJRElBIEdlRm9yY2UgR1RYIDE2NTAgKDB4MDAwMDFGOTEpIERpcmVjdDNEMTEgdnNfNV8wIHBzXzVfMCwgRDNEMTEpR29vZ2xlIEluYy4gKE5WSURJQS',
  dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}'
};

let wbiCache = { key: '', ts: 0 };
const pagesCache = new Map();

async function ensureCookies() {
  if (typeof chrome === 'undefined' || typeof chrome.cookies?.get !== 'function') return;
  try {
    const expirationDate = (Date.now() + 365 * 864e5) / 1000;
    for (const name of ['buvid3', 'buvid4']) {
      const c = await chrome.cookies.get({ url: 'https://www.bilibili.com', name });
      if (!c) {
        await chrome.cookies.set({
          url: 'https://www.bilibili.com', domain: '.bilibili.com', name,
          value: crypto.randomUUID() + 'infoc', expirationDate
        });
      }
    }
  } catch { /* best effort */ }
}

async function getMixinKey() {
  if (wbiCache.key && Date.now() - wbiCache.ts < 30 * 60e3) return wbiCache.key;
  const nav = await request(`${API}/x/web-interface/nav`, { credentials: 'include' });
  const img = nav.data?.wbi_img || nav.data?.wbi?.img || {};
  const name = (u) => (u || '').replace(/^.*\/([^/]+)\.[^.]+$/, '$1');
  const raw = name(img.img_url) + name(img.sub_url);
  if (raw.length < 64) throw new Error('Bilibili WBI key unavailable');
  wbiCache = { key: MIXIN_TAB.map((i) => raw[i]).join('').slice(0, 32), ts: Date.now() };
  return wbiCache.key;
}

async function signedQuery(params) {
  const enc = (o) => Object.keys(o).sort().map((k) =>
    `${encodeURIComponent(k)}=${encodeURIComponent(String(o[k] ?? '').replace(/[!'()*]/g, ''))}`
  ).join('&');
  try {
    const key = await getMixinKey();
    const query = enc({ ...params, wts: Math.floor(Date.now() / 1000) });
    return `${query}&w_rid=${globalThis.MD5(query + key)}`;
  } catch {
    return enc(params);
  }
}

async function biliJson(url, signal) {
  const res = await request(url, { credentials: 'include', signal, type: 'response' }).catch((e) => {
    if (e.status === 412 || e.status === 429) throw new Error(`Bilibili risk control (${e.status})`);
    throw e;
  });
  const data = await res.json();
  if (data.code === -412 || data.code === -352) throw new Error(`Bilibili risk control (${data.code})`);
  if (data.code !== 0) throw new Error(data.message || `Bilibili code ${data.code}`);
  return data.data;
}

const thumb = (pic) => (pic ? toHttps(pic) + '@96w_96h_1c.webp' : '');

function videoTrack(v, upName = '') {
  const views = v.play ?? v.stat?.view;
  return {
    source: 'bilibili',
    id: v.bvid,
    name: cleanText(v.title),
    artists: [cleanText(v.author || upName)].filter(Boolean),
    album: views != null ? `播放 ${fmtCount(views)}` : '',
    duration: typeof v.duration === 'number' ? v.duration : parseClock(v.duration || v.length),
    cover: thumb(v.pic),
    pubtime: toUnix(v.pubdate || v.created),
    extra: { mid: String(v.mid || '') }
  };
}

function userItem(u) {
  return {
    type: 'user',
    source: 'bilibili',
    id: String(u.mid),
    name: cleanText(u.uname),
    avatar: thumb(u.upic),
    fans: u.fans || 0,
    videos: u.videos || 0,
    sign: cleanText(u.usign),
    verified: u.official_verify?.type === 0 || u.official_verify?.type === 1
  };
}

export default {
  id: 'bilibili',
  name: '哔哩哔哩',
  short: 'B站',
  color: '#fb7299',
  kinds: [
    { id: 'song', label: '视频' },
    { id: 'user', label: 'UP主' }
  ],

  async search(keyword, { page = 0, limit = 20, signal, kind = 'song' } = {}) {
    await ensureCookies();
    const isUser = kind === 'user';
    const query = await signedQuery({
      search_type: isUser ? 'bili_user' : 'video',
      keyword, page: page + 1, page_size: limit,
      ...(isUser ? { order: '', user_type: 0 } : {})
    });
    const data = await biliJson(`${API}/x/web-interface/search/type?${query}`, signal);
    const list = data?.result || [];
    const items = isUser ? list.map(userItem) : list.filter((v) => v.bvid).map((v) => videoTrack(v));
    const total = data?.numResults || 0;
    return { items, total, hasMore: page + 1 < (data?.numPages || 0) };
  },

  /** Uploads of an UP 主. order: 'pubdate' | 'click'. */
  async getUserVideos(mid, { page = 0, limit = 30, order = 'pubdate', keyword = '', upName = '', signal } = {}) {
    await ensureCookies();
    try {
      const query = await signedQuery({
        mid, ps: limit, pn: page + 1, order, keyword, tid: 0,
        platform: 'web', web_location: 1550101, order_avoided: 'true', ...DM_PARAMS
      });
      const data = await biliJson(`${API}/x/space/wbi/arc/search?${query}`, signal);
      const items = (data?.list?.vlist || []).map((v) => videoTrack(v, upName));
      const total = data?.page?.count || 0;
      return { items, total, hasMore: (page + 1) * limit < total };
    } catch (e) {
      if (signal?.aborted) throw e;
      console.warn('[bilibili] arc/search failed, using fallback:', e.message);
    }
    try {
      const q = new URLSearchParams({ mid, keywords: keyword, ps: String(limit), pn: String(page + 1), orderby: order === 'click' ? 'views' : 'pubdate' });
      const data = await biliJson(`${API}/x/series/recArchivesByKeywords?${q}`, signal);
      const items = (data?.archives || []).map((v) => videoTrack(v, upName));
      const total = data?.page?.total || 0;
      return { items, total, hasMore: (page + 1) * limit < total };
    } catch (e) {
      if (signal?.aborted || !upName) throw e;
      console.warn('[bilibili] recArchives failed, searching by name:', e.message);
    }
    // Last resort: keyword search on the UP's name, keep only their own uploads.
    const query = await signedQuery({
      search_type: 'video', keyword: `${upName} ${keyword}`.trim(), page: page + 1, page_size: 50,
      order: order === 'click' ? 'click' : 'pubdate'
    });
    const data = await biliJson(`${API}/x/web-interface/search/type?${query}`, signal);
    const items = (data?.result || []).filter((v) => String(v.mid) === String(mid)).map((v) => videoTrack(v, upName));
    return { items, total: 0, hasMore: page + 1 < (data?.numPages || 0) && items.length > 0 };
  },

  async getPages(track) {
    if (pagesCache.has(track.id)) return pagesCache.get(track.id);
    const data = await biliJson(`${API}/x/web-interface/view?bvid=${track.id}`);
    const pages = (data?.pages || []).map((p) => ({ cid: p.cid, part: p.part, duration: p.duration }));
    pagesCache.set(track.id, pages);
    return pages;
  },

  async getStreamUrl(track, { page = 0 } = {}) {
    const pages = track.pages || (await this.getPages(track));
    const cid = pages[page]?.cid || pages[0]?.cid;
    if (!cid) return null;
    for (const fnval of [4048, 16, 1]) {
      const q = new URLSearchParams({ bvid: track.id, cid: String(cid), fnval: String(fnval), fnver: '0', fourk: '1' });
      const data = await biliJson(`${API}/x/player/playurl?${q}`).catch(() => null);
      if (!data) continue;
      const audio = (data.dash?.audio || []).slice().sort((a, b) => b.bandwidth - a.bandwidth)[0];
      const flac = data.dash?.flac?.audio;
      const url = audio?.baseUrl || audio?.base_url || flac?.baseUrl || data.durl?.[0]?.url;
      if (url) return url;
    }
    return null;
  },

  pageUrl: (t, page = 0) => `https://www.bilibili.com/video/${t.id}${page ? `?p=${page + 1}` : ''}`,
  userUrl: (mid) => `https://space.bilibili.com/${mid}`
};
