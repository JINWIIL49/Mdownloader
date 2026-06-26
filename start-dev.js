import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import net from 'net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';

// 1. Resolve Python / Uvicorn path
let uvicornPath = 'uvicorn';
const venvPath = path.join(__dirname, '.venv');

if (fs.existsSync(venvPath)) {
  const winUvicorn = path.join(venvPath, 'Scripts', 'uvicorn.exe');
  const unixUvicorn = path.join(venvPath, 'bin', 'uvicorn');
  
  if (isWin && fs.existsSync(winUvicorn)) {
    uvicornPath = winUvicorn;
  } else if (!isWin && fs.existsSync(unixUvicorn)) {
    uvicornPath = unixUvicorn;
  }
}

console.log(`[System] Using uvicorn: ${uvicornPath}`);

function isPortAvailable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

// Helper to log prefixed lines
function setupLogger(childProcess, prefix) {
  childProcess.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line) => {
      if (line) console.log(`${prefix} ${line}`);
    });
  });

  childProcess.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line) => {
      if (line) console.error(`${prefix} ${line}`);
    });
  });
}

// 2. Start Python FastAPI Backend
const backendCwd = path.join(__dirname, 'python-backend');
console.log('[System] Starting Python Backend...');

let port = 8000;
while (!(await isPortAvailable(port, '127.0.0.1'))) {
  console.log(`[System] Port ${port} is occupied, trying next port...`);
  port++;
  if (port > 8010) {
    console.error('[System] No available ports between 8000 and 8010.');
    process.exit(1);
  }
}

console.log(`[System] Using port ${port} for Python backend.`);
process.env.VITE_PY_BACKEND_URL = `http://localhost:${port}`;

// Dynamically write VITE_PY_BACKEND_URL to the .env file so Vinxi/Vite reads the correct active port
try {
  const envPathFile = path.join(__dirname, '.env');
  if (fs.existsSync(envPathFile)) {
    let envContent = fs.readFileSync(envPathFile, 'utf8');
    if (envContent.includes('VITE_PY_BACKEND_URL=')) {
      envContent = envContent.replace(/VITE_PY_BACKEND_URL=.*/, `VITE_PY_BACKEND_URL=http://localhost:${port}`);
    } else {
      envContent += `\nVITE_PY_BACKEND_URL=http://localhost:${port}\n`;
    }
    fs.writeFileSync(envPathFile, envContent, 'utf8');
    console.log(`[System] Updated .env file with VITE_PY_BACKEND_URL=http://localhost:${port}`);
  }
} catch (envErr) {
  console.error('[System] Failed to update .env file:', envErr.message);
}

let spawnCmd = uvicornPath;
let spawnArgs = ['main:app', '--host', '127.0.0.1', '--port', port.toString()];

if (uvicornPath === 'uvicorn') {
  spawnCmd = 'python';
  spawnArgs = ['-m', 'uvicorn', ...spawnArgs];
}

const backend = spawn(spawnCmd, spawnArgs, {
  cwd: backendCwd,
  shell: false,
  env: {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1'
  }
});

setupLogger(backend, '\x1b[36m[Backend]\x1b[0m'); // Cyan prefix

// 3. Start Vite Frontend
console.log('[System] Starting Vite Frontend...');
const viteBin = path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js');
const frontend = spawn(process.execPath, [viteBin, 'dev', '--port', '5000', '--host', '0.0.0.0'], {
  cwd: __dirname,
  shell: false,
  env: {
    ...process.env,
    VITE_PY_BACKEND_URL: `http://localhost:${port}`
  }
});

setupLogger(frontend, '\x1b[32m[Frontend]\x1b[0m'); // Green prefix

// 4. Handle Cleanup on Exit
let cleanUpDone = false;
function cleanUp() {
  if (cleanUpDone) return;
  cleanUpDone = true;
  console.log('\n[System] Shutting down servers...');
  
  try {
    if (isWin) {
      if (backend.pid) spawn('taskkill', ['/pid', backend.pid, '/f', '/t']);
      if (frontend.pid) spawn('taskkill', ['/pid', frontend.pid, '/f', '/t']);
    } else {
      backend.kill('SIGTERM');
      frontend.kill('SIGTERM');
    }
  } catch (e) {
    // Ignore cleanup errors
  }
  
  process.exit();
}

process.on('SIGINT', cleanUp);
process.on('SIGTERM', cleanUp);
process.on('exit', cleanUp);

backend.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.log(`[System] Backend exited with code ${code}`);
  }
  cleanUp();
});

frontend.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.log(`[System] Frontend exited with code ${code}`);
  }
  cleanUp();
});
