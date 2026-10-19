import netease from './netease.js';
import qq from './qq.js';
import kuwo from './kuwo.js';
import kugou from './kugou.js';
import migu from './migu.js';
import bilibili from './bilibili.js';
import audius from './audius.js';
import apple from './apple.js';
import youtube from './youtube.js';
import podcast from './podcast.js';
import radio from './radio.js';
import local from './local.js';

/** Order = chip order in the search view. */
export const SEARCH_SOURCES = [netease, qq, kuwo, kugou, migu, bilibili, audius, apple, youtube];

export const providers = Object.fromEntries(
  [...SEARCH_SOURCES, podcast, radio, local].map((p) => [p.id, p])
);

export const sourceName = (id) => providers[id]?.short || id;
