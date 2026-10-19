import { getSettings, saveSettings, getFavorites, setFavorites, migrateLegacy, slimTrack, FAV_MAX } from './shared/library.js';
import { trackKey } from './shared/util.js';

const SOURCES = [
  ['netease', '网易云音乐'], ['qq', 'QQ 音乐'], ['kuwo', '酷我音乐'], ['kugou', '酷狗音乐'], ['migu', '咪咕音乐'],
  ['bilibili', '哔哩哔哩'], ['audius', 'Audius'], ['apple', 'Apple 试听'], ['youtube', 'YouTube']
];
const SWATCHES = ['#7c5cff', '#3b82f6', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#fb7299'];
const BACKUP_KEY = 'mf_favorites_backup';

const $ = (id) => document.getElementById(id);
const form = $('settingsForm');

let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function applyTheme(color) {
  document.documentElement.style.setProperty('--accent', color);
  for (const b of $('swatches').children) b.classList.toggle('is-on', b.dataset.c === color);
}

async function refreshFavInfo() {
  const [list, { [BACKUP_KEY]: backup }] = await Promise.all([getFavorites(), chrome.storage.local.get(BACKUP_KEY)]);
  $('favInfo').textContent = `当前共 ${list.length} 首（上限 ${FAV_MAX}）` + (backup?.length ? `，备份中有 ${backup.length} 首` : '');
  $('restoreBtn').disabled = !backup?.length;
  $('exportBtn').disabled = !list.length;
  $('clearBtn').disabled = !list.length;
}

async function backupCurrent() {
  await chrome.storage.local.set({ [BACKUP_KEY]: await getFavorites() });
}

function normalize(data) {
  const raw = Array.isArray(data) ? data : Array.isArray(data?.favorites) ? data.favorites : null;
  if (!raw) throw new Error('文件格式不正确');
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const t = item?.source && item?.id != null
      ? slimTrack({ ...item, id: String(item.id), artists: Array.isArray(item.artists) ? item.artists : [] })
      : migrateLegacy(item);
    if (!t || seen.has(trackKey(t))) continue;
    seen.add(trackKey(t));
    out.push(t);
  }
  return out;
}

async function exportFavs() {
  const list = await getFavorites();
  const blob = new Blob([JSON.stringify({ app: 'MusicFinder', version: 2, favorites: list }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `musicfinder-favorites-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`已导出 ${list.length} 首`);
}

function importFavs() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,.mf,application/json';
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const incoming = normalize(JSON.parse(await f.text()));
      if (!incoming.length) throw new Error('文件中没有可导入的歌曲');
      const current = await getFavorites();
      await backupCurrent();
      const keys = new Set(current.map(trackKey));
      const merged = [...current, ...incoming.filter((t) => !keys.has(trackKey(t)))];
      await setFavorites(merged);
      toast(`导入完成，新增 ${Math.min(merged.length, FAV_MAX) - current.length} 首`);
    } catch (e) {
      toast('导入失败：' + (e instanceof SyntaxError ? '不是有效的 JSON 文件' : e.message));
    }
    refreshFavInfo();
  };
  inp.click();
}

async function restoreFavs() {
  const { [BACKUP_KEY]: backup } = await chrome.storage.local.get(BACKUP_KEY);
  if (!backup?.length) return toast('没有可用的备份');
  if (!confirm(`用备份中的 ${backup.length} 首替换当前收藏？`)) return;
  const current = await getFavorites();
  await setFavorites(backup);
  await chrome.storage.local.set({ [BACKUP_KEY]: current });
  toast('已恢复备份（原收藏已存为新备份）');
  refreshFavInfo();
}

async function clearFavs() {
  if (!confirm('确定清空全部收藏？清空前会自动备份。')) return;
  await backupCurrent();
  await setFavorites([]);
  toast('已清空');
  refreshFavInfo();
}

async function init() {
  $('version').textContent = `版本 ${chrome.runtime.getManifest().version}`;
  $('defaultSource').innerHTML = SOURCES.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
  $('swatches').innerHTML = SWATCHES.map((c) => `<button type="button" class="swatch" data-c="${c}" style="--c:${c}" title="${c}"></button>`).join('');

  const s = await getSettings();
  form.theme.value = s.theme;
  form.defaultSource.value = s.defaultSource;
  form.pageSize.value = String(s.pageSize);
  form.appleCountry.value = s.appleCountry;
  form.youtubeKey.value = s.youtubeKey;
  applyTheme(s.theme);

  $('swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    form.theme.value = b.dataset.c;
    applyTheme(b.dataset.c);
  });
  form.theme.addEventListener('input', () => applyTheme(form.theme.value));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveSettings({
      theme: form.theme.value,
      defaultSource: form.defaultSource.value,
      pageSize: +form.pageSize.value,
      appleCountry: form.appleCountry.value,
      youtubeKey: form.youtubeKey.value.trim()
    });
    toast('设置已保存');
  });

  $('exportBtn').addEventListener('click', exportFavs);
  $('importBtn').addEventListener('click', importFavs);
  $('restoreBtn').addEventListener('click', restoreFavs);
  $('clearBtn').addEventListener('click', clearFavs);
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && (c.mf_favorites || c[BACKUP_KEY])) refreshFavInfo(); });
  refreshFavInfo();
}

init();
