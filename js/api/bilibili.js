/**
 * MusicFinder — Bilibili API
 * Referer injected by declarativeNetRequest (rules.json). Cookies set via chrome.cookies (guarded).
 */

const BiliAPI = (() => {
  function htmlDecode(str) {
    return new DOMParser().parseFromString(str, 'text/html').body.textContent;
  }

  function convertSong(v) {
    return {
      id: 'bitrack_v_' + v.bvid,
      name: htmlDecode(v.title),
      artists: [htmlDecode(v.author)],
      artistId: 'biartist_v_' + v.mid,
      album: 'bilibili',
      sourceUrl: 'https://www.bilibili.com/' + v.bvid,
      cover: v.pic && v.pic.startsWith('//') ? 'https:' + v.pic : v.pic || '',
      page: 'bitrack_v_' + v.bvid,
      duration: v.duration || 0
    };
  }

  function extractBvid(id) {
    return id.replace('bitrack_v_', '').split('-')[0];
  }

  // ponytail: buvid3/buvid4 cookies help Bilibili anti-bot; skip if chrome.cookies unavailable (e.g. offscreen context)
  async function ensureCookies() {
    if (typeof chrome?.cookies?.get !== 'function') return;
    try {
      const expires = (Date.now() + 31536000000) / 1000;
      const b3 = await chrome.cookies.get({ url: 'https://.bilibili.com', name: 'buvid3' });
      if (!b3) await chrome.cookies.set({ url: 'https://.bilibili.com', name: 'buvid3', value: crypto.randomUUID(), expirationDate: expires });
      const b4 = await chrome.cookies.get({ url: 'https://.bilibili.com', name: 'buvid4' });
      if (!b4) await chrome.cookies.set({ url: 'https://.bilibili.com', name: 'buvid4', value: crypto.randomUUID(), expirationDate: expires });
    } catch (e) {
      // Non-critical — Bilibili search/audio works without these cookies when WBI-signed
    }
  }

  // ---- WBI signing: the 412 wall needs w_rid + wts on the search endpoint ----
  // ponytail: MD5 comes from js/lib/md5.js; the rotating key is fetched from /nav.
  const MIXIN_KEY_ENC_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
  let _wbiCache = { key: null, ts: 0 };

  function deriveMixinKey(raw) {
    return MIXIN_KEY_ENC_TAB.map(i => raw[i]).join('').slice(0, 32);
  }

  async function getMixinKey() {
    // Key rotates slowly — cache 30 min to avoid an extra /nav hit per search.
    if (_wbiCache.key && Date.now() - _wbiCache.ts < 30 * 60 * 1000) return _wbiCache.key;
    const navRes = await fetch('https://api.bilibili.com/x/web-interface/nav', { credentials: 'include' });
    const nav = await navRes.json();
    const img = (nav.data && nav.data.wbi && nav.data.wbi.img) || {};
    const imgKey = (img.img_url || '').replace(/^.*\/([^/]+)\.[^.]+$/, '$1');
    const subKey = (img.sub_url || '').replace(/^.*\/([^/]+)\.[^.]+$/, '$1');
    if (!imgKey || !subKey) throw new Error('Bilibili WBI key unavailable');
    _wbiCache = { key: deriveMixinKey(imgKey + subKey), ts: Date.now() };
    return _wbiCache.key;
  }

  function wbiSign(params, mixinKey) {
    const withTs = Object.assign({}, params, { wts: Math.floor(Date.now() / 1000) });
    const query = Object.keys(withTs).sort().map(k => {
      const v = String(withTs[k] == null ? '' : withTs[k]).replace(/[!'()*]/g, '');
      return encodeURIComponent(k) + '=' + encodeURIComponent(v);
    }).join('&');
    return query + '&w_rid=' + MD5(query + mixinKey);
  }

  function toQuery(params) {
    return Object.keys(params).map(k =>
      encodeURIComponent(k) + '=' + encodeURIComponent(params[k] == null ? '' : params[k])
    ).join('&');
  }

  return {
    async search(keyword, limit = 20, page = 0) {
      await ensureCookies();
      const params = {
        search_type: 'video',
        keyword,
        page: page + 1,
        page_size: limit,
        platform: 'pc',
        highlight: 1,
        single_column: 0,
        dynamic_offset: 0,
        preload: true,
        com2co: true
      };
      // Sign when we can; fall back to unsigned so a /nav hiccup never hard-fails a search.
      let query;
      try { query = wbiSign(params, await getMixinKey()); }
      catch (e) { query = toQuery(params); }

      const url = `https://api.bilibili.com/x/web-interface/search/type?${query}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.status === 412 || res.status === 429) {
        throw new Error(`Bilibili risk control blocked the request (${res.status})`);
      }
      if (!res.ok) throw new Error(`Bilibili API error (${res.status})`);
      const data = await res.json();
      if (data.code === -412) throw new Error('Bilibili risk control blocked the request (412)');
      if (data.code !== 0) throw new Error(`Bilibili API code ${data.code}`);
      const total = (data.data && data.data.numResults) || 0;
      const result = (data.data && data.data.result ? data.data.result : []).map(convertSong);
      result._total = total;
      return result;
    },

    // player.js calls getSongUrl on every module; alias bilibili's audio resolver to that name
    getSongUrl(id) { return this.getAudioUrl(id); },

    async getAudioUrl(id) {
      try {
        await ensureCookies();
        const bvid = extractBvid(id);
        const parts = id.split('-');

        const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
        const viewRes = await fetch(viewUrl, { credentials: 'include' });
        const viewData = await viewRes.json();
        if (!viewData || !viewData.data || !viewData.data.pages || !viewData.data.pages.length) {
          console.warn('MusicFinder: bilibili view API returned no pages for', bvid);
          return null;
        }

        let cid = parts.length > 1 ? parts[1] : viewData.data.pages[0].cid;

        // Try DASH (separate audio track) first, then fall back to durl (combined stream)
        // fnval: 4048 = DASH+FLAC+Hi-Res+Dolby; 16 = basic DASH; 1 = durl format
        for (const fnval of [4048, 16, 1]) {
          const playUrl = `https://api.bilibili.com/x/player/playurl?fnval=${fnval}&bvid=${bvid}&cid=${cid}`;
          const playRes = await fetch(playUrl, { credentials: 'include' });
          const playData = await playRes.json();
          if (playData && playData.data) {
            // DASH format — separate audio track
            if (playData.data.dash && playData.data.dash.audio && playData.data.dash.audio.length > 0) {
              return playData.data.dash.audio[0].baseUrl;
            }
            // durl format — combined audio+video, playable as audio for podcasts/talk shows
            if (playData.data.durl && playData.data.durl.length > 0) {
              return playData.data.durl[0].url;
            }
          }
        }
        console.warn('MusicFinder: bilibili playurl returned no playable url for', bvid, cid);
        return null;
      } catch (e) {
        console.error('MusicFinder: bilibili getAudioUrl failed', e);
        return null;
      }
    },

    async getPages(id) {
      try {
        await ensureCookies();
        const bvid = extractBvid(id);
        const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
        const res = await fetch(url, { credentials: 'include' });
        const data = await res.json();
        if (!data || !data.data || !data.data.pages) return [];
        return data.data.pages.map(p => ({
          cid: p.cid, part: p.part, duration: p.duration
        }));
      } catch (e) {
        console.error('MusicFinder: bilibili getPages failed', e);
        return [];
      }
    },

    async getLyric() {
      return { lyric: '' };
    }
  };
})();
