/**
 * Live smoke test for every search provider: search → stream URL → lyric.
 * Usage: node tools/smoke-providers.mjs [keyword] [sourceId...]
 * Mimics the extension environment: rules.json Referer injection, MD5 global, chrome.storage stub.
 */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
vm.runInThisContext(readFileSync(root + 'js/lib/md5.js', 'utf8'));
vm.runInThisContext(readFileSync(root + 'js/lib/bigint.js', 'utf8'));
{
  // aes.js picks its Node branch when `exports` exists; give it a browser-like sandbox instead.
  const sandbox = { encodeURI, Uint8Array };
  vm.runInNewContext(readFileSync(root + 'js/lib/aes.js', 'utf8'), sandbox);
  globalThis.aesjs = sandbox.aesjs;
}
globalThis.chrome = { storage: { sync: { get: async () => ({}) }, local: { get: async () => ({}) } } };
globalThis.DOMParser = undefined;

const rules = JSON.parse(readFileSync(root + 'rules.json', 'utf8'));
const realFetch = globalThis.fetch;
const BUVID = crypto.randomUUID();
globalThis.fetch = (url, init = {}) => {
  const headers = new Headers(init.headers || {});
  const host = new URL(url).hostname;
  for (const r of rules) {
    const f = r.condition.urlFilter;
    const re = r.condition.regexFilter;
    const domain = f?.startsWith('||') ? f.slice(2).replace(/\^.*$/, '') : null;
    const hit = (domain && (host === domain || host.endsWith('.' + domain))) || (re && new RegExp(re).test(url));
    if (hit) for (const h of r.action.requestHeaders || []) headers.set(h.header, h.value);
  }
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36');
  // In the extension, ensureCookies() puts buvid3 into the browser cookie jar.
  if (host.endsWith('bilibili.com')) headers.set('Cookie', `buvid3=${BUVID}infoc`);
  return realFetch(url, { ...init, headers });
};

const { SEARCH_SOURCES } = await import('../js/providers/index.js');
const [kw = '周杰伦', ...only] = process.argv.slice(2);
const short = (s, n = 90) => (s && s.length > n ? s.slice(0, n) + '…' : s);

let failed = 0;
for (const p of SEARCH_SOURCES) {
  if (only.length && !only.includes(p.id)) continue;
  const line = [`[${p.id}]`];
  try {
    const kind = p.kinds ? 'song' : undefined;
    const res = await p.search(p.id === 'audius' ? 'lofi' : kw, { page: 0, limit: 8, kind });
    line.push(`search ok: ${res.items.length} items, total=${res.total}, hasMore=${res.hasMore}`);
    const t = res.items.find((i) => !i.vip && !i.unavailable) || res.items[0];
    if (!t) throw new Error('no items');
    line.push(`  first: ${t.name} / ${t.artists.join(',')} / ${t.album} / ${Math.round(t.duration)}s / cover=${!!t.cover} vip=${!!t.vip}`);
    const url = await p.getStreamUrl(t);
    line.push(`  stream: ${short(typeof url === 'string' ? url : JSON.stringify(url))}`);
    if (p.getLyric) {
      const lrc = await p.getLyric(t).catch((e) => `ERR ${e.message}`);
      line.push(`  lyric: ${short(String(lrc).replace(/\s+/g, ' '), 70) || '(empty)'}`);
    }
    if (p.id === 'bilibili') {
      const users = await p.search(kw, { kind: 'user', limit: 5 });
      const u = users.items[0];
      line.push(`  users: ${users.items.length} first=${u?.name} fans=${u?.fans} videos=${u?.videos}`);
      if (u) {
        const vids = await p.getUserVideos(u.id, { limit: 5, upName: u.name });
        line.push(`  up videos: ${vids.items.length}/${vids.total} first=${vids.items[0]?.name}`);
      }
      const pages = await p.getPages(t);
      line.push(`  pages: ${pages.length}`);
    }
  } catch (e) {
    failed++;
    line.push(`  FAILED: ${e.message}`);
  }
  console.log(line.join('\n') + '\n');
}
process.exit(failed ? 1 : 0);
