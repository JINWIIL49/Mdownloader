# MDounloader — Downloading Studio

A social media video/image/audio downloader supporting TikTok, Instagram, Facebook, YouTube, X (Twitter), LinkedIn, Spotify, MediaFire, and more. Also includes a Background Remover tool and TinyURL shortener.

## Architecture

- **Frontend**: React + Vite + TanStack Query + Tailwind CSS (port 5000)
- **Backend**: Python FastAPI + yt-dlp + uvicorn (port 8000)
- **Routing**: react-router-dom

## Running the app

Start both servers together:
```
node start-dev.js
```
This launches:
- Python FastAPI backend on port 8000 (auto-detects next available port if occupied)
- Vite frontend on port 5000

## Key dependencies

- `yt-dlp` — video/audio downloading from social platforms
- `imageio-ffmpeg` — ffmpeg bundled for media conversion
- `opencv-python-headless`, `numpy`, `Pillow` — image processing
- `rembg` — background removal (lazily loaded; requires Python <3.10 for CPU version)
- `@tanstack/react-query`, `react-router-dom`, `lucide-react`, `tailwindcss`

## Notes

- `rembg` is not installed (requires Python <3.10); background removal will gracefully degrade
- `VITE_PY_BACKEND_URL` is set at runtime by `start-dev.js` to the active backend port
- Supabase integration is optional (set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for auth)

## User preferences
