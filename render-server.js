/**
 * render-server.js
 *
 * Production entry point for Render / Heroku / Railway.
 * - Starts the Python FastAPI backend internally on port 8001
 * - Proxies all API routes to Python
 * - Serves the Vite-built React SPA (dist/ or dist/client/) for everything else
 * - Listens on process.env.PORT (provided by the hosting platform)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Python backend ────────────────────────────────────────────────────────────
const PY_PORT = '8001';
let pyBackend = null;
let isShuttingDown = false;

function startPythonBackend() {
  if (isShuttingDown) return;
  console.log(`[Server] Starting Python backend on port ${PY_PORT}…`);

  pyBackend = spawn('uvicorn', ['main:app', '--host', '127.0.0.1', '--port', PY_PORT], {
    cwd: path.join(__dirname, 'python-backend'),
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  pyBackend.stdout.on('data', (d) => process.stdout.write(`[Python] ${d}`));
  pyBackend.stderr.on('data', (d) => process.stderr.write(`[Python] ${d}`));
  pyBackend.on('error', (err) => console.error('[Server] Failed to start Python:', err));
  pyBackend.on('close', (code) => {
    pyBackend = null;
    if (!isShuttingDown) {
      console.warn(`[Server] Python exited (${code}). Restarting in 2 s…`);
      setTimeout(startPythonBackend, 2000);
    }
  });
}

startPythonBackend();

['SIGTERM', 'SIGINT'].forEach((sig) =>
  process.on(sig, () => {
    isShuttingDown = true;
    pyBackend?.kill(sig);
    process.exit(0);
  })
);

// ── Static file serving ───────────────────────────────────────────────────────
// Vite builds to dist/ (plain SPA build)
const distDir = (() => {
  const base = path.join(__dirname, 'dist');
  const client = path.join(base, 'client');
  return fs.existsSync(client) ? client : base;
})();

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
};

function serveFile(filePath, res) {
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

// ── API route prefixes forwarded to Python ────────────────────────────────────
const API_PREFIXES = [
  '/health',
  '/spotify/',
  '/youtube/',
  '/mediafire/',
  '/jamendo/',
  '/podcast/',
  '/remove-video-bg',
  '/video-progress',
  '/video-download',
];

function isApiRoute(pathname) {
  return API_PREFIXES.some(
    (p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p)
  );
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const PUBLIC_PORT = process.env.PORT || '8000';

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  const pathname = url.split('?')[0];

  // Forward API calls to Python
  if (isApiRoute(pathname)) {
    const proxyReq = http.request(
      { host: '127.0.0.1', port: PY_PORT, path: req.url, method: req.method, headers: req.headers },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    req.pipe(proxyReq);
    proxyReq.on('error', (err) => {
      console.error('[Proxy]', err.message);
      if (!res.headersSent) res.writeHead(502);
      res.end('Bad Gateway');
    });
    return;
  }

  // Serve static files from dist/
  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const local = path.join(distDir, safe);
  if (safe && fs.existsSync(local) && fs.statSync(local).isFile()) {
    return serveFile(local, res);
  }

  // SPA fallback — serve index.html for all client-side routes
  const index = path.join(distDir, 'index.html');
  if (fs.existsSync(index)) {
    return serveFile(index, res);
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(Number(PUBLIC_PORT), '0.0.0.0', () => {
  console.log(`[Server] Listening on port ${PUBLIC_PORT}`);
});
