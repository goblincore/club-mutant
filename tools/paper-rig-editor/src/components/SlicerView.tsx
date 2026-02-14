import { useCallback, useEffect, useRef, useState } from 'react'

import { useEditorStore } from '../store'
import { imageUrlToCanvas, removeBackground, canvasToObjectUrl } from '../utils/backgroundRemoval'
import { sliceImageIntoParts } from '../utils/imageSlicing'
import type { BoneRole } from '../types'

// Color per bone role for the polygon overlays
const REGION_COLORS: Record<BoneRole, string> = {
  head: '#60a5fa',
  torso: '#4ade80',
  arm_l: '#fb923c',
  arm_r: '#f97316',
  leg_l: '#c084fc',
  leg_r: '#a855f7',
}

// Vertex hit-test radius in display pixels
const VERTEX_RADIUS = 6

// Distance threshold to close a polygon (click near first point)
const CLOSE_DISTANCE = 12

export function SlicerView() {
  const sourceUrl = useEditorStore((s) => s.slicerSourceUrl)
  const processedUrl = useEditorStore((s) => s.slicerProcessedUrl)
  const sourceWidth = useEditorStore((s) => s.slicerSourceWidth)
  const sourceHeight = useEditorStore((s) => s.slicerSourceHeight)
  const regions = useEditorStore((s) => s.slicerRegions)
  const tolerance = useEditorStore((s) => s.slicerTolerance)
  const selectedRegionId = useEditorStore((s) => s.slicerSelectedRegionId)
  const drawingRole = useEditorStore((s) => s.slicerDrawingRole)

  const setSlicerSource = useEditorStore((s) => s.setSlicerSource)
  const setSlicerProcessedUrl = useEditorStore((s) => s.setSlicerProcessedUrl)
  const setSlicerTolerance = useEditorStore((s) => s.setSlicerTolerance)
  const setSlicerSelectedRegionId = useEditorStore((s) => s.setSlicerSelectedRegionId)
  const setSlicerDrawingRole = useEditorStore((s) => s.setSlicerDrawingRole)
  const addPointToRegion = useEditorStore((s) => s.addPointToRegion)
  const removeLastPointFromRegion = useEditorStore((s) => s.removeLastPointFromRegion)
  const setMode = useEditorStore((s) => s.setMode)
  const addPart = useEditorStore((s) => s.addPart)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [processing, setProcessing] = useState(false)
  const [slicing, setSlicing] = useState(false)
  const [scale, setScale] = useState(1)
  const [mousePos, setMousePos] = useState<[number, number] | null>(null)
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // The region currently being drawn (if drawingRole is set)
  const drawingRegion = drawingRole ? (regions.find((r) => r.id === drawingRole) ?? null) : null

  // Compute display scale to fit image in container
  useEffect(() => {
    if (!containerRef.current || !sourceWidth || !sourceHeight) return

    const updateScale = () => {
      const container = containerRef.current
      if (!container) return

      const cw = container.clientWidth - 40
      const ch = container.clientHeight - 40

      const sx = cw / sourceWidth
      const sy = ch / sourceHeight

      setScale(Math.min(sx, sy, 1))
    }

    updateScale()

    const observer = new ResizeObserver(updateScale)
    observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [sourceWidth, sourceHeight])

  // Process background removal when source or tolerance changes
  useEffect(() => {
    if (!sourceUrl) return

    let cancelled = false

    setProcessing(true)

    void (async () => {
      try {
        const canvas = await imageUrlToCanvas(sourceUrl)
        const processed = removeBackground(canvas, tolerance)

        if (cancelled) return

        processedCanvasRef.current = processed

        const url = await canvasToObjectUrl(processed)

        if (cancelled) return

        setSlicerProcessedUrl(url)
      } catch (err) {
        console.error('[Slicer] Background removal failed:', err)
      } finally {
        if (!cancelled) setProcessing(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [sourceUrl, tolerance, setSlicerProcessedUrl])

  // Draw polygon overlays on the canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !sourceWidth || !sourceHeight) return

    canvas.width = sourceWidth * scale
    canvas.height = sourceHeight * scale

    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const region of regions) {
      if (!region.enabled || region.points.length === 0) continue

      const color = REGION_COLORS[region.boneRole] ?? '#fff'
      const isSelected = selectedRegionId === region.id
      const isDrawing = drawingRole === region.id

      const pts = region.points.map(([x, y]) => [x * scale, y * scale] as [number, number])

      // Fill polygon (closed regions only)
      if (pts.length >= 3 && !isDrawing) {
        ctx.beginPath()
        ctx.moveTo(pts[0]![0], pts[0]![1])

        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i]![0], pts[i]![1])
        }

        ctx.closePath()
        ctx.fillStyle = isSelected ? color + '30' : color + '15'
        ctx.fill()
      }

      // Stroke outline
      ctx.beginPath()
      ctx.moveTo(pts[0]![0], pts[0]![1])

      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i]![0], pts[i]![1])
      }

      // If drawing, show line to cursor
      if (isDrawing && mousePos) {
        ctx.lineTo(mousePos[0], mousePos[1])
      } else if (pts.length >= 3) {
        ctx.closePath()
      }

      ctx.strokeStyle = color
      ctx.lineWidth = isSelected || isDrawing ? 2.5 : 1.5
      ctx.stroke()

      // Draw vertices
      for (let i = 0; i < pts.length; i++) {
        const [px, py] = pts[i]!
        const isFirst = i === 0

        ctx.beginPath()
        ctx.arc(px, py, isFirst && isDrawing ? VERTEX_RADIUS + 2 : VERTEX_RADIUS, 0, Math.PI * 2)
        ctx.fillStyle = isFirst && isDrawing ? '#ffffff' : color
        ctx.fill()

        ctx.strokeStyle = '#000'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Label at centroid
      if (pts.length >= 2) {
        let cx = 0
        let cy = 0

        for (const [px, py] of pts) {
          cx += px
          cy += py
        }

        cx /= pts.length
        cy /= pts.length

        ctx.font = 'bold 11px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // Background
        const metrics = ctx.measureText(region.boneRole)
        const tw = metrics.width + 6
        const th = 14

        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(cx - tw / 2, cy - th / 2, tw, th)

        ctx.fillStyle = color
        ctx.fillText(region.boneRole, cx, cy)
      }
    }
  }, [regions, scale, sourceWidth, sourceHeight, selectedRegionId, drawingRole, mousePos])

  // Convert mouse event to image-pixel coordinates
  const eventToImageCoords = useCallback(
    (e: React.MouseEvent): [number, number] | null => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()

      return [(e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale]
    },
    [scale]
  )

  // Handle canvas click — add polygon point or close polygon
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const coords = eventToImageCoords(e)
      if (!coords) return

      // If drawing, add point or close polygon
      if (drawingRole && drawingRegion) {
        const pts = drawingRegion.points

        // Check if clicking near first point to close
        if (pts.length >= 3) {
          const [fx, fy] = pts[0]!
          const dx = coords[0] - fx
          const dy = coords[1] - fy
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < CLOSE_DISTANCE / scale) {
            // Close the polygon — stop drawing
            setSlicerDrawingRole(null)
            setSlicerSelectedRegionId(drawingRole)
            return
          }
        }

        addPointToRegion(drawingRole, coords)
        return
      }

      // Not drawing — check if clicking on an existing polygon
      for (const region of regions) {
        if (!region.enabled || region.points.length < 3) continue

        // Point-in-polygon test
        if (pointInPolygon(coords, region.points)) {
          setSlicerSelectedRegionId(region.id)
          return
        }
      }

      // Clicked on nothing
      setSlicerSelectedRegionId(null)
    },
    [
      drawingRole,
      drawingRegion,
      regions,
      scale,
      eventToImageCoords,
      addPointToRegion,
      setSlicerDrawingRole,
      setSlicerSelectedRegionId,
    ]
  )

  // Track mouse position for drawing preview line
  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawingRole) {
        if (mousePos) setMousePos(null)
        return
      }

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()

      setMousePos([e.clientX - rect.left, e.clientY - rect.top])
    },
    [drawingRole, mousePos]
  )

  // Undo last point with right-click or Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawingRole) {
        const region = regions.find((r) => r.id === drawingRole)

        if (region && region.points.length > 0) {
          removeLastPointFromRegion(drawingRole)
        } else {
          setSlicerDrawingRole(null)
        }
      }

      // Ctrl+Z to undo last point
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && drawingRole) {
        removeLastPointFromRegion(drawingRole)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [drawingRole, regions, removeLastPointFromRegion, setSlicerDrawingRole])

  // Right-click to undo last point
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()

      if (drawingRole) {
        removeLastPointFromRegion(drawingRole)
      }
    },
    [drawingRole, removeLastPointFromRegion]
  )

  // Handle image drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))

      if (!file) return

      const url = URL.createObjectURL(file)
      const img = new Image()

      img.onload = () => {
        setSlicerSource(url, img.width, img.height)
      }

      img.src = url
    },
    [setSlicerSource]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // Apply slicing — generate parts and switch to rig mode
  const handleApply = useCallback(async () => {
    if (!processedCanvasRef.current) return

    setSlicing(true)

    try {
      const results = await sliceImageIntoParts(
        processedCanvasRef.current,
        regions,
        sourceWidth,
        sourceHeight
      )

      for (const { part } of results) {
        addPart(part)
      }

      setMode('rig')
    } catch (err) {
      console.error('[Slicer] Slicing failed:', err)
    } finally {
      setSlicing(false)
    }
  }, [regions, sourceWidth, sourceHeight, addPart, setMode])

  const hasRegionsWithPoints = regions.some((r) => r.enabled && r.points.length >= 3)

  // No image loaded — show drop zone
  if (!sourceUrl) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div className="border-2 border-dashed border-white/20 rounded-xl p-12 text-center hover:border-white/40 transition-colors">
          <p className="text-white/50 text-sm mb-2">Drop a character image here</p>

          <p className="text-white/30 text-xs">
            PNG, JPG, or WebP — the background will be auto-removed
          </p>
        </div>
      </div>
    )
  }

  const displayW = sourceWidth * scale
  const displayH = sourceHeight * scale

  return (
    <div className="w-full h-full flex flex-col">
      {/* Tolerance + controls bar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-black/30 border-b border-white/10">
        <label className="text-xs text-white/50 flex items-center gap-2">
          BG Tolerance
          <input
            type="range"
            min={0}
            max={120}
            step={1}
            value={tolerance}
            onChange={(e) => setSlicerTolerance(parseInt(e.target.value))}
            className="w-32 accent-green-400"
          />
          <span className="text-white/70 font-mono w-8 text-right">{tolerance}</span>
        </label>

        {processing && <span className="text-xs text-yellow-300 animate-pulse">Processing...</span>}

        {drawingRole && (
          <span className="text-xs text-cyan-300">
            Drawing <strong>{drawingRole}</strong> — click to place points, click first point to
            close, Esc/right-click to undo
          </span>
        )}

        <div className="flex-1" />

        <button
          className="px-3 py-1 rounded text-xs font-mono border border-green-400/50 text-green-300 bg-green-400/10 hover:bg-green-400/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleApply}
          disabled={slicing || processing || !hasRegionsWithPoints}
        >
          {slicing ? 'Slicing...' : 'Apply & Build Parts'}
        </button>
      </div>

      {/* Image + polygon canvas overlay */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex items-center justify-center bg-[#1a1a2e]"
      >
        <div className="relative" style={{ width: displayW, height: displayH }}>
          {/* Checkerboard background for transparency */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
            }}
          />

          {/* Processed image (bg removed) */}
          {processedUrl && (
            <img
              src={processedUrl}
              alt="Processed"
              className="absolute inset-0 w-full h-full"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />
          )}

          {/* Polygon overlay canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            style={{
              width: displayW,
              height: displayH,
              cursor: drawingRole ? 'crosshair' : 'default',
            }}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onContextMenu={handleContextMenu}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Ray-casting point-in-polygon test.
 */
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [px, py] = point
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!

    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }

  return inside
}
