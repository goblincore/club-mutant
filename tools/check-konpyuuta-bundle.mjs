// Verify the production import graph, rather than assuming React.lazy split it.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const dist = resolve(process.argv[2] || 'client-3d/dist')
const manifest = JSON.parse(await readFile(resolve(dist, '.vite/manifest.json'), 'utf8'))
const desktopKey = 'src/ui/konpyuuta/KonpyuuTAShell.tsx'
assert(manifest['index.html'], 'Main HTML entry is missing')
assert(manifest[desktopKey]?.isDynamicEntry, 'Desktop must be a dynamic entry')
function graph(key, visited = new Set()) {
  if (visited.has(key)) return visited
  assert(manifest[key], `Missing manifest entry: ${key}`)
  visited.add(key)
  for (const dependency of manifest[key].imports || []) graph(dependency, visited)
  return visited
}
const initial = graph('index.html')
assert(!initial.has(desktopKey), 'Desktop is reachable through an eager import')
const css = (keys) => new Set([...keys].flatMap((key) => manifest[key].css || []))
const initialCss = css(initial)
const desktopCss = css(graph(desktopKey))
assert(desktopCss.size, 'Desktop styles are missing')
for (const file of initialCss) {
  const source = await readFile(resolve(dist, file), 'utf8')
  assert(!source.includes('.cde-root'), `OS styles leaked into initial CSS: ${file}`)
}
assert([...desktopCss].some((file) => !initialCss.has(file)), 'Desktop needs its own deferred stylesheet')
const osAsset = /(?:mutanttube|mutantbook|mutantmail|messenger|netscape|filemanager|settings|liquid-signal|sword)-.*\.(?:png|webp|apng)$/
for (const key of initial) for (const asset of manifest[key].assets || []) {
  assert(!osAsset.test(asset), `OS visual asset leaked into initial graph: ${asset}`)
}
async function sizes(files) {
  let bytes = 0, gzip = 0
  for (const file of files) {
    const data = await readFile(resolve(dist, file))
    bytes += data.length; gzip += gzipSync(data).length
  }
  return { bytes, gzip }
}
const deferred = [...graph(desktopKey)].filter((key) => !initial.has(key))
console.log(JSON.stringify({
  result: 'Desktop JS, CSS, and visual assets are excluded from the initial static import graph',
  initialJS: await sizes([...initial].map((key) => manifest[key].file)),
  initialCSS: await sizes(initialCss),
  deferredDesktopJS: await sizes(deferred.map((key) => manifest[key].file)),
  deferredDesktopCSS: await sizes([...desktopCss].filter((file) => !initialCss.has(file))),
}, null, 2))
