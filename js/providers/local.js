/**
 * Local files — stored in IndexedDB so the offscreen player can read them after the popup closes.
 */

import { getLocalFile } from '../shared/db.js';

let currentUrl = '';

export function fileTrack(rec) {
  return { source: 'local', id: rec.id, name: rec.name, artists: ['本地文件'], album: `${(rec.size / 1048576).toFixed(1)} MB`, duration: rec.duration || 0, cover: '' };
}

export default {
  id: 'local',
  name: '本地',
  short: '本地',
  color: '#78909c',

  async getStreamUrl(track) {
    const rec = await getLocalFile(track.id);
    if (!rec) throw new Error('本地文件已被删除');
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(rec.blob);
    return currentUrl;
  },

  pageUrl: () => ''
};
