import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Stamped into the bundle so a running page can say which build it is. The
// commit is only available when building from a checkout — the Docker image
// copies source without .git — so the timestamp is what always answers the
// question "is the thing I am looking at the thing I just deployed?".
function commit() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return null
  }
}

const BUILD_STAMP = [
  new Date().toISOString().slice(0, 16).replace('T', ' '),
  commit(),
].filter(Boolean).join(' · ')

export default defineConfig({
  define: { __BUILD_STAMP__: JSON.stringify(BUILD_STAMP) },
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
    },
  },
})
