/**
 * MusicFinder — Migu Music API
 * No encryption needed; uses public search and listen-url endpoints.
 */

const MiguAPI = (() => {
  const CONFIG = {
    searchUrl: 'https://m.music.migu.cn/migu/remoting/scr_search_tag',
    listenUrl: 'https://app.c.nf.migu.cn/MIGUM2.0/v2.0/content/listen-url',
    channel: '0146951',
    uid: 1234
  };

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function fmtDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return pad2(m) + ':' + pad2(s);
  }

  function resolveCover(item) {
    return item.picM || item.pic || item.img || item.cover || item.image || '';
  }

  function resolveArtists(item) {
    if (Array.isArray(item.artists)) return item.artists.map(a => (typeof a === 'string' ? a : a.name));
    if (item.singerName) return item.singerName.split(/[,、/]/).map(s => s.trim()).filter(Boolean);
    if (item.singers && Array.isArray(item.singers)) return item.singers.map(s => s.name || s.singerName);
    return [];
  }

  return {
    async search(keyword, limit = 20, page = 0) {
      const params = new URLSearchParams({
        keyword: keyword,
        type: '2',
        pgc: String(page + 1),
        rows: String(Math.min(limit, 50))
      });
      const url = CONFIG.searchUrl + '?' + params.toString();
      const res = await fetch(url);
      const data = await res.json();

      const raw = (data && data.data && data.data.songList) || (data && data.songList) || (data && data.result && data.result.songs) || [];
      const total = (data && data.data && data.data.total) || (data && data.total) || 0;
      const result = raw.map((item) => {
        const miguId = item.copyrightId || item.songId || item.id || '';
        return {
          name: item.songName || item.name || item.title || '',
          id: miguId,
          migu_id: miguId,
          artists: resolveArtists(item),
          album: item.albumName || item.album || item.albumTitle || '',
          duration: fmtDuration(item.duration || item.length || item.durationSec || 0),
          cover: resolveCover(item),
          page: miguId,
          mp3: item.mp3 || item.listenUrl || item.url || ''
        };
      });
      result._total = total;
      return result;
    },

    async getSongUrl(id) {
      const params = new URLSearchParams({
        copyrightId: id,
        resourceType: '2'
      });
      const url = CONFIG.listenUrl + '?' + params.toString();
      const res = await fetch(url, {
        headers: {
          channel: CONFIG.channel,
          uid: String(CONFIG.uid)
        }
      });
      const data = await res.json();
      if (data && data.data) {
        return data.data.url || data.data.mp3 || data.data.listenUrl || null;
      }
      return null;
    }
  };
})();
