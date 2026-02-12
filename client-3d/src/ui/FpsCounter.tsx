import { useEffect, useRef, useState, useCallback } from 'react'

import { useUIStore } from '../stores/uiStore'

// Debug overlay — FPS counter + render controls.
// Toggled by backtick (`) key.

export function FpsCounter() {
  const [fps, setFps] = useState(0)
  const frames = useRef(0)
  const lastTime = useRef(performance.now())

  const renderScale = useUIStore((s) => s.renderScale)
  const fisheyeOverride = useUIStore((s) => s.fisheyeOverride)
  const vertexFisheye = useUIStore((s) => s.vertexFisheye)

  useEffect(() => {
    let rafId: number

    const tick = () => {
      frames.current++

      const now = performance.now()
      const elapsed = now - lastTime.current

      if (elapsed >= 1000) {
        setFps(Math.round((frames.current * 1000) / elapsed))
        frames.current = 0
        lastTime.current = now
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(rafId)
  }, [])

  const handleFisheyeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    useUIStore.getState().setFisheyeOverride(parseFloat(e.target.value))
  }, [])

  const resetFisheye = useCallback(() => {
    useUIStore.getState().setFisheyeOverride(null)
  }, [])

  const handleVertexFisheyeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    useUIStore.getState().setVertexFisheye(parseFloat(e.target.value))
  }, [])

  return (
    <div
      className="fixed top-2 right-2 font-mono text-[11px] flex flex-col gap-1.5 rounded bg-black/80 border border-white/10 px-2.5 py-2 select-none"
      style={{ zIndex: 9999, minWidth: 160 }}
    >
      <div className="text-green-400 tabular-nums">{fps} fps</div>

      <div className="text-white/40">render {Math.round(renderScale * 100)}%</div>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span className="text-white/40">fisheye</span>

          {fisheyeOverride !== null ? (
            <button
              onClick={resetFisheye}
              className="text-[9px] text-yellow-400/70 hover:text-yellow-300 transition-colors"
            >
              reset
            </button>
          ) : (
            <span className="text-[9px] text-white/25">auto</span>
          )}
        </div>

        <input
          type="range"
          min="0"
          max="5"
          step="0.05"
          value={fisheyeOverride ?? 1}
          onChange={handleFisheyeChange}
          className="w-full h-1 accent-purple-500 cursor-pointer"
        />

        <div className="text-white/30 tabular-nums text-center">
          {fisheyeOverride !== null ? fisheyeOverride.toFixed(2) : 'auto'}
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-white/40">vertex fisheye</span>

        <input
          type="range"
          min="0"
          max="3"
          step="0.05"
          value={vertexFisheye}
          onChange={handleVertexFisheyeChange}
          className="w-full h-1 accent-pink-500 cursor-pointer"
        />

        <div className="text-white/30 tabular-nums text-center">{vertexFisheye.toFixed(2)}</div>
      </div>
    </div>
  )
}
