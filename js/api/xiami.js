/**
 * MusicFinder — Xiami Music API
 * Uses MD5 signing with cookie-based token (xm_sg_tk).
 * Dependencies: MD5 (global from js/lib/md5.js)
 */

const XiamiAPI = (() => {
  const CONFIG = {
    origin: 'https://www.xiami.com',
    searchPath: '/api/search/searchSongs',
    detailPath: '/api/song/detail',
    playlistOrigin: 'https://emumo.xiami.com',
    maxListNumber: 50
  };

  // --- Helpers ---

  /** Extract signing token from xm_sg_tk cookie (first segment before '_'). */
  function getToken() {
    const m = document.cookie.match(/xm_sg_tk=([^;]+)/);
    return m ? m[1].split('_')[0] : '';
  }

  /**
   * Build a signed URL for the Xiami web API.
   * Signature = MD5(token + '_xmMain_' + path + '?_xm_' + sortedQueryString)
   */
  function sign(path, params) {
    const token = getToken();
    const keys = Object.keys(params).sort();
    const qs = keys.map(k => k + '=' + params[k]).join('&');
    const sig = MD5(token + '_xmMain_' + path + '?_xm_' + qs);
    return { sig, qs, token };
  }

  // --- Public API ---

  return {
    /**
     * Caesar cipher decoder for Xiami obfuscated location URLs.
     * First character = shift amount; remainder shifted back; final URI-decode;
     * '^' literal replaced with '0'.
     */
    caesar(str) {
      if (!str) return '';
      const n = parseInt(str[0]);
      let out = '';
      for (let i = 1; i < str.length; i++) {
        out += String.fromCharCode(str.charCodeAt(i) - n);
      }
      out = decodeURIComponent(out);
      return out.replace(/\^/g, '0');
    },

    /**
     * Search songs by keyword.
     * @param {string} keyword
     * @param {number} [limit=10]
     * @returns {Promise<Array<{name, id, artists, album, xiami, duration, cover, page}>>}
     */
    async search(keyword, limit = 20, page = 0) {
      const params = {
        key: keyword,
        'pagingVO.page': String(page + 1),
        'pagingVO.pageSize': String(Math.min(limit, CONFIG.maxListNumber))
      };
      const { sig, qs, token } = sign(CONFIG.searchPath, params);
      const url = CONFIG.origin + CONFIG.searchPath +
        '?_q=' + sig + '&' + qs + '&_s=' + token;

      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      const songs = (data && data.result && data.result.data && data.result.data.songs) || [];
      const total = (data && data.result && data.result.data && data.result.data.total) || 0;

      const result = songs.map(s => ({
        name: s.songName || '',
        id: s.songId || '',
        artists: (s.singerVOs || []).map(a => a.artistName || ''),
        album: (s.album || {}).albumName || '',
        xiami: s.fee || 0,
        duration: (s.duration || 0) / 1000,
        cover: s.albumLogo || '',
        page: s.songId || ''
      }));
      result._total = total;
      return result;
    },

    /**
     * Get playable audio URL for a song.
     * Fetches emumo.xiami.com playlist, decodes the obfuscated 'location' field.
     * @param {string|number} id — song ID
     * @returns {Promise<string|null>}
     */
    async getSongUrl(id) {
      const url = CONFIG.playlistOrigin + '/song/playlist/id/' + id;
      const res = await fetch(url);
      const data = await res.json();
      const tracks = (data && data.data && data.data.trackList) || [];
      if (!tracks.length) return null;
      const loc = tracks[0].location || '';
      return loc ? this.caesar(loc) : null;
    },

    /**
     * Get lyrics for a song.
     * Fetches song detail to find lyricUrl, then fetches the LRC text.
     * @param {string|number} id — song ID
     * @returns {Promise<{lyric: string}>}
     */
    async getLyric(id) {
      const params = { songId: String(id) };
      const { sig, qs, token } = sign(CONFIG.detailPath, params);
      const detailUrl = CONFIG.origin + CONFIG.detailPath +
        '?_q=' + sig + '&' + qs + '&_s=' + token;

      const res = await fetch(detailUrl, { credentials: 'include' });
      const data = await res.json();
      const d = (data && data.result && data.result.data && data.result.data.songDetail) || {};
      const lyricUrl = d.lyricUrl || d.lyric_url || '';

      if (!lyricUrl) return { lyric: '' };

      const lr = await fetch(lyricUrl);
      const text = await lr.text();
      return { lyric: text };
    }
  };
})();
