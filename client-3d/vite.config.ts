import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path, { resolve, join, extname } from 'path'
import { existsSync, createReadStream, statSync, cpSync } from 'fs'
import pkg from '../package.json'

// Serve packages/konpyuuta/public/ as static files (icons, backdrops, etc.)
function konpyuutaStaticPlugin(): Plugin {
  const konpyuutaPublic = resolve(__dirname, '../packages/konpyuuta/public')
  const mime: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.xpm': 'text/plain',
    '.pm': 'text/plain',
    '.dp': 'application/octet-stream',
  }

  return {
    name: 'konpyuuta-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url ?? '/').split('?')[0]
        const filePath = join(konpyuutaPublic, decodeURIComponent(urlPath))
        try {
          if (existsSync(filePath) && statSync(filePath).isFile()) {
            res.setHeader('Content-Type', mime[extname(filePath).toLowerCase()] ?? 'application/octet-stream')
            res.setHeader('Cache-Control', 'max-age=3600')
            createReadStream(filePath).pipe(res as never)
            return
          }
        } catch { /* file not found — fall through */ }
        next()
      })
    },
    closeBundle() {
      // Copy konpyuuta public assets into the Vite output dir for production
      const outDir = resolve(__dirname, 'dist')
      if (existsSync(outDir)) {
        cpSync(konpyuutaPublic, outDir, { recursive: true, force: false })
      }
    },
  }
}

export default defineConfig({
  plugins: [konpyuutaStaticPlugin(), react(), wasm(), topLevelAwait()],

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

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
