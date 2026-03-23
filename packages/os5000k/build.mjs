import { buildSync } from 'esbuild'
import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = resolve(__dirname, 'dist')

// 1. Copy static files
mkdirSync(dist, { recursive: true })
cpSync(resolve(__dirname, 'static'), dist, { recursive: true })

// 2. Compile bridge SDK to IIFE
buildSync({
  entryPoints: [resolve(__dirname, 'src/bridge-sdk.ts')],
  bundle: true,
  format: 'iife',
  globalName: '__os5000k_bridge__',
  outfile: resolve(dist, 'os5000k-bridge.js'),
  target: 'es2020',
  minify: false,
})

// 3. Inject bridge script tag into each app HTML file
const appsDir = resolve(dist, 'apps')
const appFiles = readdirSync(appsDir).filter(f => f.endsWith('.html'))
for (const file of appFiles) {
  const filePath = resolve(appsDir, file)
  let html = readFileSync(filePath, 'utf-8')
  // Inject bridge script before the first existing script tag or before </head>
  if (html.includes('<script')) {
    html = html.replace('<script', '<script src="../os5000k-bridge.js"></script>\n<script')
  } else if (html.includes('</head>')) {
    html = html.replace('</head>', '<script src="../os5000k-bridge.js"></script>\n</head>')
  }
  writeFileSync(filePath, html)
}

console.log('OS5000k built → dist/')
