/**
 * FM radio — Qingting FM mainland stations, Hong Kong stations and user-defined streams.
 */

import { request } from '../shared/util.js';

export const MAINLAND_REGIONS = [
  { id: 3, title: '北京' }, { id: 5, title: '天津' }, { id: 83, title: '上海' }, { id: 257, title: '重庆' },
  { id: 7, title: '河北' }, { id: 19, title: '山西' }, { id: 31, title: '内蒙古' }, { id: 44, title: '辽宁' },
  { id: 59, title: '吉林' }, { id: 69, title: '黑龙江' }, { id: 85, title: '江苏' }, { id: 99, title: '浙江' },
  { id: 111, title: '安徽' }, { id: 129, title: '福建' }, { id: 139, title: '江西' }, { id: 151, title: '山东' },
  { id: 169, title: '河南' }, { id: 187, title: '湖北' }, { id: 202, title: '湖南' }, { id: 217, title: '广东' },
  { id: 239, title: '广西' }, { id: 254, title: '海南' }, { id: 259, title: '四川' }, { id: 281, title: '贵州' },
  { id: 291, title: '云南' }, { id: 308, title: '西藏' }, { id: 316, title: '陕西' }, { id: 327, title: '甘肃' },
  { id: 342, title: '青海' }, { id: 351, title: '宁夏' }, { id: 357, title: '新疆' }
];

const HK = [
  ['香港电台第一台', 'RTHK Radio 1', 'https://rthkaudio1-lh.akamaihd.net/i/radio1_1@355864/master.m3u8'],
  ['香港电台第二台', 'RTHK Radio 2', 'https://rthkaudio2-lh.akamaihd.net/i/radio2_1@355865/master.m3u8'],
  ['香港电台第三台', 'RTHK Radio 3', 'https://rthkaudio3-lh.akamaihd.net/i/radio3_1@355866/master.m3u8'],
  ['香港电台第四台', 'RTHK Radio 4', 'https://rthkaudio4-lh.akamaihd.net/i/radio4_1@355867/master.m3u8'],
  ['香港电台普通话台', 'RTHK Putonghua', 'https://rthkaudio5-lh.akamaihd.net/i/radio5_1@355868/master.m3u8'],
  ['新城财经台', 'Metro Finance', 'https://metroradio-lh.akamaihd.net/i/104_h@349798/master.m3u8'],
  ['新城知讯台', 'Metro Info', 'https://metroradio-lh.akamaihd.net/i/997_h@349799/master.m3u8']
];

export const HK_STATIONS = HK.map(([name, desc, url]) => stationTrack(url, name, desc, url));

export function stationTrack(id, name, desc = '', url = '', cover = '') {
  return { source: 'radio', id: String(id), name, artists: [desc || '电台'], album: '直播', duration: 0, cover, extra: { url } };
}

export default {
  id: 'radio',
  name: '电台',
  short: '电台',
  color: '#00bcd4',

  async getStations(regionId, { signal } = {}) {
    const data = await request(`https://rapi.qingting.fm/categories/${regionId}/channels?with_total=true&page=1&pagesize=60`, { signal });
    const items = data.Data?.items || data.data?.items || data.items || [];
    return items.map((it) => stationTrack(
      it.content_id || it.id,
      it.title || it.name,
      it.nowplaying?.title || '正在直播',
      '',
      it.cover || it.thumb || ''
    ));
  },

  getStreamUrl: (track) => track.extra?.url || `https://lhttp.qingting.fm/live/${track.id}/64k.mp3`,

  pageUrl: (t) => (t.extra?.url ? t.extra.url : `https://www.qingting.fm/radios/${t.id}`)
};
