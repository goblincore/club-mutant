import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    proxy: {
      // Proxy /dream/ API requests to the standalone dream-npc service to avoid CORS in dev.
      // In production the dream client is served from the same origin so no proxy needed.
      '/dream': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
