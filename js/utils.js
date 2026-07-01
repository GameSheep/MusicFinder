/**
 * MusicFinder — Shared Utilities
 */

const Utils = {

  /**
   * Parse LRC format lyrics into timed segments.
   * @param {string} lrcText — raw LRC text with [mm:ss.xx] timestamps
   * @returns {Array<{t: number, c: string}>}
   */
  parseLyrics(lrcText) {
    if (!lrcText) return [];
    const result = [];
    const lines = lrcText.split('\n');
    for (const line of lines) {
      const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
      if (!m) continue;
      const sec = parseInt(m[1]) * 60 + parseFloat(m[2]);
      const text = m[3].trim();
      if (text) result.push({ t: +sec.toFixed(3), c: text });
    }
    return result;
  },

  /**
   * Format seconds to mm:ss string.
   * @param {number} pct — percentage 0-100
   * @param {number} totalMs — total duration in seconds
   * @returns {string}
   */
  formatTime(pct, totalSec) {
    const p = +pct;
    const d = +totalSec;
    if (isNaN(p) || isNaN(d) || !isFinite(p) || !isFinite(d)) return '0:00';
    const s = Math.floor((p / 100) * d);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  },

  /**
   * Convert timestamp to "X月Y日" format.
   * @param {number} ts — Unix timestamp in ms
   * @returns {string}
   */
  dateText(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  },

  /**
   * Random float between min and max.
   */
  randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  },

  /**
   * Simple debounce.
   */
  debounce(fn, ms = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  },

  /**
   * Escape HTML entities.
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * Show a temporary alert message.
   * @param {string} msg
   * @param {number} duration — ms
   */
  flashAlert(msg, duration = 2000) {
    const el = document.querySelector('.mf-alert');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => el.classList.remove('show'), duration);
  }
};
