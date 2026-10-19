/**
 * Music view: multi-platform search, Bilibili UP 主 browsing, favourites and local files.
 */

import { SEARCH_SOURCES, providers } from '../providers/index.js';
import bilibili from '../providers/bilibili.js';
import { fileTrack } from '../providers/local.js';
import { esc, fmtCount, friendlyError, isAbort, trackKey, debounce } from '../shared/util.js';
import { getHistory, pushHistory, clearHistory, setFavorites } from '../shared/library.js';
import { addLocalFiles, listLocalFiles, removeLocalFile } from '../shared/db.js';
import { app } from './app.js';
import {
  $, icon, toast, coverHtml, trackRow, userRow, stateHtml, skeletonHtml,
  markCurrent, markFavs, makeSortable
} from './dom.js';

const el = {};
const ui = { source: 'netease', kind: 'song', keyword: '', mode: 'search', sort: '', up: null };
const cache = new Map();
let current = null;   // { key, items, total, page, hasMore, loading, error, scrollTop }
let upReturn = null;  // list to go back to when leaving an UP 主 page
let shown = [];       // items as rendered (row data-i → item)
let localItems = [];
let history = [];
let abort = null;

const keyOf = (t) => (t.type === 'user' ? `u:${t.id}` : trackKey(t));
const isListMode = () => ui.mode === 'search' || ui.mode === 'up';

// ---------------------------------------------------------------- data

function listKey() {
  return ui.mode === 'up'
    ? `up|${ui.up.user.id}|${ui.up.order}|${ui.up.filter}`
    : `s|${ui.source}|${ui.kind}|${ui.keyword}`;
}

function viewItems() {
  if (ui.mode === 'favorites') return app.favorites;
  if (ui.mode === 'local') return localItems;
  const items = current?.items || [];
  const cmp = sortActive() && SORTS[ui.sort];
  return cmp ? [...items].sort(cmp) : items;
}

/** Items without a known date always sink to the bottom. */
const byDate = (dir) => (a, b) => (!a.pubtime || !b.pubtime ? !a.pubtime - !b.pubtime : dir * (a.pubtime - b.pubtime));
const SORTS = {
  'dur-asc': (a, b) => (a.duration || 0) - (b.duration || 0),
  'dur-desc': (a, b) => (b.duration || 0) - (a.duration || 0),
  'date-desc': byDate(-1),
  'date-asc': byDate(1)
};
/** Click cycle per sort button: off → first → second → off. */
const SORT_CYCLE = { dur: ['', 'dur-asc', 'dur-desc'], date: ['', 'date-desc', 'date-asc'] };
const sortActive = () => !!ui.sort && ui.mode === 'search' && ui.kind !== 'user';

function nextSort(field) {
  const cycle = SORT_CYCLE[field];
  if (!ui.sort.startsWith(field + '-')) return cycle[1];
  return cycle[(cycle.indexOf(ui.sort) + 1) % cycle.length];
}

function normalizeSort(v) {
  if (SORTS[v]) return v;
  if (v === 1) return 'dur-asc';
  if (v === 2) return 'dur-desc';
  return '';
}

function sortButton(field, label, title) {
  const on = ui.sort.startsWith(field + '-');
  const arrow = !on ? '' : ui.sort.endsWith('asc') ? ' ↑' : ' ↓';
  return `<button type="button" class="btn ghost sm${on ? ' is-on' : ''}" data-act="sort" data-field="${field}" title="${title}">${label}${arrow}</button>`;
}

async function runList({ refresh = false } = {}) {
  abort?.abort();
  const key = listKey();
  const cached = cache.get(key);
  if (cached && !refresh && !cached.error) {
    current = cached;
    render();
    el.scroller.scrollTop = cached.scrollTop || 0;
    if (!cached.items.length && cached.hasMore) loadMore();
    return;
  }
  current = { key, items: [], total: 0, page: -1, hasMore: true, loading: false, error: null, scrollTop: 0 };
  cache.set(key, current);
  el.scroller.scrollTop = 0;
  await loadMore();
}

