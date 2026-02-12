import { useEffect, useRef, useState } from 'react'

// Lightweight FPS counter — measures actual display frame rate via rAF.
// Toggled by backtick (`) key.

export function FpsCounter() {
  const [fps, setFps] = useState(0)
  const frames = useRef(0)
  const lastTime = useRef(performance.now())

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

  return (
    <div
      className="fixed top-2 right-2 font-mono text-[11px] px-2 py-1 rounded bg-black/70 border border-white/10 text-green-400 tabular-nums pointer-events-none select-none"
      style={{ zIndex: 9999 }}
    >
      {fps} fps
    </div>
  )
}
