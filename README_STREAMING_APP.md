# 🎬 CineBox — Modern Web Streaming Platform

A responsive, high-performance web streaming application powered by the **MovieBox API** with zero-scraping BFF protocol, high-speed video relay proxy, subtitle converter, and a modern Netflix/Apple TV+ style user interface.

---

## ✨ Features

- **🏠 Cinematic Home Page**:
  - Hero banner carousel with instant "Watch Now", metadata badges, and smooth backdrop vignettes.
  - Multi-category horizontal scroll rows (Trending, Cinema, Hot Releases, and more).
  - "Continue Watching" row with progress tracking.
- **🔍 Real-Time Search & Autocomplete**:
  - Instant suggestion dropdown while typing (shows poster, title, and quick details).
  - Full-text paginated search results grid.
- **📂 Categorized Catalogs**:
  - Dedicated pages for **Movies**, **TV Series**, and **Anime / Animation**.
  - Sort filters (Recommended, Latest, Top Rating) and pagination controls.
- **📑 Rich Detail Modal**:
  - Full synopsis, IMDb ratings, release date, runtime, genres, and cast list.
  - Interactive **Season & Episode picker** for TV Series & Anime.
- **🍿 Custom Theatre Video Player**:
  - **Dynamic Resolution Switcher**: Switch between 1080p, 720p, and 480p streams.
  - **Subtitle / Captions Suite**: Automatically converts SRT to WebVTT with multi-language selector.
  - **Streaming Proxy & CDN Relay**: Eliminates upstream CDN 429 errors and CORS blocks while supporting HTTP 206 byte-range seeking/scrubbing.
  - **Keyboard Shortcuts**:
    - `Space` / `K`: Play / Pause
    - `→` / `←`: Jump forward / backward 10s
    - `↑` / `↓`: Volume Up / Down
    - `F`: Fullscreen toggle
    - `M`: Mute / Unmute
    - `Esc`: Close player
  - **TV Show Next Episode Button**: Instantly jump to the next episode without leaving the player.
- **🔖 My Watchlist & History**:
  - Save titles to your personal library (persisted in `localStorage`).
  - Resume playback from your recent watch history.

---

## 🚀 Quick Start

### 1. Launch All-In-One (Production Build)
The frontend has already been built into `client/dist`. Simply run:

```bash
# In Windows PowerShell:
.\.venv\Scripts\python.exe -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload

# Or double-click:
run_app.bat
```

Open your browser to: **[http://localhost:8000](http://localhost:8000)**

---

### 2. Frontend Development Mode (Hot-Reload)
If you want to edit React components with instant hot module replacement:

```bash
# Terminal 1 (Backend):
.\.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 (Vite Frontend):
cd client
npm run dev
```

Open your browser to: **[http://localhost:3000](http://localhost:3000)** (automatically proxies API calls to port 8000).

---

## 🛠️ Tech Architecture

```
[ Browser / Client ] (React + Vite + Tailwind CSS)
        │
        ▼ (HTTP / Byte-range requests)
[ FastAPI Backend ] (Port 8000)
   ├── /home, /movies, /tv-series, /search, /detail
   ├── /api/proxy/stream  --> Impersonates player headers & relays MP4 chunks (206 Partial Content)
   ├── /api/proxy/subtitle --> Converts SRT subtitles to standard WebVTT
   └── /                   --> Serves compiled React SPA from client/dist
        │
        ▼
[ Upstream MovieBox CDN & BFF ]
   ├── h5-api.aoneroom.com
   └── netfilm.world / hakunaymatata.com
```
