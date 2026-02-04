import path from 'path'
import { fileURLToPath } from 'url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],

  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
      strict: false,
    },
  },

  resolve: {
    alias: {
      '@colyseus/httpie': '@colyseus/httpie/xhr',
    },
  },

  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
