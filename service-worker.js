/**
 * MusicFinder — Service Worker
 * - Referer injection via declarativeNetRequest rules (rules.json)
 * - Proxies storage messages from offscreen player to popup
 * - Handles keyboard shortcut (Alt+Shift+Z)
 */

// ---------- Storage proxy ----------

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === 'storage' && msg.store_info) {
    chrome.storage.local.set(msg.store_info).then(() => {
      if (msg.callback_info) {
        // Notify connected ports (popup)
        try { chrome.runtime.connect().postMessage(msg.callback_info); } catch (e) {}
      }
    });
  }
  if (msg.action === 'lyrics' && msg.store_info) {
    // Forward to side panel
    // Side panel listens on onMessage
  }
  if (msg.action === 'lyrics-off') {
    // Side panel reset
  }
});

// ---------- Volume forwarding ----------

chrome.storage.onChanged.addListener((changes) => {
  if (changes.volume) {
    chrome.runtime.sendMessage({ action: 'background', store_info: { volume: changes.volume.newValue } });
  }
});

// ---------- Keyboard shortcut ----------

chrome.commands.onCommand.addListener((command) => {
  if (command === 'base') {
    chrome.storage.local.get(null, (data) => {
      try {
        chrome.runtime.connect().postMessage({ type: 'stop', data });
      } catch (e) {}
    });
  }
});

// ---------- Install ----------

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({ install: true });
    chrome.storage.local.set({ mf_play: false, volume: 0.8 });
  }
  chrome.action.setBadgeText({ text: '' });
});

// Default state
chrome.storage.local.set({ mf_play: false });
