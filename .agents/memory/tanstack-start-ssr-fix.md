---
name: TanStack Start SSR → plain Vite SPA fix + Vite proxy for Python backend
description: The project was originally built with TanStack Start SSR. Fixing required switching to plain Vite SPA and adding a Vite dev proxy so the browser can reach the Python backend.
---

# TanStack Start SSR → Plain Vite SPA

The app uses React Router DOM (`BrowserRouter`) for all routing inside `src/App.tsx`. It was wrapped in TanStack Start SSR causing hydration failures and blank screen.

**Fix applied:**
1. Removed `tanstackStart` plugin from `vite.config.ts` — now plain `@vitejs/plugin-react`
2. Created root `index.html` with `<script type="module" src="/src/main.tsx"></script>`
3. Created `src/main.tsx` that renders `<App />` via `createRoot`
4. Deleted `public/index.html` (was conflicting)
5. Bumped service worker cache version to force browser cache clear

# Vite Proxy for Python Backend (Port 8000)

**Why:** Replit only proxies port 5000 to the browser. The Python backend runs on port 8000 (not browser-accessible). Must proxy backend routes through Vite on port 5000.

**How to apply:** In `vite.config.ts` `server.proxy`, proxy API subpaths to `http://127.0.0.1:8000`.

**Critical gotcha:** `/spotify`, `/youtube`, `/mediafire` are ALSO React SPA routes. If you proxy the whole prefix (e.g. `/spotify`), browser navigation to `/spotify` gets forwarded to the backend (404). Solution: proxy only specific subpaths like `/spotify/info`, `/spotify/download`, etc. Routes with no React counterpart (`/health`, `/jamendo`, `/podcast`, `/remove-video-bg`) can use simple prefix matching.

**Why:** `checkLocalPythonBackend()` in `src/lib/download.ts` first tries `window.location.origin/health`. Once `/health` is proxied to the backend and returns `{ok: true}`, the function returns `window.location.origin` as the backend URL, and all subsequent API calls go through Vite's proxy transparently.
