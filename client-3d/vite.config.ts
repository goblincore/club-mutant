import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
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
