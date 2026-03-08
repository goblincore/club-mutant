import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path'

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    sourcemap: false,
  },

  server: {
    port: 5175,

    proxy: {
      // Reverse proxy that strips X-Frame-Options / CSP so iframe embedding works locally
      '/iframe-proxy': {
        target: 'https://jmail.world',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/iframe-proxy/, ''),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            delete proxyRes.headers['x-frame-options']
            delete proxyRes.headers['content-security-policy']
          })
        },
      },
    },
  },
})
