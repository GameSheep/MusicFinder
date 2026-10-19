/**
 * Radio view: Qingting FM by province, Hong Kong stations, custom stream URLs.
 */

import radio, { MAINLAND_REGIONS, HK_STATIONS, stationTrack } from '../providers/radio.js';
import { esc, friendlyError } from '../shared/util.js';
import { app } from './app.js';
import { $, $$, icon, toast, trackRow, stateHtml, skeletonHtml, markCurrent, markFavs } from './dom.js';

const el = {};
let tab = 'mainland';
let region = null;            // { id, title } when browsing a province
const stationCache = new Map();
let custom = [];
let shown = [];
let loadingRegion = 0;

const filterText = () => el.filter.value.trim().toLowerCase();
const match = (t) => !filterText() || `${t.name} ${t.artists.join(' ')}`.toLowerCase().includes(filterText());

function renderList(items, emptyText) {
  shown = items.filter(match);
  if (!shown.length) {
    el.body.innerHTML = stateHtml({ icon: 'search', title: emptyText || '没有匹配的电台' });
    return;
  }
  el.body.innerHTML = `<ul class="list" id="radioList">${shown.map((t, i) =>
    trackRow(t, i, { favKeys: app.favKeys, currentKey: app.currentKey, noQueue: true, removable: tab === 'custom' })
  ).join('')}</ul>`;
}

async function render() {
  $$('#radioTabs button').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === tab));
  el.filter.hidden = tab === 'mainland' && !region;
  el.head.innerHTML = '';

  if (tab === 'hk') {
    el.head.innerHTML = '<div class="head-row"><span class="head-title">港台电台为 HLS 直播流，部分浏览器版本可能无法播放</span></div>';
    return renderList(HK_STATIONS);
  }

  if (tab === 'custom') {
    el.body.innerHTML = `
      <form class="form-card" id="customForm">
        <div class="form-card-title">添加自定义电台</div>
        <input class="field" name="name" placeholder="名称，例如：我的电台" required>
        <input class="field" name="url" type="url" placeholder="音频流地址 (mp3 / aac / m3u8)" required>
        <button type="submit" class="btn primary sm">${icon('plus')}添加并播放</button>
      </form>
      <div id="customList"></div>`;
    const listBox = $('#customList');
    const items = custom.filter(match);
    shown = items;
    listBox.innerHTML = items.length
      ? `<ul class="list" id="radioList">${items.map((t, i) => trackRow(t, i, { favKeys: app.favKeys, currentKey: app.currentKey, noQueue: true, removable: true })).join('')}</ul>`
      : '';
    return;
  }

  if (!region) {
    shown = [];
    el.body.innerHTML = `<div class="grid">${MAINLAND_REGIONS.map((r) => `<button type="button" data-region="${r.id}">${esc(r.title)}</button>`).join('')}</div>`;
    return;
  }

  el.head.innerHTML = `<div class="head-row"><button type="button" class="head-crumb" data-act="regions">${icon('chevron-left')}全部地区</button><span class="head-title"> / <b>${esc(region.title)}</b></span></div>`;
  if (stationCache.has(region.id)) return renderList(stationCache.get(region.id), '该地区暂无电台');

  const token = ++loadingRegion;
  el.body.innerHTML = skeletonHtml(6);
  try {
    const stations = await radio.getStations(region.id);
    stationCache.set(region.id, stations);
    if (token === loadingRegion) renderList(stations, '该地区暂无电台');
  } catch (e) {
    if (token !== loadingRegion) return;
    el.body.innerHTML = stateHtml({ icon: 'alert', cls: 'error', title: '电台加载失败', text: esc(friendlyError(e)), action: '<button type="button" class="btn primary sm" data-act="retry">重试</button>' });
  }
}

async function saveCustom() {
  await chrome.storage.local.set({ mf_radio_custom: custom });
}

export async function initRadio() {
  Object.assign(el, { body: $('#radioBody'), head: $('#radioHead'), filter: $('#radioFilter') });
  const { mf_radio_custom } = await chrome.storage.local.get('mf_radio_custom');
  custom = Array.isArray(mf_radio_custom) ? mf_radio_custom : [];

  $('#radioTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === tab) return;
    tab = b.dataset.tab;
    el.filter.value = '';
    render();
  });
  el.filter.addEventListener('input', render);
  el.head.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="regions"]')) { region = null; el.filter.value = ''; render(); }
  });

  el.body.addEventListener('click', (e) => {
    const r = e.target.closest('[data-region]');
    if (r) {
      region = MAINLAND_REGIONS.find((x) => x.id === +r.dataset.region);
      return render();
    }
    if (e.target.closest('[data-act="retry"]')) {
      stationCache.delete(region?.id);
      return render();
    }
    const row = e.target.closest('.row');
    if (!row) return;
    const i = +row.dataset.i;
    const t = shown[i];
    if (!t) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'fav') return app.toggleFav(t);
    if (act === 'open') return app.openPage(t);
    if (act === 'remove') {
      custom = custom.filter((c) => c.id !== t.id);
      saveCustom();
      return render();
    }
    app.play(shown, i);
  });

  el.body.addEventListener('submit', (e) => {
    if (e.target.id !== 'customForm') return;
    e.preventDefault();
    const f = new FormData(e.target);
    const name = String(f.get('name') || '').trim();
    const url = String(f.get('url') || '').trim();
    if (!/^https?:\/\//i.test(url)) return toast('请输入 http(s) 开头的地址');
    const t = stationTrack(url, name || '自定义电台', '自定义', url);
    custom = [t, ...custom.filter((c) => c.id !== t.id)];
    saveCustom();
    render();
    app.play([t], 0);
  });

  app.on('track', (key) => { const l = $('#radioList'); if (l) markCurrent(l, key); });
  app.on('favorites', () => { const l = $('#radioList'); if (l) markFavs(l, app.favKeys); });

  render();
}
