/**
 * MusicFinder — QQ Music API
 * Uses public QQ Music HTTP endpoints with fetch().
 */
const QQAPI = (() => {
  const SEARCH_URL = 'https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp';
  const SONG_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
  const LYRIC_URL = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric.fcg';

  function getGTK() {
    // Use fixed g_tk value — document.cookie is unreliable in extension popups
    return 938407465;
  }

  return {
    async search(keyword, limit = 20, page = 0) {
      const params = new URLSearchParams({
        w: keyword,
        p: String(page + 1),
        n: String(limit),
        format: 'json',
        g_tk: String(getGTK()),
        uin: '0',
        catZhida: '1',
        zhidaqu: '1',
        t: '0',
        flag: '1',
        ie: 'utf-8',
        sem: '1',
        aggr: '0',
        remoteplace: 'txt.mqq.all',
        _: String(Date.now())
      });

      const res = await fetch(`${SEARCH_URL}?${params}`);
      const data = await res.json();
      const songs = (data.data && data.data.song && data.data.song.list || []);
      const total = (data.data && data.data.song && data.data.song.totalnum) || 0;

      const result = songs.map(s => ({
        name: s.songname || s.name || '',
        id: `${s.songmid}__${s.songid}`,
        artists: (s.singer || []).map(a => a.name),
        album: s.albumname || (s.album && s.album.name) || '',
        qq: (s.pay && s.pay.payplay) || 0,
        duration: s.interval || 0,
        cover: s.albummid
          ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.albummid}.jpg`
          : '',
        page: s.songmid
      }));
      result._total = total;
      return result;
    },

    async getSongUrl(id) {
      const [songmid] = id.split('__');
      const guid = String(Math.random() * 10000000 | 0);

      const reqData = JSON.stringify({
        req_0: {
          module: 'vkey.GetVkeyServer',
          method: 'CgiGetVkey',
          param: {
            guid,
            songmid: [songmid],
            songtype: [0],
            uin: '0',
            loginflag: 0,
            platform: '20'
          }
        }
      });

      const params = new URLSearchParams({
        data: reqData,
        format: 'json'
      });

      const res = await fetch(`${SONG_URL}?${params}`);
      const data = await res.json();
      const midInfo = data.req_0 && data.req_0.data && data.req_0.data.midurlinfo;
      if (!midInfo || !midInfo[0] || !midInfo[0].purl) return null;

      const sip = (data.req_0.data.sip || [])[0] || 'http://ws.stream.qqmusic.qq.com/';
      return sip + midInfo[0].purl;
    },

    async getLyric(id) {
      const [, songid] = id.split('__');
      const params = new URLSearchParams({
        songid,
        format: 'json',
        nobase64: '1',
        g_tk: String(getGTK())
      });

      const res = await fetch(`${LYRIC_URL}?${params}`, {
        headers: { Referer: 'https://y.qq.com/' }
      });
      const data = await res.json();
      return data.lyric || data.lrc || { lyric: '' };
    }
  };
})();
