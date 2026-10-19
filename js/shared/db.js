/**
 * MusicFinder — IndexedDB storage shared by popup, offscreen player and side panel.
 * Offscreen documents only get chrome.runtime, so anything the player persists lives here.
 */

const DB_NAME = 'musicfinder';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const kvGet = (key) => tx('kv', 'readonly', (s) => s.get(key));
export const kvSet = (key, value) => tx('kv', 'readwrite', (s) => { s.put(value, key); });

export const loadSnapshot = () => kvGet('player').catch(() => null);
export const saveSnapshot = (snap) => kvSet('player', snap).catch(() => {});

// ---- Local audio library ----

export async function addLocalFiles(fileList) {
  const added = [];
  for (const file of fileList) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const rec = { id, name: file.name.replace(/\.[^.]+$/, ''), type: file.type, size: file.size, added: Date.now(), blob: file };
    await tx('files', 'readwrite', (s) => { s.put(rec); });
    added.push(rec);
  }
  return added;
}

export async function listLocalFiles() {
  const all = await tx('files', 'readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => b.added - a.added);
}

export const getLocalFile = (id) => tx('files', 'readonly', (s) => s.get(id));
export const removeLocalFile = (id) => tx('files', 'readwrite', (s) => { s.delete(id); });
