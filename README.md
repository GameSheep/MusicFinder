# MusicFinder

Multi-platform music search & preview Chrome extension. Search and preview songs across NetEase Cloud Music, QQ Music, Bilibili, YouTube, Xiami, and Migu — all from a single popup.

## Features

- **6 music platforms**: NetEase, QQ Music, Bilibili, YouTube, Xiami, Migu
- **FM Radio**: Mainland China (Qingting FM) + Hong Kong stations
- **Podcasts**: iTunes podcast search & episode playback
- **Toplists**: Billboard, UK Chart, Oricon, iTunes Chart, and more
- **Favorites**: Save songs, drag-to-reorder, import/export (.mf files)
- **Lyrics**: Synced lyrics display in Chrome side panel
- **Bilibili multi-part**: Auto-advance through multi-part videos
- **VIP detection**: Lock icon on paid/restricted songs
- **White noise**: Coffee shop, rain, forest, waves, and more
- **Local files**: Upload and play local audio
- **Time-range clip**: Play a segment of any song
- **Keyboard shortcut**: `Alt+Shift+Z` to play/pause
- **Pure vanilla JS**: Zero dependencies (no jQuery, no Bootstrap)

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the `MusicFinder` folder
5. (Optional) Set a YouTube API key in `js/api/youtube.js` → `YOUTUBE_CONFIG.apiKey`

## Platform Support

| Platform | Search | Play | Lyrics | Notes |
|----------|--------|------|--------|-------|
| NetEase Cloud Music | ✅ | ✅ | ✅ | Uses AES+RSA encryption |
| QQ Music | ✅ | ✅ | ✅ | DNR rules for referer |
| Bilibili | ✅ | ✅ (audio-only) | ❌ | Multi-part auto-advance |
| YouTube | ✅ | ✅ (iframe) | ❌ | Requires API key |
| Xiami | ✅ | ✅ | ✅ | Cookie-based auth |
| Migu | ✅ | ✅ | ❌ | Custom headers |

## Usage

### Search
- Click the MusicFinder icon in your Chrome toolbar
- Type a song name, artist, or album and press Enter
- Use `song##10` syntax to get more results (max 50)
- Switch between platforms using the tabs

### Favorites
- Click ♡ on any song to save it
- Drag to reorder in the Favorites tab
- Import/export your favorites as `.mf` files in Options

### Bilibili Multi-part
- Click a Bilibili search result to play Part 1
- Audio auto-advances to the next part
- Use ◀ ▶ buttons to switch manually

## Configuration

Open `js/api/youtube.js` and set your YouTube Data API v3 key:

```js
const YOUTUBE_CONFIG = { apiKey: 'YOUR_API_KEY_HERE' };
```

Get a key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — enable the YouTube Data API v3.

## Project Structure

```
MusicFinder/
├── manifest.json          # Extension manifest (MV3)
├── popup.html             # Main popup UI
├── popup.css              # Popup stylesheet
├── offscreen.html         # Offscreen audio player page
├── player.js              # Audio playback engine
├── popup.js               # Popup UI controller
├── service-worker.js      # Background: header injection, messaging
├── rules.json             # Declarative Net Request rules
├── options.html/js        # Settings page
├── side-panel.html/js     # Lyrics side panel
├── js/
│   ├── api/               # Platform API modules
│   │   ├── netease.js     # NetEase (AES+RSA crypto)
│   │   ├── qq.js          # QQ Music
│   │   ├── bilibili.js    # Bilibili (DASH audio)
│   │   ├── youtube.js     # YouTube Data API
│   │   ├── xiami.js       # Xiami (MD5 signing)
│   │   ├── migu.js        # Migu Music
│   │   └── itunes.js      # iTunes podcast API
│   ├── lib/               # Third-party libraries
│   │   ├── aes.js         # AES encryption
│   │   ├── bigint.js      # Big integer (RSA)
│   │   ├── md5.js         # MD5 hashing
│   │   └── sortable.js    # Drag-to-reorder
│   ├── podcast.js         # Podcast search & UI
│   ├── radio.js           # FM radio data
│   ├── lyrics-data.js     # Fallback lyrics
│   └── utils.js           # Shared utilities
├── img/                   # Icons and images
└── README.md
```

## Privacy

MusicFinder does not collect, store, or transmit any personal data. All data (favorites, search history, settings) is stored locally in Chrome's extension storage. The only external network requests are to the music platform APIs for searching and streaming.

## License

MIT