async function loadMore() {
  const c = current;
  if (!c || c.loading || !c.hasMore || !isListMode()) return;
  c.loading = true;
  c.error = null;
  if (c.items.length) renderFoot(); else render();

  abort = new AbortController();
  const { signal } = abort;
  const page = c.page + 1;
  try {
    const res = ui.mode === 'up'
      ? await bilibili.getUserVideos(ui.up.user.id, { page, order: ui.up.order, keyword: ui.up.filter, upName: ui.up.user.name, signal })
      : await providers[ui.source].search(ui.keyword, { page, limit: app.settings.pageSize || 20, kind: ui.kind, signal });
    const seen = new Set(c.items.map(keyOf));
    const fresh = res.items.filter((t) => !seen.has(keyOf(t)));
    const start = c.items.length;
    c.items.push(...fresh);
    c.page = page;
    c.total = res.total || c.total;
    c.hasMore = !!res.hasMore && fresh.length > 0;
    c.loading = false;
    if (c !== current) return;
    if (start === 0) render();
    else { appendRows(fresh, start); renderHead(); }
    persist();
    fillViewport();
  } catch (e) {
    c.loading = false;
    if (!isAbort(e)) c.error = e;
    if (c === current) renderFoot();
  }
}

/** Keep loading while the list doesn't fill the scroller yet. */
function fillViewport() {
  requestAnimationFrame(() => {
    if (!current?.hasMore || current.loading) return;
    const { scrollHeight, clientHeight } = el.scroller;
    if (scrollHeight <= clientHeight + 120) loadMore();
  });
}

function retry() {
  if (current && !current.items.length) {
    cache.delete(current.key);
    runList();
  } else loadMore();
}

async function reloadLocal() {
  localItems = (await listLocalFiles()).map(fileTrack);
  if (ui.mode === 'local') render();
}

// ---------------------------------------------------------------- render

function render() {
  syncChips();
  renderKind();
  renderHead();
  shown = viewItems();
  el.list.innerHTML = shown.map(rowFor).join('');
  renderFoot();
}

function rowFor(t, i) {
  if (t.type === 'user') return userRow(t, i);
  return trackRow(t, i, {
    favKeys: app.favKeys,
    currentKey: app.currentKey,
    showSource: ui.mode === 'favorites',
    removable: ui.mode === 'favorites' || ui.mode === 'local',
    draggable: ui.mode === 'favorites',
    showDate: sortActive() && ui.sort.startsWith('date-')
  });
}

function appendRows(items, start) {
  if (sortActive()) return render();
  shown = viewItems();
  el.list.insertAdjacentHTML('beforeend', items.map((t, k) => rowFor(t, start + k)).join(''));
  renderFoot();
}

function idleHtml() {
  const chips = history.slice(0, 8).map((h) => `<button type="button" class="btn sm" data-history="${esc(h)}">${esc(h)}</button>`).join('');
  const p = providers[ui.source];
  return stateHtml({
    icon: ui.kind === 'user' ? 'user' : 'search',
    title: ui.kind === 'user' ? '搜索 B 站 UP 主' : `在${p.name}中搜索`,
    text: ui.kind === 'user' ? '输入 UP 主昵称，进入后可浏览、搜索和连播 TA 的投稿' : '输入歌曲、歌手或专辑后回车；切换上方平台会用同一关键词重新搜索',
    action: chips ? `<div class="state-hint">${chips}</div>` : ''
  });
}

function errorHtml(e) {
  const needKey = e.code === 'NEED_KEY';
  return stateHtml({
    icon: 'alert', cls: 'error',
    title: needKey ? '需要 API Key' : '加载失败',
    text: esc(friendlyError(e)),
    action: needKey
      ? '<button type="button" class="btn primary sm" data-act="options">打开设置</button>'
      : '<button type="button" class="btn primary sm" data-act="retry">重试</button>'
  });
}

