# MusicFinder

Multi-platform music search & playback Chrome extension. Search, play and favourite songs from nine music platforms, follow Bilibili uploaders, listen to FM radio and podcasts — all from one popup, with playback that keeps going after the popup closes.

## Features

- **9 search platforms**: NetEase Cloud Music, QQ Music, Kuwo, Kugou, Migu, Bilibili, Audius, Apple Music (30s previews), YouTube
- **Bilibili uploader (UP主) search**: switch the Bilibili search to "UP主", open an uploader to browse all of their videos (latest / most played, search within their uploads), play them as a queue
- **Background player**: queue (up to 500 tracks), play next, list / loop / repeat-one / shuffle, auto-skip unplayable tracks, Bilibili multi-part auto-advance, media keys via MediaSession, resumes where you left off
- **Synced lyrics**: in the now-playing sheet and a full-height Chrome side panel; click a line to seek
- **Favourites**: up to 1000 songs (stored locally), drag to reorder, shuffle play, import / export JSON (1.x `.mf` files are migrated)
- **FM Radio**: Qingting FM by province, Hong Kong stations, custom stream URLs
- **Podcasts**: Apple Podcasts directory search, episode lists from RSS
- **Local files**: drag audio files into the popup; stored in IndexedDB
- **Keyboard**: `Space` play/pause, `/` search, `Esc` back, `Ctrl+←/→` prev/next; global `Alt+Shift+Z` / `Alt+Shift+←/→`
- **Pure vanilla JS**: zero dependencies, ES modules, no build step

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` (Chrome 116+)
3. Enable **Developer mode**
4. Click **Load unpacked** and select the `MusicFinder` folder
5. (Optional) Open the extension's **Options** page to set a YouTube API key, theme colour, default platform, etc.

## Platform Support

| Platform | Search | Play | Lyrics | Notes |
|----------|--------|------|--------|-------|
| NetEase Cloud Music | ✅ | ✅ | ✅ | weapi (AES + RSA) for stream URLs |
| QQ Music | ✅ | ✅ | ✅ | VIP-only songs can't be played |
| Kuwo | ✅ | ✅ | ✅ | |
| Kugou | ✅ | ✅ | ✅ | Paid songs are marked VIP and skipped |
| Migu | ✅ | ✅ | ✅ | |
| Bilibili | ✅ videos + uploaders | ✅ audio track | — | Multi-part videos, uploader video lists |
| Audius | ✅ | ✅ | — | |
| Apple Music | ✅ | 30s preview | — | Store region set in Options (default HK) |
| YouTube | ✅ | ✅ (embedded) | — | Requires a YouTube Data API v3 key |

Xiami has shut down and was removed.

## Architecture

```
popup (UI) ──runtime.sendMessage(mf:cmd)──▶ offscreen document (audio engine)
   ▲                                              │
   └───────── port "mf-player": state / time / lyrics / toast ◀┘
side panel ── same client ──▶ offscreen         service worker: shortcuts, offscreen bootstrap
```

- Every platform implements one provider interface: `search(keyword, {page, limit, signal, kind})`, `getStreamUrl(track, {page})`, optional `getLyric(track)`, `pageUrl(track)`.
- The offscreen document owns the queue and the `<audio>` element, and snapshots its state to IndexedDB so playback can resume after Chrome closes it.
- Referer / Origin headers required by the platforms are added by static DNR rules (`rules.json`).

## Project Structure

```
MusicFinder/
├── manifest.json
├── popup.html / css/popup.css      # Popup UI (380×600)
├── offscreen.html                  # Hosts the audio engine
├── side-panel.html / css/side-panel.css
├── options.html / css/options.css
├── service-worker.js               # Shortcuts, offscreen bootstrap, side panel behaviour
├── rules.json                      # DNR Referer rules
├── js/
│   ├── popup/                      # main, app (shared context), dom helpers, music / now-playing / radio / podcast views
│   ├── offscreen/player.js         # Queue, playback, lyrics, MediaSession, snapshots
│   ├── providers/                  # One module per platform + podcast, radio, local
│   ├── shared/                     # util, IndexedDB, favourites/settings, player client
│   ├── side-panel.js
│   ├── options.js
│   └── lib/                        # aes.js, bigint.js, md5.js
└── tools/
    ├── smoke-providers.mjs         # Live API smoke test: node tools/smoke-providers.mjs [keyword] [ids...]
    └── preview.html                # Renders popup/options/side panel with a chrome.* stub (serve repo root over HTTP)
```

## Privacy

MusicFinder does not collect or transmit any personal data. Favourites, history, settings and local files stay in Chrome's extension storage / IndexedDB. The only network requests go to the music platform APIs for searching and streaming.

## License

MIT
