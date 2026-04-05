// CDE semantic color → CSS variable name mapping
const CDE_SEMANTIC_MAP: Record<string, string> = {
  background: '--window-color',
  selectColor: '--titlebar-color',
  foreground: '--text-color',
  topShadowColor: '--border-light',
  bottomShadowColor: '--border-dark',
  selectBackground: '--dock-color',
  activeForeground: '--titlebar-text-color',
  activeBackground: '--titlebar-color',
  troughColor: '--button-active',
  highlightColor: '--border-light',
  backgroundColor: '--window-color',
}

/** Convert 16-bit-per-channel XPM hex (#RRRRGGGGBBBB) to CSS #RRGGBB */
function normalizeXpmColor(raw: string): string {
  // Already short form (#RGB or #RRGGBB)
  if (raw.startsWith('#') && raw.length <= 7) {
    return raw
  }
  // 16-bit per channel: #RRRRGGGGBBBB (13 chars total)
  if (raw.startsWith('#') && raw.length === 13) {
    const r = raw.slice(1, 3)
    const g = raw.slice(5, 7)
    const b = raw.slice(9, 11)
    return `#${r}${g}${b}`
  }
  // 12-char without leading # or other lengths — best effort
  if (raw.startsWith('#')) {
    const hex = raw.slice(1)
    if (hex.length === 12) {
      const r = hex.slice(0, 2)
      const g = hex.slice(4, 6)
      const b = hex.slice(8, 10)
      return `#${r}${g}${b}`
    }
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
    }
  }
  return raw
}

/** Resolve a CDE color entry to an actual CSS color string.
 *  themeColors is a Record<cssVarName, value> e.g. { '--window-color': '#8b8ba5' }
 *  Handles: 'None' → 'transparent', 's semanticName' → lookup themeColors, 'c #hex' → normalize
 *  Priority: s (semantic/theme) first, then c (literal color fallback) */
function resolveColor(entry: string, themeColors: Record<string, string>): string {
  const trimmed = entry.trim()

  // Check for 'None' anywhere (before any other processing)
  if (/\bNone\b/i.test(trimmed)) {
    return 'transparent'
  }

  // Look for 's <semanticName>' token — symbolic/semantic color (checked FIRST)
  const sMatch = trimmed.match(/\bs\s+(\S+)/)
  if (sMatch) {
    const semanticName = sMatch[1]
    const cssVar = CDE_SEMANTIC_MAP[semanticName]
    if (cssVar && themeColors[cssVar]) {
      return themeColors[cssVar]
    }
    // Fallback: try direct lookup by semantic name
    if (themeColors[semanticName]) {
      return themeColors[semanticName]
    }
    // Semantic token found but no theme mapping — fall through to 'c' token below
  }

  // Look for 'c <color>' token — actual color value (fallback when no semantic match)
  const cMatch = trimmed.match(/\bc\s+(\S+)/)
  if (cMatch) {
    const colorVal = cMatch[1]
    if (/^None$/i.test(colorVal)) return 'transparent'
    return normalizeXpmColor(colorVal)
  }

  // Raw color value (no prefix)
  if (trimmed.startsWith('#')) {
    return normalizeXpmColor(trimmed)
  }

  return trimmed || 'transparent'
}

/** Parse a CSS hex color string to an RGBA tuple for ImageData writes. */
function hexToRgba(hex: string): [number, number, number, number] {
  if (hex === 'transparent') return [0, 0, 0, 0]
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    255,
  ]
}

/** Parse XPM text and render to a canvas, returning a PNG data URL (or null on failure).
 *  themeColors: current theme CSS variable values for semantic color resolution */
export async function parseXpmToDataUrl(
  xpmText: string,
  themeColors: Record<string, string>
): Promise<string | null> {
  try {
    // 1. Strip C-style comments
    const stripped = xpmText.replace(/\/\*.*?\*\//gs, '')

    // 2. Extract all quoted strings
    const strings = Array.from(stripped.matchAll(/"(.*?)"/gs)).map((m) =>
      m[1].replace(/\\n/g, '')
    )

    if (strings.length < 2) return null

    // 3. Parse header string[0]: "width height numColors charsPerPixel"
    const headerParts = strings[0].trim().split(/\s+/)
    if (headerParts.length < 4) return null

    const width = parseInt(headerParts[0], 10)
    const height = parseInt(headerParts[1], 10)
    const numColors = parseInt(headerParts[2], 10)
    const cpp = parseInt(headerParts[3], 10)

    if (isNaN(width) || isNaN(height) || isNaN(numColors) || isNaN(cpp)) return null
    if (width <= 0 || height <= 0 || numColors <= 0 || cpp <= 0) return null

    // 4. Parse color table: strings[1..numColors] — store pre-parsed RGBA for fast ImageData fill
    const colorTable: Map<string, [number, number, number, number]> = new Map()
    for (let i = 1; i <= numColors; i++) {
      if (i >= strings.length) return null
      const entry = strings[i]
      const symbol = entry.slice(0, cpp)
      const colorDef = entry.slice(cpp).trim()
      const cssColor = resolveColor(colorDef, themeColors)
      colorTable.set(symbol, hexToRgba(cssColor))
    }

    // 5. Parse pixel rows: strings after the color table
    const pixelRowsStart = 1 + numColors
    const pixelRows: string[] = []
    for (let i = pixelRowsStart; i < strings.length && pixelRows.length < height; i++) {
      if (strings[i].length >= width * cpp) {
        pixelRows.push(strings[i])
      }
    }

    if (pixelRows.length < height) return null

    // 6. Render to offscreen canvas
    let canvas: OffscreenCanvas | HTMLCanvasElement
    let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null

    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(width, height)
      ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null
    } else if (typeof document !== 'undefined') {
      const el = document.createElement('canvas')
      el.width = width
      el.height = height
      canvas = el
      ctx = el.getContext('2d')
    } else {
      return null
    }

    if (!ctx) return null

    // Batch render via ImageData — much faster than per-pixel fillRect (critical for 168 previews)
    const imageData = ctx.createImageData(width, height)
    const data = imageData.data
    for (let y = 0; y < height; y++) {
      const row = pixelRows[y]
      for (let x = 0; x < width; x++) {
        const symbol = row.slice(x * cpp, x * cpp + cpp)
        const rgba = colorTable.get(symbol)
        if (rgba) {
          const idx = (y * width + x) * 4
          data[idx] = rgba[0]
          data[idx + 1] = rgba[1]
          data[idx + 2] = rgba[2]
          data[idx + 3] = rgba[3]
        }
      }
    }
    ctx.putImageData(imageData, 0, 0)

    // 7. Return PNG data URL
    if (canvas instanceof HTMLCanvasElement) {
      return canvas.toDataURL('image/png')
    } else {
      const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' })
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    }
  } catch {
    return null
  }
}

/** Fetch a .pm file and parse it, returning a PNG data URL (or null on failure).
 *  Retries up to 2 times on failure. */
export async function loadXpmBackdrop(
  path: string,
  themeColors: Record<string, string>
): Promise<string | null> {
  const MAX_RETRIES = 2
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(path)
      if (!response.ok) {
        if (attempt < MAX_RETRIES) continue
        return null
      }
      const text = await response.text()
      const result = await parseXpmToDataUrl(text, themeColors)
      if (result !== null) return result
      if (attempt < MAX_RETRIES) continue
      return null
    } catch {
      if (attempt < MAX_RETRIES) continue
      return null
    }
  }
  return null
}
