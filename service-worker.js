/**
 * MusicFinder — service worker.
 * Referer injection is static (rules.json). Here: keyboard shortcuts, offscreen creation
 * on behalf of pages without chrome.offscreen, and first-run defaults.
 */

import { sendCommand, handleEnsureMessage } from './js/shared/player-client.js';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => handleEnsureMessage(msg, sendResponse));

const COMMANDS = { 'toggle-play': 'toggle', 'next-track': 'next', 'prev-track': 'prev' };

chrome.commands.onCommand.addListener((command) => {
  const type = COMMANDS[command];
  if (type) sendCommand(type).catch((e) => console.warn('[sw] command failed', e));
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {});
});
