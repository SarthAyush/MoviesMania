import { spawn } from 'child_process';
import path from 'path';
import net from 'net';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("\x1b[36m%s\x1b[0m", "=============================================");
console.log("\x1b[35m%s\x1b[0m", "   🎬 Starting CineBox Backend & Frontend   ");
console.log("\x1b[36m%s\x1b[0m", "=============================================\n");

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(400);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

let backend = null;
let frontend = null;

function cleanup() {
  console.log("\nShutting down servers...");
  const killProc = (proc) => {
    if (proc && proc.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F']);
        } else {
          proc.kill();
        }
      } catch {}
    }
  };
  killProc(backend);
  killProc(frontend);
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function main() {
  const backendRunning = await isPortOpen(8000);
  if (backendRunning) {
    console.log("\x1b[32m%s\x1b[0m", "✔ Backend is already running on http://127.0.0.1:8000");
  } else {
    console.log("\x1b[34m%s\x1b[0m", "🚀 Launching FastAPI Backend on http://127.0.0.1:8000...");
    const venvPy = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
    const pythonBin = fs.existsSync(venvPy) ? venvPy : 'python';
    backend = spawn(pythonBin, ['-m', 'uvicorn', 'api:app', '--host', '127.0.0.1', '--port', '8000', '--reload'], {
      stdio: 'inherit',
      shell: true,
      cwd: __dirname
    });
  }

  console.log("\x1b[34m%s\x1b[0m", "🚀 Launching Vite React Client on http://localhost:3000...\n");
  frontend = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true,
    cwd: path.join(__dirname, 'client')
  });
}

main().catch(console.error);
