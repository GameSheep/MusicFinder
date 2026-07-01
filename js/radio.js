/**
 * MusicFinder — FM Radio Data & Logic
 */

/** Chinese mainland region data for Qingting FM radio categories */
const RADIO_REGIONS = {
  success: 'ok',
  data: [
    { id: 1, title: '北京' },   { id: 2, title: '天津' },   { id: 3, title: '上海' },
    { id: 4, title: '重庆' },   { id: 5, title: '河北' },   { id: 6, title: '山西' },
    { id: 7, title: '辽宁' },   { id: 8, title: '吉林' },   { id: 9, title: '黑龙江' },
    { id: 10, title: '江苏' },  { id: 11, title: '浙江' },  { id: 12, title: '安徽' },
    { id: 13, title: '福建' },  { id: 14, title: '江西' },  { id: 15, title: '山东' },
    { id: 16, title: '河南' },  { id: 17, title: '湖北' },  { id: 18, title: '湖南' },
    { id: 19, title: '广东' },  { id: 20, title: '广西' },  { id: 21, title: '海南' },
    { id: 22, title: '四川' },  { id: 23, title: '贵州' },  { id: 24, title: '云南' },
    { id: 25, title: '西藏' },  { id: 26, title: '陕西' },  { id: 27, title: '甘肃' },
    { id: 28, title: '青海' },  { id: 29, title: '宁夏' },  { id: 30, title: '新疆' },
    { id: 31, title: '香港' }
  ]
};

/** Hong Kong / Taiwan radio stations */
const HK_RADIOS = [
  { title: '香港电台第一台',    desc: 'RTHK Radio 1',  address: 'https://rthkaudio1-lh.akamaihd.net/i/radio1_1@355864/master.m3u8' },
  { title: '香港电台第二台',    desc: 'RTHK Radio 2',  address: 'https://rthkaudio2-lh.akamaihd.net/i/radio2_1@355865/master.m3u8' },
  { title: '香港电台第三台',    desc: 'RTHK Radio 3',  address: 'https://rthkaudio3-lh.akamaihd.net/i/radio3_1@355866/master.m3u8' },
  { title: '香港电台第四台',    desc: 'RTHK Radio 4',  address: 'https://rthkaudio4-lh.akamaihd.net/i/radio4_1@355867/master.m3u8' },
  { title: '香港电台普通话台',  desc: 'RTHK Putonghua', address: 'https://rthkaudio5-lh.akamaihd.net/i/radio5_1@355868/master.m3u8' },
  { title: '新城财经台',       desc: 'Metro Finance',  address: 'https://metroradio-lh.akamaihd.net/i/104_h@349798/master.m3u8', type: 'm3u8' },
  { title: '新城知讯台',       desc: 'Metro Info',     address: 'https://metroradio-lh.akamaihd.net/i/997_h@349799/master.m3u8', type: 'm3u8' }
];

/**
 * Fetch radio stations for a region from Qingting FM API.
 * @param {number} regionId
 * @returns {Promise<Array>}
 */
async function fetchRadioStations(regionId) {
  const url = `http://rapi.qingting.fm/categories/${regionId}/channels?with_total=true&page=1&pagesize=36`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.Data && data.Data.items) ? data.Data.items.map(item => ({
    id: item.content_id,
    title: item.title,
    nowPlaying: (item.nowplaying && item.nowplaying.title) ? item.nowplaying.title : '-'
  })) : [];
}
