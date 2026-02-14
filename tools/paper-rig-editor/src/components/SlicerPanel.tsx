import { useEditorStore } from '../store'
import type { BoneRole } from '../types'

const REGION_COLORS: Record<BoneRole, string> = {
  head: '#60a5fa',
  torso: '#4ade80',
  arm_l: '#fb923c',
  arm_r: '#f97316',
  leg_l: '#c084fc',
  leg_r: '#a855f7',
}

export function SlicerPanel() {
  const regions = useEditorStore((s) => s.slicerRegions)
  const selectedRegionId = useEditorStore((s) => s.slicerSelectedRegionId)
  const drawingRole = useEditorStore((s) => s.slicerDrawingRole)
  const sourceUrl = useEditorStore((s) => s.slicerSourceUrl)
  const sourceWidth = useEditorStore((s) => s.slicerSourceWidth)
  const sourceHeight = useEditorStore((s) => s.slicerSourceHeight)

  const updateSlicerRegion = useEditorStore((s) => s.updateSlicerRegion)
  const setSlicerSelectedRegionId = useEditorStore((s) => s.setSlicerSelectedRegionId)
  const setSlicerDrawingRole = useEditorStore((s) => s.setSlicerDrawingRole)

  const selected = regions.find((r) => r.id === selectedRegionId) ?? null

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-3">
        Bone Regions
      </h2>

      {!sourceUrl && (
        <p className="text-xs text-white/30 text-center mt-4">
          Drop an image in the center panel to start.
        </p>
      )}

      {sourceUrl && regions.length > 0 && (
        <p className="text-[10px] text-white/30 mb-3">
          Click "draw" next to a bone to start drawing its polygon outline on the image.
        </p>
      )}

      {/* Region list */}
      {regions.length > 0 && (
        <div className="space-y-1 mb-4">
          {regions.map((region) => {
            const color = REGION_COLORS[region.boneRole] ?? '#fff'
            const isSelected = region.id === selectedRegionId
            const isDrawing = drawingRole === region.id
            const hasPoints = region.points.length > 0
            const isClosed = region.points.length >= 3 && !isDrawing

            return (
              <div
                key={region.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${
                  isDrawing
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : isSelected
                      ? 'bg-white/10 text-white'
                      : 'hover:bg-white/5 text-white/70'
                }`}
                onClick={() => {
                  if (!isDrawing) {
                    setSlicerSelectedRegionId(region.id)
                  }
                }}
              >
                {/* Color indicator */}
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: color, opacity: region.enabled ? 1 : 0.3 }}
                />

                {/* Label + point count */}
                <span
                  className={`flex-1 font-mono text-xs ${!region.enabled ? 'line-through opacity-40' : ''}`}
                >
                  {region.boneRole}

                  {hasPoints && (
                    <span className="text-white/30 ml-1">
                      ({region.points.length}pts{isClosed ? '' : '...'})
                    </span>
                  )}
                </span>

                {/* Draw / Clear button */}
                {region.enabled && (
                  <button
                    className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                      isDrawing
                        ? 'bg-cyan-400/20 text-cyan-300'
                        : hasPoints
                          ? 'text-red-300/60 hover:text-red-300'
                          : 'text-cyan-300/60 hover:text-cyan-300'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()

                      if (isDrawing) {
                        // Stop drawing
                        setSlicerDrawingRole(null)

                        if (region.points.length >= 3) {
                          setSlicerSelectedRegionId(region.id)
                        }
                      } else if (hasPoints) {
                        // Clear and redraw
                        updateSlicerRegion(region.id, { points: [] })
                        setSlicerDrawingRole(region.id)
                      } else {
                        // Start drawing
                        setSlicerDrawingRole(region.id)
                      }
                    }}
                  >
                    {isDrawing ? 'done' : hasPoints ? 'clear' : 'draw'}
                  </button>
                )}

                {/* Enable/disable toggle */}
                <button
                  className={`text-[10px] px-1 rounded transition-colors ${
                    region.enabled
                      ? 'text-green-300 hover:text-green-200'
                      : 'text-white/30 hover:text-white/50'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    updateSlicerRegion(region.id, { enabled: !region.enabled })
                  }}
                >
                  {region.enabled ? 'on' : 'off'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Selected region info */}
      {selected && !drawingRole && (
        <div className="border-t border-white/10 pt-3 space-y-3">
          <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider">
            {selected.boneRole}
          </h3>

          <div className="text-[10px] text-white/40">
            {selected.points.length >= 3 ? (
              <span>{selected.points.length} vertices (closed)</span>
            ) : selected.points.length > 0 ? (
              <span>{selected.points.length} vertices (incomplete)</span>
            ) : (
              <span>No polygon drawn yet</span>
            )}
          </div>

          {selected.points.length > 0 && (
            <button
              className="text-[10px] text-red-300/60 hover:text-red-300 transition-colors"
              onClick={() => {
                updateSlicerRegion(selected.id, { points: [] })
              }}
            >
              Clear polygon
            </button>
          )}

          {sourceWidth > 0 && (
            <p className="text-[10px] text-white/25 mt-2">
              Source: {sourceWidth} × {sourceHeight}
            </p>
          )}
        </div>
      )}

      {/* Drawing instructions */}
      {drawingRole && (
        <div className="border-t border-white/10 pt-3">
          <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2">
            Drawing: {drawingRole}
          </h3>

          <div className="text-[10px] text-white/40 space-y-1">
            <p>Click on the image to place polygon vertices.</p>
            <p>Click near the first point (white dot) to close the shape.</p>
            <p>Right-click or Esc to undo last point.</p>
            <p>Cmd/Ctrl+Z to undo.</p>
          </div>
        </div>
      )}
    </div>
  )
}
