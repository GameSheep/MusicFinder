/**
 * NetEase Cloud Music. Search + lyric use plain endpoints; song URL uses weapi
 * (AES-CBC ×2 + RSA, needs globals aesjs / str2bigInt / powMod / bigInt2str).
 */

import { request, toHttps, toUnix } from '../shared/util.js';

const ORIGIN = 'https://music.163.com';
const AES_IV = '0102030405060708';
const AES_PRESET_KEY = '0CoJUm6Qyw8W8jud';
const RSA_EXP = '010001';
const RSA_MOD = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';

function secretKey(len) {
  const chars = '0123456789abcdef';
  let key = '';
  for (let i = 0; i < len; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

function aesEncrypt(text, key) {
  const { aesjs } = globalThis;
  const toBytes = aesjs.util.convertStringToBytes;
  const bytes = Array.from(toBytes(text));
  const pad = 16 - (bytes.length % 16);
  for (let i = 0; i < pad; i++) bytes.push(pad);
  const cbc = new aesjs.ModeOfOperation.cbc(toBytes(key), toBytes(AES_IV));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 16) {
    const block = cbc.encrypt(bytes.slice(i, i + 16));
    for (let j = 0; j < block.length; j++) bin += String.fromCharCode(block[j]);
  }
  return btoa(bin);
}

function rsaEncrypt(text) {
  const { str2bigInt, powMod, bigInt2str } = globalThis;
  const hex = [...text].reverse().map((c) => c.charCodeAt(0).toString(16)).join('');
  const res = powMod(str2bigInt(hex, 16), str2bigInt(RSA_EXP, 16), str2bigInt(RSA_MOD, 16));
  return bigInt2str(res, 16).padStart(256, '0').toLowerCase();
}

function weapi(data) {
  const key = secretKey(16);
  const form = new URLSearchParams();
  form.append('params', aesEncrypt(aesEncrypt(JSON.stringify(data), AES_PRESET_KEY), key));
  form.append('encSecKey', rsaEncrypt(key));
  return form;
}

function toTrack(s) {
  return {
    source: 'netease',
    id: String(s.id),
    name: s.name,
    artists: (s.ar || s.artists || []).map((a) => a.name),
    album: (s.al || s.album)?.name || '',
    duration: (s.dt || s.duration || 0) / 1000,
    cover: (s.al || s.album)?.picUrl ? (s.al || s.album).picUrl + '?param=100y100' : '',
    pubtime: toUnix(s.publishTime),
    vip: s.fee === 1 || s.fee === 4,
    unavailable: s.privilege ? s.privilege.st < 0 : false
  };
}

export default {
  id: 'netease',
  name: '网易云音乐',
  short: '网易云',
  color: '#e72d2c',

  async search(keyword, { page = 0, limit = 20, signal } = {}) {
    const q = new URLSearchParams({ s: keyword, type: '1', limit: String(limit), offset: String(page * limit) });
    const data = await request(`${ORIGIN}/api/cloudsearch/pc?${q}`, { signal });
    if (data.code && data.code !== 200) throw new Error(`网易云接口返回 ${data.code}`);
    const total = data.result?.songCount || 0;
    const items = (data.result?.songs || []).map(toTrack);
    return { items, total, hasMore: (page + 1) * limit < total && items.length > 0 };
  },

  async getStreamUrl(track) {
    try {
      const data = await request(`${ORIGIN}/weapi/song/enhance/player/url?csrf_token=`, {
        method: 'POST',
        body: weapi({ ids: [track.id], br: 320000, csrf_token: '' })
      });
      const url = data.data?.[0]?.url;
      if (url) return toHttps(url);
    } catch (e) {
      console.warn('[netease] weapi url failed, falling back', e);
    }
    return `${ORIGIN}/song/media/outer/url?id=${track.id}.mp3`;
  },

  async getLyric(track) {
    const data = await request(`${ORIGIN}/api/song/lyric?id=${track.id}&lv=1&tv=-1`);
    return data.lrc?.lyric || '';
  },

  pageUrl: (t) => `${ORIGIN}/#/song?id=${t.id}`
};