function dropHtml(compact) {
  return `<label class="drop" data-drop>${icon('upload')}<div>${compact ? '继续添加本地音频' : '点击选择或拖入音频文件'}</div>
    <small>文件保存在扩展本地存储中，关闭弹窗后也能播放</small>
    <input type="file" accept="audio/*" multiple data-local-input></label>`;
}

function renderFoot() {
  const c = current;
  let html = '';
  if (ui.mode === 'favorites') {
    html = app.favorites.length ? '' : stateHtml({ icon: 'heart', title: '还没有收藏', text: '在任意歌曲上点击 ♥ 即可收藏，支持拖拽排序' });
  } else if (ui.mode === 'local') {
    html = dropHtml(localItems.length > 0);
  } else if (ui.mode === 'search' && !ui.keyword) {
    html = idleHtml();
  } else if (c?.loading) {
    html = c.items.length ? '<div class="spinner"></div>' : skeletonHtml();
  } else if (c?.error) {
    html = c.items.length ? '<button type="button" class="btn sm" data-act="retry">加载失败，点击重试</button>' : errorHtml(c.error);
  } else if (c && !c.items.length) {
    html = stateHtml({ icon: 'search', title: '没有找到结果', text: '换个关键词，或切换到其他平台试试' });
  } else if (c && !c.hasMore && c.items.length > 10) {
    html = '— 没有更多了 —';
  }
  el.foot.innerHTML = html;
}

function renderHead() {
  if (ui.mode === 'up') return renderUpHead();
  delete el.head.dataset.up;
  const playAll = `<button type="button" class="btn primary sm" data-act="playall">${icon('play')}播放全部</button>`;
  let title = '';
  let actions = '';
  if (ui.mode === 'favorites') {
    if (!app.favorites.length) { el.head.innerHTML = ''; return; }
    title = `<b>我的收藏</b> · ${app.favorites.length} 首`;
    actions = `<button type="button" class="btn ghost sm" data-act="shuffle">${icon('shuffle')}随机</button>${playAll}`;
  } else if (ui.mode === 'local') {
    if (!localItems.length) { el.head.innerHTML = ''; return; }
    title = `<b>本地音乐</b> · ${localItems.length} 首`;
    actions = playAll;
  } else if (ui.keyword && current?.items.length) {
    const p = providers[ui.source];
    const what = ui.kind === 'user' ? '位 UP 主' : '条结果';
    title = `<b>${esc(p.name)}</b>${current.total ? ` · ${fmtCount(current.total)} ${what}` : ''}`;
    if (ui.kind !== 'user') {
      const hasDate = current.items.some((t) => t.pubtime);
      actions = `<span class="sort-group">${icon('sort')}${sortButton('dur', '时长', '按时长排序')}${hasDate ? sortButton('date', '发布', '按发布时间排序（先新后旧）') : ''}</span>${playAll}`;
    }
  } else {
    el.head.innerHTML = '';
    return;
  }
  el.head.innerHTML = `<div class="head-row"><span class="head-title">${title}</span>${actions}</div>`;
}

function renderUpHead() {
  const { user, order, filter } = ui.up;
  const total = current?.total ? ` · 投稿 ${current.total}` : user.videos ? ` · 投稿 ${user.videos}` : '';
  if (el.head.dataset.up === user.id) {
    el.head.querySelectorAll('[data-order]').forEach((b) => b.classList.toggle('is-on', b.dataset.order === order));
    const sub = el.head.querySelector('.up-sub');
    if (sub) sub.textContent = `粉丝 ${fmtCount(user.fans)}${total}`;
    return;
  }
  el.head.dataset.up = user.id;
  el.head.innerHTML = `
    <div class="up-head">
      <button type="button" class="ibtn" data-act="back" title="返回 (Esc)">${icon('chevron-left')}</button>
      ${coverHtml(user.avatar, 'bilibili', 'round md', user.name.slice(0, 1))}
      <div class="up-meta">
        <div class="up-name">${esc(user.name)}</div>
        <div class="up-sub">粉丝 ${fmtCount(user.fans)}${total}</div>
      </div>
      <button type="button" class="btn primary sm" data-act="playall">${icon('play')}播放全部</button>
    </div>
    <div class="up-tools">
      <div class="seg seg-sm">
        <button type="button" data-order="pubdate" class="${order === 'pubdate' ? 'is-on' : ''}">最新</button>
        <button type="button" data-order="click" class="${order === 'click' ? 'is-on' : ''}">最热</button>
      </div>
      <input class="field" id="upFilter" type="search" placeholder="搜索 TA 的投稿，回车确认" value="${esc(filter)}">
      <button type="button" class="ibtn sm" data-act="space" title="打开 UP 主空间">${icon('external')}</button>
    </div>`;
}

