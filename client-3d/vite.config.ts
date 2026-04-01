import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path'
import fs from 'fs'
import type { Plugin } from 'vite'
import pkg from '../package.json'

/**
 * Serves packages/konpyuuta/dist at /konpyuuta/ in dev mode.
 * Also serves public asset directories at their absolute paths
 * (Astro templates reference icons/backdrops with absolute /icons/... paths).
 * Copies everything into the production build output.
 */
function konpyuutaPlugin(): Plugin {
  const konpyuutaDist = path.resolve(__dirname, '../packages/konpyuuta/dist')

  const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm',
    '.pm': 'text/plain', // XPM backdrop files
  }

  const serveFile = (filePath: string, res: any, next: any) => {
    if (!filePath.startsWith(konpyuutaDist)) { next(); return }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.setHeader('Access-Control-Allow-Origin', '*')
      const ext = path.extname(filePath)
      if (mimeTypes[ext]) res.setHeader('Content-Type', mimeTypes[ext])
      fs.createReadStream(filePath).pipe(res)
    } else {
      next()
    }
  }

  return {
    name: 'konpyuuta-serve',

    configureServer(server) {
      // Main app at /konpyuuta/
      server.middlewares.use('/konpyuuta', (req, res, next) => {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
        if (urlPath === '/' || urlPath === '') urlPath = '/index.html'
        serveFile(path.join(konpyuutaDist, urlPath), res, next)
      })

      // Public asset dirs — Astro templates reference these with absolute paths
      // e.g. src="/icons/apps/konsole.png" in Panel.astro
      for (const dir of ['icons', 'images', 'backdrops', 'css', 'palettes', 'sounds']) {
        server.middlewares.use(`/${dir}`, (req, res, next) => {
          const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
          serveFile(path.join(konpyuutaDist, dir, urlPath), res, next)
        })
      }
    },

    closeBundle() {
      // Copy full dist to /konpyuuta/ in production build
      const buildOut = path.resolve(__dirname, 'dist/konpyuuta')
      if (fs.existsSync(konpyuutaDist)) {
        fs.cpSync(konpyuutaDist, buildOut, { recursive: true })
      }
      // Copy public asset dirs to root of production build
      for (const dir of ['icons', 'images', 'backdrops', 'css', 'palettes', 'sounds']) {
        const src = path.join(konpyuutaDist, dir)
        if (fs.existsSync(src)) {
          fs.cpSync(src, path.resolve(__dirname, `dist/${dir}`), { recursive: true })
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait(), konpyuutaPlugin()],

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
