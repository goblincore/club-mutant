/**
 * Slice a processed (bg-removed) canvas into CharacterPart entries
 * based on polygon bone regions.
 */

import type { BoneRegion, BoneRole, CharacterPart } from '../types'

/**
 * Compute the axis-aligned bounding box of a polygon.
 */
function polygonBounds(points: [number, number][]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/**
 * Compute the centroid of a polygon.
 */
function polygonCentroid(points: [number, number][]): [number, number] {
  let cx = 0
  let cy = 0

  for (const [x, y] of points) {
    cx += x
    cy += y
  }

  return [cx / points.length, cy / points.length]
}

/**
 * Extract pixels from srcCanvas clipped to a polygon, then trim transparent padding.
 * Returns a tight canvas + the offset in source image space.
 */
function extractPolygonRegion(
  srcCanvas: HTMLCanvasElement,
  points: [number, number][]
): { canvas: HTMLCanvasElement; offsetX: number; offsetY: number } | null {
  if (points.length < 3) return null

  const bounds = polygonBounds(points)

  const bx = Math.floor(bounds.minX)
  const by = Math.floor(bounds.minY)
  const bw = Math.ceil(bounds.width) + 1
  const bh = Math.ceil(bounds.height) + 1

  // Draw source clipped to polygon into a temp canvas
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = bw
  tempCanvas.height = bh

  const ctx = tempCanvas.getContext('2d')!

  // Build clip path (offset to bounding box origin)
  ctx.beginPath()
  ctx.moveTo(points[0]![0] - bx, points[0]![1] - by)

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]![0] - bx, points[i]![1] - by)
  }

  ctx.closePath()
  ctx.clip()

  // Draw the source image region
  ctx.drawImage(srcCanvas, bx, by, bw, bh, 0, 0, bw, bh)

  // Trim transparent pixels
  const data = ctx.getImageData(0, 0, bw, bh).data

  let tMinX = bw
  let tMinY = bh
  let tMaxX = -1
  let tMaxY = -1

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (data[(y * bw + x) * 4 + 3]! > 0) {
        if (x < tMinX) tMinX = x
        if (x > tMaxX) tMaxX = x
        if (y < tMinY) tMinY = y
        if (y > tMaxY) tMaxY = y
      }
    }
  }

  if (tMaxX < 0) return null

  const trimW = tMaxX - tMinX + 1
  const trimH = tMaxY - tMinY + 1

  const outCanvas = document.createElement('canvas')
  outCanvas.width = trimW
  outCanvas.height = trimH

  const outCtx = outCanvas.getContext('2d')!
  outCtx.drawImage(tempCanvas, tMinX, tMinY, trimW, trimH, 0, 0, trimW, trimH)

  return {
    canvas: outCanvas,
    offsetX: bx + tMinX,
    offsetY: by + tMinY,
  }
}

/**
 * Default pivot positions per bone role.
 * Normalized (0–1) relative to the trimmed part.
 * Coordinate system matches Three.js: X: 0=left, 1=right. Y: 0=bottom, 1=top.
 */
const DEFAULT_PIVOTS: Record<BoneRole, [number, number]> = {
  head: [0.5, 0.0],
  torso: [0.5, 0.8],
  arm_l: [0.85, 0.92],
  arm_r: [0.15, 0.92],
  leg_l: [0.7, 0.92],
  leg_r: [0.3, 0.92],
}

/**
 * Default z-index per bone role.
 */
const DEFAULT_Z: Record<BoneRole, number> = {
  torso: 0,
  head: 2,
  arm_l: -1,
  arm_r: -1,
  leg_l: -2,
  leg_r: -2,
}

interface SliceResult {
  part: CharacterPart
  blob: Blob
}

/**
 * Slice the processed image into parts based on polygon bone regions.
 * Returns CharacterPart entries with object URLs + blobs for export.
 */
export async function sliceImageIntoParts(
  processedCanvas: HTMLCanvasElement,
  regions: BoneRegion[],
  imageWidth: number,
  imageHeight: number
): Promise<SliceResult[]> {
  const enabledRegions = regions.filter((r) => r.enabled && r.points.length >= 3)
  const results: SliceResult[] = []

  // Image center for computing offsets
  const centerX = imageWidth / 2
  const centerY = imageHeight / 2

  // Find torso region centroid for parenting offsets
  const torsoRegion = enabledRegions.find((r) => r.boneRole === 'torso')
  const torsoCentroid = torsoRegion ? polygonCentroid(torsoRegion.points) : null

  const torsoCenterX = torsoCentroid ? torsoCentroid[0] : centerX
  const torsoCenterY = torsoCentroid ? torsoCentroid[1] : centerY

  for (const region of enabledRegions) {
    const extracted = extractPolygonRegion(processedCanvas, region.points)

    if (!extracted) continue

    const blob = await new Promise<Blob>((resolve, reject) => {
      extracted.canvas.toBlob((b) => {
        if (!b) {
          reject(new Error(`Failed to create blob for ${region.boneRole}`))
          return
        }

        resolve(b)
      }, 'image/png')
    })

    const textureUrl = URL.createObjectURL(blob)
    const pivot = DEFAULT_PIVOTS[region.boneRole] ?? ([0.5, 0.5] as [number, number])
    const zIndex = DEFAULT_Z[region.boneRole] ?? 0

    // Pivot point in image-space (pixel coords)
    // pivot Y is in 3D coords (0=bottom, 1=top), flip for image space (0=top, 1=bottom)
    const pivotImageX = extracted.offsetX + pivot[0] * extracted.canvas.width
    const pivotImageY = extracted.offsetY + (1 - pivot[1]) * extracted.canvas.height

    // Offset: relative to parent pivot (torso for limbs/head, image center for torso)
    let offsetX: number
    let offsetY: number

    if (region.boneRole === 'torso') {
      offsetX = pivotImageX - centerX
      offsetY = pivotImageY - centerY
    } else {
      // Limb/head offset from torso centroid
      const torsoPivot = DEFAULT_PIVOTS.torso
      const torsoBounds = torsoRegion ? polygonBounds(torsoRegion.points) : null

      const torsoPivotX = torsoBounds
        ? torsoBounds.minX + torsoPivot[0] * torsoBounds.width
        : torsoCenterX
      const torsoPivotY = torsoBounds
        ? torsoBounds.minY + (1 - torsoPivot[1]) * torsoBounds.height
        : torsoCenterY

      offsetX = pivotImageX - torsoPivotX
      offsetY = pivotImageY - torsoPivotY
    }

    const parentId = region.boneRole === 'torso' ? null : 'torso'

    const part: CharacterPart = {
      id: region.boneRole,
      textureUrl,
      originalFilename: `${region.boneRole}.png`,
      textureWidth: extracted.canvas.width,
      textureHeight: extracted.canvas.height,
      pivot,
      parentId,
      offset: [offsetX, offsetY, 0],
      zIndex,
      boneRole: region.boneRole,
    }

    results.push({ part, blob })
  }

  return results
}