function syncChips() {
  for (const b of el.chips.children) {
    const on = b.dataset.source ? ui.mode !== 'favorites' && ui.mode !== 'local' && b.dataset.source === ui.source : b.dataset.mode === ui.mode;
    b.classList.toggle('is-on', !!on);
  }
}

function renderKind() {
  const kinds = providers[ui.source]?.kinds;
  const show = !!kinds && ui.mode === 'search';
  el.kind.hidden = !show;
  if (show) {
    el.kind.innerHTML = kinds.map((k) => `<button type="button" data-kind="${k.id}" class="${k.id === ui.kind ? 'is-on' : ''}">${k.label}</button>`).join('');
  }
  el.q.placeholder = ui.mode === 'favorites' || ui.mode === 'local'
    ? '搜索歌曲（回车在当前平台搜索）'
    : ui.kind === 'user' ? '搜索 B 站 UP 主' : `在${providers[ui.source]?.short || ''}搜索歌曲、歌手、专辑`;
}

// ---------------------------------------------------------------- actions

function setSource(id) {
  ui.mode = 'search';
  ui.up = null;
  upReturn = null;
  ui.source = id;
  if (!providers[id].kinds) ui.kind = 'song';
  if (ui.keyword) runList(); else { current = null; render(); }
  persist();
}

function setMode(mode) {
  abort?.abort();
  ui.mode = mode;
  ui.up = null;
  upReturn = null;
  el.scroller.scrollTop = 0;
  if (mode === 'local') reloadLocal();
  render();
  persist();
}

function submitSearch(term) {
  const keyword = (term ?? el.q.value).trim();
  if (!keyword) return;
  el.q.value = keyword;
  const same = keyword === ui.keyword && ui.mode === 'search';
  ui.keyword = keyword;
  if (ui.mode !== 'search') { ui.mode = 'search'; ui.up = null; upReturn = null; }
  hideHistory();
  el.q.blur();
  pushHistory(keyword).then(loadHistory);
  runList({ refresh: same });
  persist();
}

function openUp(user) {
  abort?.abort();
  upReturn = { current, scrollTop: el.scroller.scrollTop };
  ui.mode = 'up';
  ui.up = { user, order: 'pubdate', filter: '' };
  runList();
  persist();
}

function leaveUp() {
  if (ui.mode !== 'up') return false;
  abort?.abort();
  ui.mode = 'search';
  ui.up = null;
  const back = upReturn;
  upReturn = null;
  current = back?.current || cache.get(listKey()) || null;
  render();
  el.scroller.scrollTop = back?.scrollTop || 0;
  persist();
  return true;
}

async function removeItem(item) {
  if (ui.mode === 'favorites') {
    await setFavorites(app.favorites.filter((t) => trackKey(t) !== trackKey(item)));
  } else if (ui.mode === 'local') {
    await removeLocalFile(item.id);
    await reloadLocal();
  }
}

async function addFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|flac|wav|ogg|opus|webm)$/i.test(f.name));
  if (!list.length) return toast('请选择音频文件');
  await addLocalFiles(list);
  await reloadLocal();
  toast(`已添加 ${list.length} 个文件`);
}

async function playAll(shuffle = false) {
  const items = shown.filter((t) => t.type !== 'user');
  if (!items.length) return;
  if (shuffle) await app.player.send('mode', { mode: 'shuffle' });
  app.play(items, shuffle ? Math.floor(Math.random() * items.length) : 0);
}

