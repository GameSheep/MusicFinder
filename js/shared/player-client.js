/**
 * MusicFinder — talking to the offscreen player.
 * Commands go through runtime.sendMessage (works from popup, side panel and service worker);
 * state/time/lyrics are pushed back over a long-lived port while a UI is open.
 */

import { loadSnapshot } from './db.js';

export const CMD = 'mf:cmd';
export const READY = 'mf:ready';
const ENSURE = 'mf:ensure-offscreen';
const PORT_NAME = 'mf-player';

let creating = null;

export async function hasOffscreen() {
  try {
    if (chrome.offscreen?.hasDocument) return await chrome.offscreen.hasDocument();
    const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    return ctx.length > 0;
  } catch {
    return false;
  }
}

export async function ensureOffscreen() {
  if (!chrome.offscreen?.createDocument) {
    await chrome.runtime.sendMessage({ channel: ENSURE });
    return;
  }
  if (await hasOffscreen()) return;
  creating ??= chrome.offscreen
    .createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Play music in the background' })
    .catch((e) => { if (!/single offscreen/i.test(e.message)) throw e; })
    .finally(() => { creating = null; });
  await creating;
}

export async function sendCommand(type, payload = {}) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ channel: CMD, type, ...payload });
}

/** Service-worker side of ENSURE, for contexts without chrome.offscreen. */
export function handleEnsureMessage(msg, sendResponse) {
  if (msg?.channel !== ENSURE) return false;
  ensureOffscreen().then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: e.message }));
  return true;
}

export const EMPTY_STATE = {
  track: null, queue: [], index: -1, playing: false, loading: false,
  currentTime: 0, duration: 0, volume: 0.8, muted: false, mode: 'list',
  page: 0, pages: null, embed: false, error: ''
};

/**
 * UI-side mirror of the player. Emits: 'state', 'time', 'lyrics', 'toast'.
 */
export class PlayerClient extends EventTarget {
  constructor() {
    super();
    this.state = { ...EMPTY_STATE };
    this.lyrics = { key: '', lines: [], loading: false };
    this.port = null;
  }

  async init() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.channel === READY) this.connect();
    });
    if (await hasOffscreen()) {
      this.connect();
    } else {
      const snap = await loadSnapshot();
      if (snap) {
        this.state = { ...EMPTY_STATE, ...snap, playing: false, loading: false };
        this.emit('state');
      }
    }
  }

  connect() {
    if (this.port) return;
    try {
      this.port = chrome.runtime.connect({ name: PORT_NAME });
    } catch {
      return;
    }
    this.port.onMessage.addListener((m) => this.onMessage(m));
    this.port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      this.port = null;
      if (this.state.playing || this.state.loading) {
        this.state = { ...this.state, playing: false, loading: false };
        this.emit('state');
      }
    });
  }

  onMessage(m) {
    if (m.type === 'state') {
      this.state = m.state;
      this.emit('state');
    } else if (m.type === 'time') {
      this.state.currentTime = m.currentTime;
      this.state.duration = m.duration;
      this.emit('time');
    } else if (m.type === 'lyrics') {
      this.lyrics = { key: m.key, lines: m.lines || [], loading: !!m.loading };
      this.emit('lyrics');
    } else if (m.type === 'toast') {
      this.emit('toast', m.text);
    }
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on(type, fn) {
    this.addEventListener(type, (e) => fn(e.detail));
  }

  async send(type, payload = {}) {
    await sendCommand(type, payload);
    this.connect();
  }
}
