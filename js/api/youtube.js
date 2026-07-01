/**
 * MusicFinder -- YouTube Data API v3 module
 * Uses public YouTube search endpoint via fetch().
 * Dependencies: none
 */

const YOUTUBE_CONFIG = { apiKey: '' };

const YouTubeAPI = (() => {
  const BASE = 'https://www.googleapis.com/youtube/v3';

  // --- Public API ---
  return {
    /**
     * Search YouTube videos.
     * @param {string} keyword
     * @param {number} [limit=5]
     * @param {string} [apiKey] -- defaults to YOUTUBE_CONFIG.apiKey
     * @returns {Promise<Array>}
     */
    async search(keyword, limit = 5, apiKey) {
      const key = apiKey || YOUTUBE_CONFIG.apiKey;
      if (!key) {
        console.warn('YouTube API key not set. Get one at https://console.cloud.google.com/apis/credentials');
        return [];
      }

      const params = new URLSearchParams({
        part: 'snippet',
        maxResults: String(Math.min(limit, 50)),
        q: keyword,
        type: 'video',
        key
      });

      const res = await fetch(`${BASE}/search?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ? err.error.message : `YouTube API error: ${res.status}`);
      }

      const data = await res.json();
      return (data.items || []).map(item => ({
        name: item.snippet.title,
        id: item.id.videoId,
        artists: [],
        album: 'YouTube',
        cover: item.snippet.thumbnails.default ? item.snippet.thumbnails.default.url : '',
        page: item.id.videoId
      }));
    },

    /**
     * Build a YouTube watch URL from a video ID.
     * @param {string} id
     * @returns {string}
     */
    getVideoUrl(id) {
      return 'https://www.youtube.com/watch?v=' + id;
    }
  };
})();