// ---------------------------------------------------------------- history dropdown

async function loadHistory() {
  history = await getHistory();
}

function showHistory() {
  if (!history.length) return hideHistory();
  el.history.innerHTML = `
    <div class="history-head"><span>最近搜索</span><button type="button" data-clear>清空</button></div>
    <div class="history-items">${history.map((h) => `<button type="button" data-history="${esc(h)}">${esc(h)}</button>`).join('')}</div>`;
  el.history.hidden = false;
}

function hideHistory() {
  el.history.hidden = true;
}

// ---------------------------------------------------------------- persistence

const persist = debounce(() => {
  if (current) current.scrollTop = el.scroller.scrollTop;
  const pack = (c) => c && { key: c.key, items: c.items, total: c.total, page: c.page, hasMore: c.hasMore, scrollTop: c.scrollTop };
  chrome.storage.session.set({
    mf_music: {
      source: ui.source, kind: ui.kind, keyword: ui.keyword, mode: ui.mode, sort: ui.sort, up: ui.up,
      current: pack(current),
      upReturn: upReturn && { current: pack(upReturn.current), scrollTop: upReturn.scrollTop }
    }
  }).catch(() => {});
}, 300);

async function restore() {
  const { mf_music: s } = await chrome.storage.session.get('mf_music').catch(() => ({}));
  if (!s) {
    ui.source = providers[app.settings.defaultSource] ? app.settings.defaultSource : 'netease';
    return;
  }
  Object.assign(ui, { source: providers[s.source] ? s.source : 'netease', kind: s.kind || 'song', keyword: s.keyword || '', mode: s.mode || 'search', sort: normalizeSort(s.sort), up: s.up || null });
  if (ui.mode === 'up' && !ui.up) ui.mode = 'search';
  const unpack = (c) => c && { ...c, loading: false, error: null };
  current = unpack(s.current);
  if (current) cache.set(current.key, current);
  if (s.upReturn) {
    upReturn = { current: unpack(s.upReturn.current), scrollTop: s.upReturn.scrollTop };
    if (upReturn.current) cache.set(upReturn.current.key, upReturn.current);
  }
  el.q.value = ui.keyword;
}

// ---------------------------------------------------------------- init

