import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Stamp a fresh build id into the emitted service worker so its bytes change
// on every build. The browser only checks for a SW update by byte-diffing
// sw.js — without this, a new deploy is never detected and users keep the
// old cached code until a manual hard-reload.
function stampServiceWorker() {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    closeBundle() {
      try {
        const swPath = resolve(__dirname, 'dist', 'sw.js')
        const src = readFileSync(swPath, 'utf8')
        writeFileSync(swPath, src.replace(/__BUILD_ID__/g, String(Date.now())))
      } catch (e) {
        // non-fatal
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: "/akshar-connect/",
  // Stamp a real build version so error reports show which build a user is on
  // (was always "dev" because __APP_VERSION__ was never defined) — makes a stale
  // cached build obvious in the exception log.
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  plugins: [
    tailwindcss(),
    react(),
    stampServiceWorker(),
  ],
})
