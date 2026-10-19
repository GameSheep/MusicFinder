import { esc, fmtTime, fmtDate, trackKey } from '../shared/util.js';
import { providers, sourceName } from '../providers/index.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

let toastTimer = 0;
export function toast(text, ms = 2400) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function coverHtml(url, source, cls = '', fallback = '') {
  const color = providers[source]?.color || '';
  if (url) {
    return `<div class="cover ${cls}" style="--c:${color}"><img src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-ph="${esc(fallback || sourceName(source).slice(0, 1))}"></div>`;
  }
  return `<div class="cover ph ${cls}" style="--c:${color}">${esc(fallback || sourceName(source).slice(0, 1))}</div>`;
}

/** Broken cover images fall back to a coloured initial (no inline handlers under MV3 CSP). */
export function installImageFallback(root = document) {
  root.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.parentElement?.classList.contains('cover')) return;
    const box = img.parentElement;
    box.classList.add('ph');
    box.textContent = img.dataset.ph || '♪';
  }, true);
}

export function stateHtml({ icon: ic = 'music', title = '', text = '', action = '', cls = '' }) {
  return `<div class="state ${cls}">${icon(ic)}${title ? `<div class="state-title">${esc(title)}</div>` : ''}${text ? `<div>${text}</div>` : ''}${action}</div>`;
}

export const skeletonHtml = (n = 8) =>
  Array.from({ length: n }, () => '<div class="skel"><div class="cover"></div><div><i></i><i></i></div></div>').join('');

/**
 * One list row for a track. opts: { favKeys, currentKey, showSource, removable, draggable, index, showDate }
 */
export function trackRow(t, i, opts = {}) {
  const key = trackKey(t);
  const fav = opts.favKeys?.has(key);
  const cls = ['row', key === opts.currentKey ? 'is-current' : '', t.unavailable ? 'is-off' : ''].join(' ');
  const tags = [
    t.vip ? '<span class="tag">VIP</span>' : '',
    t.preview ? '<span class="tag ok">试听</span>' : '',
    opts.showSource ? `<span class="tag src" style="--c:${providers[t.source]?.color || '#888'}">${esc(sourceName(t.source))}</span>` : ''
  ].join('');
  const sub = [opts.showDate ? fmtDate(t.pubtime) : '', (t.artists || []).join(' / '), t.album].filter(Boolean).join(' · ');
  const canOpen = !!providers[t.source]?.pageUrl?.(t);
  return `<li class="${cls}" data-i="${i}" data-key="${esc(key)}"${opts.draggable ? ' draggable="true"' : ''}>
  ${opts.draggable ? `<span class="grip">${icon('grip')}</span>` : ''}
  ${opts.index ? `<span class="idx">${i + 1}</span>` : ''}
  ${coverHtml(t.cover, t.source)}
  <div class="row-main">
    <div class="row-title"><span class="t" title="${esc(t.name)}">${esc(t.name)}</span>${tags}</div>
    <div class="row-sub">${esc(sub) || '&nbsp;'}</div>
  </div>
  <div class="row-side">
    <span class="dur">${t.duration ? fmtTime(t.duration) : ''}</span>
    <span class="ibtn sm row-fav${fav ? ' is-on' : ''}">${icon('heart')}</span>
    <div class="row-act">
      ${opts.noQueue ? '' : `<button type="button" class="ibtn sm" data-act="next" title="下一首播放">${icon('list-plus')}</button>`}
      ${canOpen ? `<button type="button" class="ibtn sm" data-act="open" title="在平台中打开">${icon('external')}</button>` : ''}
      ${t.source === 'local' ? '' : `<button type="button" class="ibtn sm fav${fav ? ' is-on' : ''}" data-act="fav" title="${fav ? '取消收藏' : '收藏'}">${icon('heart')}</button>`}
      ${opts.removable ? `<button type="button" class="ibtn sm" data-act="remove" title="移除">${icon('trash')}</button>` : ''}
    </div>
  </div>
</li>`;
}

export function userRow(u, i) {
  return `<li class="row" data-i="${i}" data-user="${esc(u.id)}">
  ${coverHtml(u.avatar, 'bilibili', 'round', u.name.slice(0, 1))}
  <div class="row-main">
    <div class="row-title"><span class="t">${esc(u.name)}</span>${u.verified ? '<span class="tag ok">认证</span>' : ''}</div>
    <div class="row-sub">粉丝 ${esc(formatFans(u.fans))} · 视频 ${u.videos}${u.sign ? ' · ' + esc(u.sign) : ''}</div>
  </div>
  <span class="row-chev">${icon('chevron-right')}</span>
</li>`;
}

function formatFans(n) {
  n = +n || 0;
  return n >= 1e4 ? (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万' : String(n);
}

/** Update the current-track highlight inside a list without re-rendering it. */
export function markCurrent(listEl, key) {
  listEl.querySelector('.row.is-current')?.classList.remove('is-current');
  if (key) listEl.querySelector(`.row[data-key="${CSS.escape(key)}"]`)?.classList.add('is-current');
}

/** Sync favourite hearts in a rendered list. */
export function markFavs(listEl, favKeys) {
  for (const row of listEl.querySelectorAll('.row[data-key]')) {
    const on = favKeys.has(row.dataset.key);
    row.querySelector('.row-fav')?.classList.toggle('is-on', on);
    const b = row.querySelector('[data-act="fav"]');
    if (b) { b.classList.toggle('is-on', on); b.title = on ? '取消收藏' : '收藏'; }
  }
}

/** Minimal HTML5 drag-to-reorder for <li draggable>. */
export function makeSortable(listEl, onMove) {
  let dragEl = null;
  let from = -1;
  listEl.addEventListener('dragstart', (e) => {
    dragEl = e.target.closest('li[draggable]');
    if (!dragEl) return;
    from = [...listEl.children].indexOf(dragEl);
    dragEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  listEl.addEventListener('dragover', (e) => {
    if (!dragEl) return;
    e.preventDefault();
    const over = e.target.closest('li[draggable]');
    if (!over || over === dragEl) return;
    const r = over.getBoundingClientRect();
    listEl.insertBefore(dragEl, e.clientY > r.top + r.height / 2 ? over.nextSibling : over);
  });
  listEl.addEventListener('dragend', () => {
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    const to = [...listEl.children].indexOf(dragEl);
    dragEl = null;
    if (from >= 0 && to >= 0 && from !== to) onMove(from, to);
  });
}
