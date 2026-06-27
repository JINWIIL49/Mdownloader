import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";

const BACKEND = "http://127.0.0.1:8000";
const be = { target: BACKEND, changeOrigin: true };

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    react(),
  ],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  server: {
    allowedHosts: true,
    port: 5000,
    host: "0.0.0.0",
    proxy: {
      // No React route conflicts — use prefix matching
      "/health": be,
      "/jamendo": be,
      "/podcast": be,
      "/remove-video-bg": be,
      "/video-progress": be,
      "/video-download": be,

      // /spotify, /youtube, /mediafire are also React routes — proxy subpaths only
      "/spotify/info": be,
      "/spotify/collection-info": be,
      "/spotify/download": be,
      "/spotify/progress": be,
      "/spotify/cancel": be,

      "/youtube/info": be,
      "/youtube/download": be,
      "/youtube/progress": be,
      "/youtube/cancel": be,
      "/youtube/test_bypass": be,

      "/mediafire/info": be,
      "/mediafire/download": be,
    },
  },
});
