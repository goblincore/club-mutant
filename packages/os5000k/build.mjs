import { buildSync } from 'esbuild'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
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

// 3. Inject bridge script tag into index.html (before OS13k scripts)
const indexPath = resolve(dist, 'index.html')
let html = readFileSync(indexPath, 'utf-8')
html = html.replace(
  '<script src=OS13k\\OS13kProgramMenu.js',
  '<script src=os5000k-bridge.js></script>\n<script src=OS13k\\OS13kProgramMenu.js',
)

// Update title
html = html.replace('OS13k - A Tiny JavaScript OS', 'OS5000k')
html = html.replace("settings.t||'OS13k'", "settings.t||'OS5000k'")

writeFileSync(indexPath, html)

console.log('OS5000k built → dist/')
