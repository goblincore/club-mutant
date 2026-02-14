/**
 * Background removal via corner-sampled color + threshold.
 * All operations are synchronous canvas pixel manipulation.
 */

interface RGB {
  r: number
  g: number
  b: number
}

/**
 * Sample the average color from the four corners of the image.
 * Uses a small patch (5×5) at each corner for robustness.
 */
function sampleCornerColor(data: Uint8ClampedArray, w: number, h: number): RGB {
  const PATCH = 5
  let rSum = 0
  let gSum = 0
  let bSum = 0
  let count = 0

  const corners = [
    { x0: 0, y0: 0 },
    { x0: w - PATCH, y0: 0 },
    { x0: 0, y0: h - PATCH },
    { x0: w - PATCH, y0: h - PATCH },
  ]

  for (const { x0, y0 } of corners) {
    for (let dy = 0; dy < PATCH; dy++) {
      for (let dx = 0; dx < PATCH; dx++) {
        const idx = ((y0 + dy) * w + (x0 + dx)) * 4

        rSum += data[idx]!
        gSum += data[idx + 1]!
        bSum += data[idx + 2]!
        count++
      }
    }
  }

  return {
    r: Math.round(rSum / count),
    g: Math.round(gSum / count),
    b: Math.round(bSum / count),
  }
}

/**
 * Color distance (Euclidean in RGB space).
 */
function colorDistance(r: number, g: number, b: number, bg: RGB): number {
  const dr = r - bg.r
  const dg = g - bg.g
  const db = b - bg.b

  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * Remove the background from an image.
 *
 * 1. Samples corner pixels to detect the background color.
 * 2. Any pixel within `tolerance` color-distance of the bg → alpha 0.
 * 3. Pixels near the threshold edge get partial alpha for soft edges.
 *
 * Returns a new canvas with the background removed.
 */
export function removeBackground(
  sourceCanvas: HTMLCanvasElement,
  tolerance: number
): HTMLCanvasElement {
  const w = sourceCanvas.width
  const h = sourceCanvas.height

  const outCanvas = document.createElement('canvas')
  outCanvas.width = w
  outCanvas.height = h

  const srcCtx = sourceCanvas.getContext('2d')!
  const outCtx = outCanvas.getContext('2d')!

  const srcData = srcCtx.getImageData(0, 0, w, h)
  const outData = outCtx.createImageData(w, h)

  const bg = sampleCornerColor(srcData.data, w, h)

  // Soft edge band — pixels between (tolerance) and (tolerance + feather) get partial alpha
  const feather = 15

  for (let i = 0; i < srcData.data.length; i += 4) {
    const r = srcData.data[i]!
    const g = srcData.data[i + 1]!
    const b = srcData.data[i + 2]!
    const a = srcData.data[i + 3]!

    const dist = colorDistance(r, g, b, bg)

    outData.data[i] = r
    outData.data[i + 1] = g
    outData.data[i + 2] = b

    if (dist < tolerance) {
      // Fully transparent — within tolerance
      outData.data[i + 3] = 0
    } else if (dist < tolerance + feather) {
      // Partial alpha for soft edge
      const t = (dist - tolerance) / feather
      outData.data[i + 3] = Math.round(a * t)
    } else {
      // Keep original alpha
      outData.data[i + 3] = a
    }
  }

  outCtx.putImageData(outData, 0, 0)

  return outCanvas
}

/**
 * Load an image URL into a canvas for pixel manipulation.
 */
export function imageUrlToCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)

      resolve(canvas)
    }

    img.onerror = reject
    img.src = url
  })
}

/**
 * Convert a canvas to a blob URL for display.
 */
export function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create blob from canvas'))
        return
      }

      resolve(URL.createObjectURL(blob))
    }, 'image/png')
  })
}
