import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { spawn } from 'child_process'
import net from 'net'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(400)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => {
      resolve(false)
    })
    socket.connect(port, host)
  })
}

function autoStartBackendPlugin() {
  let backendProc = null

  return {
    name: 'auto-start-backend',
    async configureServer(server) {
      const open = await isPortOpen(8000)
      if (open) {
        console.log('\x1b[32m%s\x1b[0m', '✔ Backend server is already active on http://127.0.0.1:8000')
        return
      }

      console.log('\x1b[35m%s\x1b[0m', '⚡ Port 8000 idle: Auto-starting FastAPI backend server...')
      const venvPy = path.join(rootDir, '.venv', 'Scripts', 'python.exe')
      const pythonBin = fs.existsSync(venvPy) ? venvPy : 'python'

      backendProc = spawn(pythonBin, ['-m', 'uvicorn', 'api:app', '--host', '127.0.0.1', '--port', '8000', '--reload'], {
        cwd: rootDir,
        stdio: 'inherit',
        shell: true
      })

      const cleanup = () => {
        if (backendProc && backendProc.pid) {
          try {
            if (process.platform === 'win32') {
              spawn('taskkill', ['/pid', String(backendProc.pid), '/T', '/F'])
            } else {
              backendProc.kill()
            }
          } catch {}
          backendProc = null
        }
      }

      process.on('exit', cleanup)
      process.on('SIGINT', () => { cleanup(); process.exit(); })
      process.on('SIGTERM', () => { cleanup(); process.exit(); })
      server.httpServer?.on('close', cleanup)
    }
  }
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    autoStartBackendPlugin()
  ],
  server: {
    port: 3000,
    proxy: {
      '/home': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/movies': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/tv-series': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/animation': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/search': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/detail': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true }
    }
  }
})
