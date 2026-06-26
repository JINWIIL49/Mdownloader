import fs from 'fs';
import path from 'path';

const assetsDir = path.join(process.cwd(), 'dist/server/assets');
if (!fs.existsSync(assetsDir)) {
  console.error('[Update Wrangler] dist/server/assets directory not found!');
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
const manifestFile = files.find(f => f.startsWith('_tanstack-start-manifest_v-') && f.endsWith('.js'));
const headScriptsFile = files.find(f => f.startsWith('start-') && f.endsWith('.js'));
const adaptersFile = files.find(f => f.startsWith('__23tanstack-start-plugin-adapters-') && f.endsWith('.js'));

if (!manifestFile || !headScriptsFile || !adaptersFile) {
  console.error('[Update Wrangler] Failed to find all required assets:', { manifestFile, headScriptsFile, adaptersFile });
  process.exit(1);
}

const wranglerPath = path.join(process.cwd(), 'wrangler.jsonc');
if (!fs.existsSync(wranglerPath)) {
  console.error('[Update Wrangler] wrangler.jsonc not found!');
  process.exit(1);
}

let wranglerContent = fs.readFileSync(wranglerPath, 'utf8');

// Use regex to replace the specific aliases in wrangler.jsonc
wranglerContent = wranglerContent.replace(
  /"tanstack-start-manifest:v":\s*"[^"]*"/,
  `"tanstack-start-manifest:v": "./dist/server/assets/${manifestFile}"`
);
wranglerContent = wranglerContent.replace(
  /"tanstack-start-injected-head-scripts:v":\s*"[^"]*"/,
  `"tanstack-start-injected-head-scripts:v": "./dist/server/assets/${headScriptsFile}"`
);
wranglerContent = wranglerContent.replace(
  /"#tanstack-start-plugin-adapters":\s*"[^"]*"/,
  `"#tanstack-start-plugin-adapters": "./dist/server/assets/${adaptersFile}"`
);

fs.writeFileSync(wranglerPath, wranglerContent, 'utf8');
console.log('[Update Wrangler] Successfully updated wrangler.jsonc aliases:', {
  manifest: manifestFile,
  headScripts: headScriptsFile,
  adapters: adaptersFile
});

// Remove dist/client/index.html so Cloudflare Workers Assets does NOT intercept
// the root "/" route with the bare static shell (which has no <script> tags).
// The SSR Worker must handle "/" and all page routes so it can inject proper
// script/CSS tags. Static assets under /assets/* are still served by CF Assets.
// NOTE: We do NOT delete index.html if running in Docker/Render/Railway since the
// unified Python FastAPI backend requires index.html to serve the frontend.
const clientIndexHtml = path.join(process.cwd(), 'dist/client/index.html');
const isDocker = fs.existsSync('/.dockerenv') || process.env.RENDER || process.env.RAILWAY_STATIC_URL;

if (fs.existsSync(clientIndexHtml)) {
  if (!isDocker) {
    fs.unlinkSync(clientIndexHtml);
    console.log('[Update Wrangler] Removed dist/client/index.html — SSR Worker will handle all page routes.');
  } else {
    console.log('[Update Wrangler] Running in Docker/Render — preserving dist/client/index.html for FastAPI serving.');
  }
}
