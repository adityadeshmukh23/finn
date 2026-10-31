import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// No service worker: the demo is static replay data, and a cached app shell can outlive the
// hashed assets it points at. public/sw.js is a kill switch for browsers that still have the old one.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
})
