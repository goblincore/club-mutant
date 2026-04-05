import { useCallback } from 'react'

export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface ResizeState {
  position: { x: number; y: number }
  size: { width: number; height: number }
}

interface UseResizeOptions {
  minWidth?: number
  minHeight?: number
  onResize: (state: ResizeState) => void
}

export function useResize({ minWidth = 200, minHeight = 100, onResize }: UseResizeOptions) {
  const handleResizeStart = useCallback(
    (edge: ResizeEdge, startPos: ResizeState) => (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const startX = e.clientX
      const startY = e.clientY
      const startState = { ...startPos, position: { ...startPos.position }, size: { ...startPos.size } }

      const handleMove = (e: PointerEvent) => {
        const dx = e.clientX - startX
        const dy = e.clientY - startY
        let { x, y } = startState.position
        let { width, height } = startState.size

        if (edge.includes('e')) width = Math.max(minWidth, startState.size.width + dx)
        if (edge.includes('s')) height = Math.max(minHeight, startState.size.height + dy)
        if (edge.includes('w')) {
          const newWidth = Math.max(minWidth, startState.size.width - dx)
          x = startState.position.x + (startState.size.width - newWidth)
          width = newWidth
        }
        if (edge.includes('n')) {
          const newHeight = Math.max(minHeight, startState.size.height - dy)
          y = startState.position.y + (startState.size.height - newHeight)
          height = newHeight
        }

        onResize({ position: { x, y }, size: { width, height } })
      }

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [minWidth, minHeight, onResize]
  )

  return { handleResizeStart }
}
