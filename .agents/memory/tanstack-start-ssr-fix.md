---
name: TanStack Start SSR → plain Vite SPA fix
description: The project was originally built with TanStack Start SSR wrapping a React Router DOM app, causing hydration failures and a blank screen in Replit.
---

# TanStack Start SSR → Plain Vite SPA

The app uses React Router DOM (`BrowserRouter`) for all routing inside `src/App.tsx`. It was wrapped in TanStack Start SSR via `vite.config.ts` which caused:
- "Invalid hook call" errors
- "Hydration failed" errors
- Blank preview screen

**Why:** TanStack Start SSR renders on the server, but `BrowserRouter` needs browser APIs unavailable server-side. The `ClientOnly` wrappers were not sufficient to prevent the crash.

**Fix applied:**
1. Removed `tanstackStart` plugin from `vite.config.ts` — now plain `@vitejs/plugin-react`
2. Created root `index.html` with `<script type="module" src="/src/main.tsx"></script>`
3. Created `src/main.tsx` that renders `<App />` via `createRoot`
4. Deleted `public/index.html` (was conflicting with the new root `index.html`)
5. Bumped service worker cache version (`ssv-cache-v2` → `ssv-cache-v3`) to force browser cache clear

**How to apply:** If this app ever gets a blank screen after a rebuild or dependency update, check whether TanStack Start was re-introduced in vite.config.ts. Keep it as a plain Vite SPA — no SSR needed.
