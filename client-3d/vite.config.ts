import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path'
import fs from 'fs'
import type { Plugin } from 'vite'
import pkg from '../package.json'

/**
 * Serves packages/os5000k/dist at /os5000k/ in dev mode,
 * and copies it into the build output for production.
 */
function os5000kPlugin(): Plugin {
  const os5000kDist = path.resolve(__dirname, '../packages/os5000k/dist')

  return {
    name: 'os5000k-serve',

    configureServer(server) {
      server.middlewares.use('/os5000k', (req, res, next) => {
        // Strip query string and decode URI for file path resolution
        let urlPath = (req.url || '/').split('?')[0]
        urlPath = decodeURIComponent(urlPath)
        // Convert backslashes to forward slashes (OS13k uses backslash paths)
        urlPath = urlPath.replace(/\\/g, '/')
        // Default to index.html for root
        if (urlPath === '/' || urlPath === '') urlPath = '/index.html'

        const filePath = path.join(os5000kDist, urlPath)

        // Security: prevent path traversal
        if (!filePath.startsWith(os5000kDist)) {
          next()
          return
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          res.setHeader('Access-Control-Allow-Origin', '*')
          const ext = path.extname(filePath)
          const mimeTypes: Record<string, string> = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
            '.ico': 'image/x-icon',
            '.txt': 'text/plain; charset=utf-8',
            '.wasm': 'application/wasm',
            '.svg': 'image/svg+xml',
          }
          if (mimeTypes[ext]) res.setHeader('Content-Type', mimeTypes[ext])
          fs.createReadStream(filePath).pipe(res)
        } else {
          next()
        }
      })
    },

    closeBundle() {
      // Copy OS5000k dist into the production build output
      const buildOut = path.resolve(__dirname, 'dist/os5000k')
      if (fs.existsSync(os5000kDist)) {
        fs.cpSync(os5000kDist, buildOut, { recursive: true })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait(), os5000kPlugin()],

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
