/**
 * MusicFinder — shared helpers (no DOM dependency, usable in every context).
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export const stripTags = (s) => String(s ?? '').replace(/<[^>]*>/g, '');
export const cleanText = (s) => decodeEntities(stripTags(s)).trim();

export const toHttps = (u) => {
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  return u.replace(/^http:\/\//, 'https://');
};

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(+sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function fmtCount(n) {
  n = +n || 0;
  if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万';
  return String(n);
}

/** ms / s timestamp or date string → unix seconds (0 if unknown). */
export function toUnix(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v > 1e11 ? Math.round(v / 1000) : v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.round(t / 1000) : 0;
}

export function fmtDate(sec) {
  if (!sec) return '';
  const d = new Date(sec * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "03:20" | "1:02:03" | 200 → seconds */
export function parseClock(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const parts = String(v).split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function lrcTag(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(2).padStart(5, '0');
  return `[${String(m).padStart(2, '0')}:${s}]`;
}

/** LRC text → [{ t, text }] sorted by time. Supports multiple tags per line. */
export function parseLrc(text) {
  if (!text) return [];
  const out = [];
  const tag = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
  for (const line of String(text).split(/\r?\n/)) {
    const times = [];
    let m;
    let end = 0;
    tag.lastIndex = 0;
    while ((m = tag.exec(line))) {
      times.push(+m[1] * 60 + parseFloat(m[2].replace(':', '.')));
      end = tag.lastIndex;
    }
    const content = decodeEntities(line.slice(end)).trim();
    if (!times.length || !content) continue;
    for (const t of times) out.push({ t, text: content });
  }
  return out.sort((a, b) => a.t - b.t);
}

export function base64ToUtf8(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * fetch with timeout + external abort signal; throws on non-2xx.
 * type: 'json' | 'text' | 'response'
 */
export async function request(url, { signal, timeout = 12000, type = 'json', ...init } = {}) {
  const signals = [AbortSignal.timeout(timeout)];
  if (signal) signals.push(signal);
  const res = await fetch(url, { ...init, signal: AbortSignal.any(signals) });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (type === 'response') return res;
  if (type === 'text') return res.text();
  return res.json();
}

export function debounce(fn, ms = 250) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

export const trackKey = (t) => (t ? `${t.source}:${t.id}` : '');

export const isAbort = (e) => e?.name === 'AbortError';

/** Human-friendly message for a provider error. */
export function friendlyError(e) {
  const msg = (e && e.message) || String(e || '');
  if (e?.name === 'TimeoutError') return '请求超时，请稍后重试';
  if (/412|risk|风控|-352/i.test(msg)) return '触发了平台风控，请稍等几秒再试';
  if (/429/.test(msg)) return '请求太频繁，请稍后再试';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return '网络错误，请检查网络连接';
  return msg || '未知错误';
}