export async function initMusic() {
  Object.assign(el, {
    q: $('#q'), form: $('#searchForm'), kind: $('#kindToggle'), history: $('#history'),
    chips: $('#sourceChips'), head: $('#musicHead'), scroller: $('#musicScroller'),
    list: $('#musicList'), foot: $('#musicFoot')
  });

  el.chips.innerHTML = SEARCH_SOURCES.map((p) =>
    `<button type="button" role="tab" class="chip" data-source="${p.id}" style="--c:${p.color}" title="${esc(p.name)}">${esc(p.short)}</button>`
  ).join('') + `<span class="chip-sep"></span>
    <button type="button" role="tab" class="chip no-dot icon-only" data-mode="favorites" title="我的收藏" aria-label="我的收藏">${icon('heart')}</button>
    <button type="button" role="tab" class="chip no-dot icon-only" data-mode="local" title="本地音乐" aria-label="本地音乐">${icon('upload')}</button>`;

  await Promise.all([restore(), loadHistory()]);
  if (ui.mode === 'local') await reloadLocal();
  render();
  if (current) el.scroller.scrollTop = current.scrollTop || 0;
  if (isListMode() && ui.keyword && (!current || (!current.items.length && current.hasMore))) runList();

  // --- search box
  el.form.addEventListener('submit', (e) => { e.preventDefault(); submitSearch(); });
  el.q.addEventListener('focus', showHistory);
  el.q.addEventListener('input', () => (el.q.value ? hideHistory() : showHistory()));
  el.q.addEventListener('blur', () => setTimeout(hideHistory, 120));
  el.history.addEventListener('mousedown', (e) => e.preventDefault());
  el.history.addEventListener('click', async (e) => {
    if (e.target.closest('[data-clear]')) {
      await clearHistory();
      history = [];
      hideHistory();
      if (!ui.keyword) renderFoot();
      return;
    }
    const h = e.target.closest('[data-history]');
    if (h) submitSearch(h.dataset.history);
  });
  el.kind.addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b || b.dataset.kind === ui.kind) return;
    ui.kind = b.dataset.kind;
    if (ui.keyword) runList(); else render();
    persist();
  });

  // --- chips
  el.chips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    if (b.dataset.source) {
      if (b.dataset.source !== ui.source || !isListMode() || ui.mode === 'up') setSource(b.dataset.source);
    } else if (b.dataset.mode !== ui.mode) setMode(b.dataset.mode);
  });

  // --- head actions
  el.head.addEventListener('click', (e) => {
    const order = e.target.closest('[data-order]');
    if (order && ui.up && order.dataset.order !== ui.up.order) {
      ui.up.order = order.dataset.order;
      runList();
      persist();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'playall') playAll();
    else if (act === 'shuffle') playAll(true);
    else if (act === 'back') leaveUp();
    else if (act === 'space' && ui.up) chrome.tabs.create({ url: bilibili.userUrl(ui.up.user.id) });
    else if (act === 'sort') {
      ui.sort = nextSort(e.target.closest('[data-field]').dataset.field);
      render();
      persist();
    }
  });
  el.head.addEventListener('keydown', (e) => {
    if (e.target.id !== 'upFilter' || e.key !== 'Enter' || !ui.up) return;
    ui.up.filter = e.target.value.trim();
    runList();
    persist();
  });
  el.head.addEventListener('search', (e) => {
    if (e.target.id === 'upFilter' && !e.target.value && ui.up?.filter) {
      ui.up.filter = '';
      runList();
      persist();
    }
  }, true);

  // --- list
  el.list.addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    const i = +row.dataset.i;
    const item = shown[i];
    if (!item) return;
    if (item.type === 'user') return openUp(item);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'fav') return app.toggleFav(item);
    if (act === 'open') return app.openPage(item);
    if (act === 'next') return app.playNext(item);
    if (act === 'remove') return removeItem(item);
    if (e.target.closest('.grip')) return;
    app.play(shown, i);
  });
  makeSortable(el.list, async (from, to) => {
    if (ui.mode !== 'favorites') return;
    const list = [...app.favorites];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    await setFavorites(list);
  });

  // --- footer / empty states
  el.foot.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'retry') retry();
    else if (act === 'options') chrome.runtime.openOptionsPage();
    const h = e.target.closest('[data-history]');
    if (h) submitSearch(h.dataset.history);
  });
  el.foot.addEventListener('change', (e) => {
    if (e.target.matches('[data-local-input]') && e.target.files.length) addFiles(e.target.files);
  });
  el.scroller.addEventListener('dragover', (e) => {
    if (ui.mode !== 'local' || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    el.foot.querySelector('[data-drop]')?.classList.add('is-over');
  });
  el.scroller.addEventListener('dragleave', () => el.foot.querySelector('[data-drop]')?.classList.remove('is-over'));
  el.scroller.addEventListener('drop', (e) => {
    if (ui.mode !== 'local') return;
    e.preventDefault();
    el.foot.querySelector('[data-drop]')?.classList.remove('is-over');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  // --- infinite scroll
  new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting)) loadMore();
  }, { root: el.scroller, rootMargin: '0px 0px 300px 0px' }).observe(el.foot);
  el.scroller.addEventListener('scroll', persist, { passive: true });

  // --- cross-view sync
  app.on('favorites', () => {
    if (ui.mode === 'favorites') {
      const top = el.scroller.scrollTop;
      render();
      el.scroller.scrollTop = top;
    } else markFavs(el.list, app.favKeys);
  });
  app.on('track', (key) => markCurrent(el.list, key));
}

export const musicView = {
  focusSearch: () => el.q?.focus(),
  back: () => leaveUp()
};
