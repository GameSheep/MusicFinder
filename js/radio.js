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
 * Fetch all live radio categories from Qingting FM open API.
 * Falls back to hardcoded region list on failure.
 * @returns {Promise<Array<{id: number, title: string}>>}
 */
async function fetchRadioCategories() {
  // Try open API v7 first
  let res;
  const urls = [
    'https://open.qingting.fm/media/v7/categories',
    'http://open.qingting.fm/media/v7/categories',
    'https://rapi.qingting.fm/categories',
    'http://rapi.qingting.fm/categories'
  ];
  for (const url of urls) {
    try { res = await fetch(url); if (res.ok) break; } catch (e) {}
  }
  if (!res || !res.ok) throw new Error('All category endpoints failed');
  const data = await res.json();
  const items = data.Data || data.data || data.Data?.items || [];
  return Array.isArray(items) ? items.map(item => ({
    id: item.id || item.category_id,
    title: item.title || item.name
  })) : [];
}

/**
 * Fetch radio stations for a region from Qingting FM API.
 * @param {number} regionId
 * @returns {Promise<Array>}
 */
async function fetchRadioStations(regionId) {
  let res;
  try { res = await fetch(`https://rapi.qingting.fm/categories/${regionId}/channels?with_total=true&page=1&pagesize=36`); } catch (e) {}
  if (!res || !res.ok) {
    res = await fetch(`http://rapi.qingting.fm/categories/${regionId}/channels?with_total=true&page=1&pagesize=36`);
  }
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const data = await res.json();
  const items = data.Data?.items || data.data?.items || data.items || data.Data || [];
  return Array.isArray(items) ? items.map(item => ({
    id: item.content_id || item.id,
    title: item.title || item.name,
    nowPlaying: (item.nowplaying && item.nowplaying.title) ? item.nowplaying.title : '-'
  })) : [];
}

/**
 * Resolve Qingting FM station ID to a live stream URL.
 * @param {number|string} stationId — Qingting content_id
 * @returns {Promise<string>} stream URL
 */
async function fetchRadioStreamUrl(stationId) {
  const url = `https://lhttp.qingting.fm/live/${stationId}/64k.mp3`;
  const res = await fetch(url, { method: 'HEAD' });
  if (res.ok) return url;
  // Fallback: try 128k
  const alt = `https://lhttp.qingting.fm/live/${stationId}/128k.mp3`;
  const res2 = await fetch(alt, { method: 'HEAD' });
  if (res2.ok) return alt;
  throw new Error('Cannot resolve stream URL for station ' + stationId);
}
