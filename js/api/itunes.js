/**
 * MusicFinder -- iTunes Search API module
 * Uses public iTunes Search API + RSS feed fetching via fetch().
 * Dependencies: browser-native DOMParser
 */

const ITUNES_CONFIG = {};

const ItunesAPI = (() => {
  const BASE = 'https://itunes.apple.com';

  /**
   * Strip HTML/CDATA and decode entities from RSS text content.
   * @param {string} str
   * @returns {string}
   */
  function cleanText(str) {
    if (!str) return '';
    return str
      .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  /**
   * Extract text content from an XML element by tag name.
   * @param {Element} parent
   * @param {string} tag
   * @returns {string}
   */
  function getText(parent, tag) {
    const el = parent.querySelector(tag);
    return el ? cleanText(el.textContent) : '';
  }

  /**
   * Parse iTunes duration string (HH:MM:SS, MM:SS, or bare seconds) into total seconds.
   * @param {string} duration
   * @returns {number}
   */
  function parseDuration(duration) {
    if (!duration) return 0;
    const parts = duration.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Number(duration) || 0;
  }

  // --- Public API ---
  return {
    /**
     * Search iTunes for podcasts.
     * @param {string} term
     * @param {number} [limit=20]
     * @returns {Promise<Array>}
     */
    async search(term, limit = 20) {
      if (!term) throw new Error('Search term is required.');

      const params = new URLSearchParams({
        media: 'podcast',
        term,
        limit: String(Math.min(limit, 200))
      });

      const res = await fetch(`${BASE}/search?${params}`);
      if (!res.ok) {
        throw new Error(`iTunes API error: ${res.status}`);
      }

      const data = await res.json();
      return (data.results || []).map(item => ({
        name: item.collectionName || item.trackName || '',
        id: String(item.collectionId || item.trackId || ''),
        artist: item.artistName || '',
        genre: item.primaryGenreName || '',
        cover: item.artworkUrl600 || item.artworkUrl100 || '',
        feedUrl: item.feedUrl || '',
        trackCount: item.trackCount || 0
      }));
    },

    /**
     * Fetch a podcast RSS feed and extract episode metadata.
     * @param {string} feedUrl
     * @returns {Promise<Array>}
     */
    async getEpisodes(feedUrl) {
      if (!feedUrl) throw new Error('Feed URL is required.');

      const res = await fetch(feedUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch feed: ${res.status}`);
      }

      const xmlText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'application/xml');

      const parseErr = doc.querySelector('parsererror');
      if (parseErr) {
        throw new Error('Failed to parse RSS feed XML.');
      }

      const items = Array.from(doc.querySelectorAll('item'));
      return items.map(item => {
        const enclosure = item.querySelector('enclosure');
        const itunesDuration = getText(item, 'itunes\\:duration') || getText(item, 'duration');

        return {
          title: getText(item, 'title'),
          url: enclosure ? enclosure.getAttribute('url') || '' : '',
          duration: parseDuration(itunesDuration),
          pubDate: getText(item, 'pubDate'),
          description: getText(item, 'description')
        };
      });
    }
  };
})();
