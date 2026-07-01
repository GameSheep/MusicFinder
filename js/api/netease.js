/**
 * MusicFinder — NetEase Cloud Music API
 * Uses AES-CBC + RSA encryption for weapi endpoints.
 * Dependencies: aesjs (global from js/lib/aes.js), bigint functions (global from js/lib/bigint.js)
 */

const NetEaseAPI = (() => {

  // --- Constants ---
  const AES_IV = '0102030405060708';
  const AES_PRESET_KEY = '0CoJUm6Qyw8W8jud';
  const RSA_EXP = '010001';
  const RSA_MOD = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
  const MAX_LIST = 100;

  // --- Crypto helpers ---

  function _createSecretKey(length) {
    const chars = '012345679abcdef';
    let key = '';
    for (let i = 0; i < length; i++) key += chars[Math.floor(Math.random() * chars.length)];
    return key;
  }

  function _aesEncrypt(text, key) {
    // PKCS7 padding
    const pad = 16 - (text.length % 16);
    for (let i = 0; i < pad; i++) text += String.fromCharCode(pad);

    const keyBytes = aesjs.util.convertStringToBytes(key);
    const ivBytes = aesjs.util.convertStringToBytes(AES_IV);
    const textBytes = aesjs.util.convertStringToBytes(text);
    const cbc = new aesjs.ModeOfOperation.cbc(keyBytes, ivBytes);

    const encrypted = [];
    for (let i = 0; i < textBytes.length; i += 16) {
      Array.prototype.push.apply(encrypted, cbc.encrypt(textBytes.slice(i, i + 16)));
    }

    let binStr = '';
    for (let i = 0; i < encrypted.length; i++) binStr += String.fromCharCode(encrypted[i]);
    return btoa(binStr);
  }

  function _rsaEncrypt(text, exponent, modulus) {
    const hex = text.split('').reverse().join('')
      .split('').map(c => c.charCodeAt(0).toString(16)).join('');
    const src = str2bigInt(hex, 16);
    const exp = str2bigInt(exponent, 16);
    const mod = str2bigInt(modulus, 16);
    const result = powMod(src, exp, mod);
    let str = bigInt2str(result, 16);
    while (str.length < 256) str = '0' + str;
    return str.toLowerCase();
  }

  function _encryptRequest(data) {
    const json = JSON.stringify(data);
    const secKey = _createSecretKey(16);
    const params = _aesEncrypt(_aesEncrypt(json, AES_PRESET_KEY), secKey);
    const encSecKey = _rsaEncrypt(secKey, RSA_EXP, RSA_MOD);
    return { params, encSecKey };
  }

  // --- Public API ---

  return {

    /**
     * Search songs. This endpoint uses plain POST (no weapi encryption).
     * @returns {Array<{name, id, artists, album, netease, duration, cover, page}>}
     */
    async search(keyword, limit = 20, page = 0) {
      const form = new URLSearchParams();
      form.append('s', keyword);
      form.append('offset', String(page * limit));
      form.append('limit', String(Math.min(limit, MAX_LIST)));
      form.append('type', '1');

      const res = await fetch('https://music.163.com/api/search/pc', { method: 'POST', body: form });
      const data = await res.json();
      const total = (data.result && data.result.songCount) || 0;
      const songs = (data.result && data.result.songs ? data.result.songs : []).map(s => ({
        name: s.name,
        id: s.id,
        artists: s.artists.map(a => a.name),
        album: s.album.name,
        netease: s.fee || 0,
        duration: s.duration / 1000,
        cover: s.album.picUrl || '',
        page: s.id
      }));
      songs._total = total;
      return songs;
    },

    /**
     * Get playable song URL (weapi encrypted, br=320000).
     * @returns {string|null}
     */
    async getSongUrl(id) {
      const req = _encryptRequest({ ids: [id], br: 320000, csrf_token: '' });
      const form = new URLSearchParams();
      form.append('params', req.params);
      form.append('encSecKey', req.encSecKey);

      const res = await fetch('https://music.163.com/weapi/song/enhance/player/url?csrf_token=', {
        method: 'POST', body: form
      });
      const data = await res.json();
      return data.data && data.data[0] ? data.data[0].url : null;
    },

    /**
     * Get lyrics (weapi encrypted).
     * @returns {object} { lyric: string } or original LRC object
     */
    async getLyric(id) {
      const req = _encryptRequest({ id: String(id), lv: -1, tv: -1, csrf_token: '' });
      const params = new URLSearchParams();
      params.append('params', req.params);
      params.append('encSecKey', req.encSecKey);

      const res = await fetch('https://music.163.com/weapi/song/lyric?csrf_token=', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });
      const data = await res.json();
      return data.lrc ? data.lrc : { lyric: '' };
    }
  };

})();
