/**
 * Generate placeholder dream mode tilesets as PNG files.
 * Uses raw PNG encoding (no dependencies).
 *
 * Usage: node scripts/generate-dream-tilesets.mjs
 * Output: client-3d/public/textures/dream/tiles/
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { deflateSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'client-3d', 'public', 'textures', 'dream', 'tiles')

mkdirSync(OUT_DIR, { recursive: true })

const TILE_SIZE = 16

// ── Minimal PNG encoder (no dependencies) ──

function encodePNG(width, height, pixels) {
  // pixels: Uint8Array of RGBA values (width * height * 4)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR chunk
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // IDAT: filter each row with filter type 0 (None)
  const rawData = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0 // filter byte
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4
      const dstIdx = y * (1 + width * 4) + 1 + x * 4
      rawData[dstIdx] = pixels[srcIdx]
      rawData[dstIdx + 1] = pixels[srcIdx + 1]
      rawData[dstIdx + 2] = pixels[srcIdx + 2]
      rawData[dstIdx + 3] = pixels[srcIdx + 3]
    }
  }
  const compressed = deflateSync(rawData)

  function makeChunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii')
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const crcData = Buffer.concat([typeBytes, data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(crcData), 0)
    return Buffer.concat([len, typeBytes, data, crc])
  }

  const iend = Buffer.alloc(0)

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', iend),
  ])
}

// CRC32 table
const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[n] = c
}

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// ── Pixel drawing helpers ──

function createPixels(cols, rows) {
  const w = cols * TILE_SIZE
  const h = rows * TILE_SIZE
  const pixels = new Uint8Array(w * h * 4)
  return { pixels, w, h }
}

function parseColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b, 255]
}

function setPixel(pixels, w, x, y, r, g, b, a = 255) {
  const idx = (y * w + x) * 4
  pixels[idx] = r
  pixels[idx + 1] = g
  pixels[idx + 2] = b
  pixels[idx + 3] = a
}

function fillRect(pixels, w, rx, ry, rw, rh, color) {
  const [r, g, b, a] = parseColor(color)
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      setPixel(pixels, w, x, y, r, g, b, a)
    }
  }
}

function fillTile(pixels, w, tileCol, tileRow, color) {
  const x = tileCol * TILE_SIZE
  const y = tileRow * TILE_SIZE
  fillRect(pixels, w, x, y, TILE_SIZE, TILE_SIZE, color)
}

function dotPattern(pixels, w, tileCol, tileRow, bgColor, dotColor, spacing) {
  fillTile(pixels, w, tileCol, tileRow, bgColor)
  const [r, g, b] = parseColor(dotColor)
  const ox = tileCol * TILE_SIZE
  const oy = tileRow * TILE_SIZE
  for (let y = spacing; y < TILE_SIZE; y += spacing) {
    for (let x = spacing; x < TILE_SIZE; x += spacing) {
      setPixel(pixels, w, ox + x, oy + y, r, g, b)
    }
  }
}

function checkerPattern(pixels, w, tileCol, tileRow, c1, c2, gridSize) {
  const ox = tileCol * TILE_SIZE
  const oy = tileRow * TILE_SIZE
  const [r1, g1, b1] = parseColor(c1)
  const [r2, g2, b2] = parseColor(c2)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const isEven = (Math.floor(x / gridSize) + Math.floor(y / gridSize)) % 2 === 0
      if (isEven) setPixel(pixels, w, ox + x, oy + y, r1, g1, b1)
      else setPixel(pixels, w, ox + x, oy + y, r2, g2, b2)
    }
  }
}

function borderTile(pixels, w, tileCol, tileRow, bgColor, borderColor, bw = 1) {
  fillTile(pixels, w, tileCol, tileRow, bgColor)
  const ox = tileCol * TILE_SIZE
  const oy = tileRow * TILE_SIZE
  const [r, g, b] = parseColor(borderColor)
  for (let i = 0; i < TILE_SIZE; i++) {
    for (let j = 0; j < bw; j++) {
      setPixel(pixels, w, ox + i, oy + j, r, g, b) // top
      setPixel(pixels, w, ox + i, oy + TILE_SIZE - 1 - j, r, g, b) // bottom
      setPixel(pixels, w, ox + j, oy + i, r, g, b) // left
      setPixel(pixels, w, ox + TILE_SIZE - 1 - j, oy + i, r, g, b) // right
    }
  }
}

function staticNoise(pixels, w, tileCol, tileRow, rMul, gMul, bMul) {
  const ox = tileCol * TILE_SIZE
  const oy = tileRow * TILE_SIZE
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const v = Math.random() * 0.4
      setPixel(pixels, w, ox + x, oy + y,
        Math.floor(v * rMul),
        Math.floor(v * gMul),
        Math.floor(v * bMul))
    }
  }
}

// ── Generate Nexus tileset ──
{
  const COLS = 4
  const numTiles = 10
  const ROWS = Math.ceil(numTiles / COLS)
  const { pixels, w, h } = createPixels(COLS, ROWS)

  // 0: void
  fillTile(pixels, w, 0, 0, '#08080e')
  // 1: outer wall
  borderTile(pixels, w, 1, 0, '#1a1a2e', '#222244')
  // 2: outer floor
  dotPattern(pixels, w, 2, 0, '#16162a', '#1e1e3a', 4)
  // 3: mid floor
  checkerPattern(pixels, w, 3, 0, '#221a33', '#251d38', 4)
  // 4: inner floor
  checkerPattern(pixels, w, 0, 1, '#2a1f44', '#2e2348', 2)
  // 5: center floor
  checkerPattern(pixels, w, 1, 1, '#332255', '#3a2860', 2)
  // 6: center pedestal
  borderTile(pixels, w, 2, 1, '#4a3388', '#6644aa', 2)

  // 7: bed (wake-up point)
  fillTile(pixels, w, 3, 1, '#332255')
  const ox7 = 3 * TILE_SIZE, oy7 = 1 * TILE_SIZE
  fillRect(pixels, w, ox7 + 3, oy7 + 4, 10, 8, '#8b6914')
  fillRect(pixels, w, ox7 + 4, oy7 + 5, 8, 3, '#c4a030')

  // 8: door (green — exit to forest)
  fillTile(pixels, w, 0, 2, '#1a1a2e')
  const ox8 = 0 * TILE_SIZE, oy8 = 2 * TILE_SIZE
  fillRect(pixels, w, ox8 + 4, oy8 + 2, 8, 12, '#226633')
  fillRect(pixels, w, ox8 + 5, oy8 + 3, 6, 10, '#33aa55')
  fillRect(pixels, w, ox8 + 9, oy8 + 8, 2, 2, '#88ff88')

  // 9: locked door (grey)
  fillTile(pixels, w, 1, 2, '#1a1a2e')
  const ox9 = 1 * TILE_SIZE, oy9 = 2 * TILE_SIZE
  fillRect(pixels, w, ox9 + 4, oy9 + 2, 8, 12, '#333344')
  fillRect(pixels, w, ox9 + 5, oy9 + 3, 6, 10, '#444455')
  fillRect(pixels, w, ox9 + 7, oy9 + 7, 2, 3, '#555566')

  const png = encodePNG(w, h, pixels)
  writeFileSync(join(OUT_DIR, 'nexus.png'), png)
  console.log(`Generated nexus.png (${w}x${h}, ${numTiles} tiles)`)
}

// ── Generate Forest tileset ──
{
  const COLS = 4
  const numTiles = 12
  const ROWS = Math.ceil(numTiles / COLS)
  const { pixels, w, h } = createPixels(COLS, ROWS)

  // 0: grass
  dotPattern(pixels, w, 0, 0, '#0a1a0a', '#0f220f', 3)
  // 1: dark grass
  fillTile(pixels, w, 1, 0, '#081408')
  // 2: tree trunk
  fillTile(pixels, w, 2, 0, '#0a1a0a')
  fillRect(pixels, w, 2 * TILE_SIZE + 6, 0, 4, TILE_SIZE, '#3a2a1a')
  // 3: tree canopy
  fillTile(pixels, w, 3, 0, '#1a3a1a')
  fillRect(pixels, w, 3 * TILE_SIZE + 1, 1, 14, 14, '#224422')
  fillRect(pixels, w, 3 * TILE_SIZE + 3, 3, 10, 10, '#2a5a2a')

  // 4: path
  dotPattern(pixels, w, 0, 1, '#2a1f14', '#33261a', 4)
  // 5: water
  checkerPattern(pixels, w, 1, 1, '#0a1a2a', '#0e1e2e', 2)
  // 6: bridge
  fillTile(pixels, w, 2, 1, '#4a3a22')
  for (let i = 0; i < TILE_SIZE; i += 4) {
    fillRect(pixels, w, 2 * TILE_SIZE, 1 * TILE_SIZE + i, TILE_SIZE, 1, '#3a2a18')
  }
  // 7: flower
  dotPattern(pixels, w, 3, 1, '#0a1a0a', '#0f220f', 3)
  fillRect(pixels, w, 3 * TILE_SIZE + 6, 1 * TILE_SIZE + 4, 4, 4, '#ff44aa')
  fillRect(pixels, w, 3 * TILE_SIZE + 7, 1 * TILE_SIZE + 8, 2, 4, '#44ff88')

  // 8: rock
  fillTile(pixels, w, 0, 2, '#0a1a0a')
  fillRect(pixels, w, 0 * TILE_SIZE + 3, 2 * TILE_SIZE + 5, 10, 8, '#333333')
  fillRect(pixels, w, 0 * TILE_SIZE + 4, 2 * TILE_SIZE + 6, 8, 6, '#444444')

  // 9: mushroom
  dotPattern(pixels, w, 1, 2, '#0a1a0a', '#0f220f', 3)
  fillRect(pixels, w, 1 * TILE_SIZE + 5, 2 * TILE_SIZE + 4, 6, 4, '#cc4444')
  fillRect(pixels, w, 1 * TILE_SIZE + 7, 2 * TILE_SIZE + 8, 2, 4, '#eeddcc')

  // 10: static patch
  staticNoise(pixels, w, 2, 2, 80, 255, 80)

  // 11: door (exit to nexus)
  fillTile(pixels, w, 3, 2, '#0a1a0a')
  fillRect(pixels, w, 3 * TILE_SIZE + 4, 2 * TILE_SIZE + 2, 8, 12, '#332255')
  fillRect(pixels, w, 3 * TILE_SIZE + 5, 2 * TILE_SIZE + 3, 6, 10, '#4a3388')
  fillRect(pixels, w, 3 * TILE_SIZE + 9, 2 * TILE_SIZE + 8, 2, 2, '#6644aa')

  const png = encodePNG(w, h, pixels)
  writeFileSync(join(OUT_DIR, 'forest.png'), png)
  console.log(`Generated forest.png (${w}x${h}, ${numTiles} tiles)`)
}

console.log('\nDone! Tilesets generated in:', OUT_DIR)
