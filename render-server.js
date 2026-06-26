import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Start the Python FastAPI backend on port 8001
const pyPort = '8001';
let pyBackend = null;
let isShuttingDown = false;

function startPythonBackend() {
  if (isShuttingDown) return;
  console.log(`[Proxy] Starting Python Backend on port ${pyPort}...`);
  const spawnCmd = process.platform === 'win32' ? 'cmd.exe' : 'uvicorn';
  const spawnArgs = process.platform === 'win32'
    ? ['/c', 'python -m uvicorn main:app --host 127.0.0.1 --port ' + pyPort]
    : ['main:app', '--host', '127.0.0.1', '--port', pyPort];

  pyBackend = spawn(spawnCmd, spawnArgs, {
    cwd: path.join(__dirname, 'python-backend'),
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1'
    }
  });

  pyBackend.stdout.on('data', (data) => {
    console.log(`[Python] ${data.toString().trim()}`);
  });

  pyBackend.stderr.on('data', (data) => {
    console.error(`[Python-Err] ${data.toString().trim()}`);
  });

  pyBackend.on('error', (err) => {
    console.error(`[Proxy] Failed to start Python backend:`, err);
  });

  pyBackend.on('close', (code) => {
    pyBackend = null;
    if (!isShuttingDown) {
      console.warn(`[Proxy] Python backend process exited with code ${code}. Restarting in 2 seconds...`);
      setTimeout(startPythonBackend, 2000);
    } else {
      console.log(`[Proxy] Python backend process exited with code ${code} (graceful shutdown).`);
    }
  });
}

startPythonBackend();

// Graceful shutdown: clean up child process when node exits
process.on('SIGTERM', () => {
  isShuttingDown = true;
  if (pyBackend) {
    console.log('[Proxy] Node server shutting down. Terminating Python backend...');
    pyBackend.kill('SIGTERM');
  }
});

process.on('SIGINT', () => {
  isShuttingDown = true;
  if (pyBackend) {
    console.log('[Proxy] Node server interrupted. Terminating Python backend...');
    pyBackend.kill('SIGINT');
  }
});

// Import the SSR request handler from api/server.js
import handler from './api/server.js';

const publicPort = process.env.PORT || '8000';
const distClientDir = path.join(__dirname, 'dist/client');

// 2. Start the unified HTTP server
const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const pathname = url.split('?')[0];

  // Route API and healthcheck requests directly to the Python backend
  if (
    pathname.startsWith('/health') ||
    pathname.startsWith('/youtube') ||
    pathname.startsWith('/remove-video-bg') ||
    pathname.startsWith('/video-progress') ||
    pathname.startsWith('/video-download') ||
    pathname.startsWith('/mediafire') ||
    pathname.startsWith('/spotify')
  ) {
    // Simple streaming proxy to Python backend on port 8001
    const proxyReq = http.request(
      {
        host: '127.0.0.1',
        port: pyPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    req.pipe(proxyReq);
    proxyReq.on('error', (err) => {
      console.error('[Proxy Error]', err);
      res.writeHead(502);
      res.end('Bad Gateway');
    });
    return;
  }

  // Serve static assets from dist/client
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const localFilePath = path.join(distClientDir, safePath);

  if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile()) {
    // Determine content type
    let contentType = 'application/octet-stream';
    if (localFilePath.endsWith('.html')) contentType = 'text/html';
    else if (localFilePath.endsWith('.css')) contentType = 'text/css';
    else if (localFilePath.endsWith('.js')) contentType = 'application/javascript';
    else if (localFilePath.endsWith('.png')) contentType = 'image/png';
    else if (localFilePath.endsWith('.jpg') || localFilePath.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (localFilePath.endsWith('.svg')) contentType = 'image/svg+xml';
    else if (localFilePath.endsWith('.ico')) contentType = 'image/x-icon';
    else if (localFilePath.endsWith('.json')) contentType = 'application/json';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(localFilePath).pipe(res);
    return;
  }

  // Fallback to the TanStack Start SSR request handler
  try {
    await handler(req, res);
  } catch (err) {
    console.error('[SSR Handler Error]', err);
    res.writeHead(500);
    res.end('SSR Server Error');
  }
});

server.listen(publicPort, '0.0.0.0', () => {
  console.log(`[Proxy] Server listening on port ${publicPort}`);
});
