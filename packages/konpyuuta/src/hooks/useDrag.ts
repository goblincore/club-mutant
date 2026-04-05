import { useCallback, useRef } from 'react'

interface UseDragOptions {
  onMove: (dx: number, dy: number) => void
  onStart?: () => void
  onEnd?: () => void
}

export function useDrag({ onMove, onStart, onEnd }: UseDragOptions) {
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    onStart?.()

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - lastPos.current.x
      const dy = e.clientY - lastPos.current.y
      lastPos.current = { x: e.clientX, y: e.clientY }
      onMove(dx, dy)
    }

    const handlePointerUp = () => {
      dragging.current = false
      onEnd?.()
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }, [onMove, onStart, onEnd])

  return { handlePointerDown }
}
