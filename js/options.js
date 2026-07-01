const $ = (s) => document.querySelector(s);
const DEFAULTS = { themeColor: '#1db954', homeMode: 'lyric', mvSource: 'youtube', favoritesBackup: null };

function show(msg, ok = true) {
  const el = $('#mfStatus');
  el.textContent = msg;
  el.style.color = ok ? '#1db954' : '#e74c3c';
  setTimeout(() => el.textContent = '', 2500);
}

function load() {
  chrome.storage.sync.get(DEFAULTS, (s) => {
    $('#themeColor').value = s.themeColor;
    $(`[name="homeMode"][value="${s.homeMode}"]`).checked = true;
    $(`[name="mvSource"][value="${s.mvSource}"]`).checked = true;
  });
}

function save() {
  chrome.storage.sync.get(['favoritesBackup'], (prev) => {
    const cfg = {
      themeColor: $('#themeColor').value,
      homeMode: $('[name="homeMode"]:checked').value,
      mvSource: $('[name="mvSource"]:checked').value,
      favoritesBackup: prev.favoritesBackup
    };
    chrome.storage.sync.set(cfg, () => show('Saved'));
  });
}

function importPlaylist() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.mf';
  inp.onchange = () => {
    const f = inp.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        // ponytail: backup existing before overwriting
        chrome.storage.sync.get(['favorites'], (old) => {
          chrome.storage.sync.set({ favoritesBackup: old.favorites || null }, () => {});
        });
        chrome.storage.sync.set({ favorites: data }, () => show('Playlist imported'));
      } catch { show('Invalid .mf file', false); }
    };
    r.readAsText(f);
  };
  inp.click();
}

function exportPlaylist() {
  chrome.storage.sync.get(['favorites'], (s) => {
    if (!s.favorites) return show('No favorites to export', false);
    const blob = new Blob([JSON.stringify(s.favorites, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'musicfinder-favorites.mf';
    a.click();
    show('Exported');
  });
}

function resetToBackup() {
  chrome.storage.sync.get(['favoritesBackup'], (s) => {
    if (!s.favoritesBackup) return show('No backup found', false);
    chrome.storage.sync.set({ favorites: s.favoritesBackup }, () => show('Restored from backup'));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  $('#saveBtn').addEventListener('click', save);
  $('#importBtn').addEventListener('click', importPlaylist);
  $('#exportBtn').addEventListener('click', exportPlaylist);
  $('#resetBtn').addEventListener('click', resetToBackup);
});
