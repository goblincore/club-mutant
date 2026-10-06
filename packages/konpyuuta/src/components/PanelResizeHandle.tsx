import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { clampPanelSize, type PanelSize } from '../lib/panelSize'

export function usePanelSize(panel: RefObject<HTMLElement>, minimum: PanelSize, anchorRight = false, maximumWidth = Infinity) {
  const [size, setSize] = useState<PanelSize | null>(null)
  const bounds = () => {
    const element = panel.current
    if (!element?.parentElement) return minimum
    const rect = element.getBoundingClientRect()
    const parent = element.parentElement.getBoundingClientRect()
    return { width: Math.min(maximumWidth, Math.max(0, anchorRight ? rect.right - parent.left - 8 : parent.right - rect.left - 8)), height: Math.max(0, parent.bottom - rect.top - 10) }
  }
  const resize = (next: PanelSize) => setSize(clampPanelSize(next, bounds(), minimum))
  // Clamp custom sizes after viewport changes or the companion window toggles.
  useEffect(() => {
    const element = panel.current
    if (!element?.parentElement) return
    const observer = new ResizeObserver(() => setSize((current) => {
      if (!current || !element.getClientRects().length) return current
      const next = clampPanelSize(current, bounds(), minimum)
      return next.width === current.width && next.height === current.height ? current : next
    }))
    observer.observe(element.parentElement)
    observer.observe(element)
    return () => observer.disconnect()
  }, [panel, minimum.width, minimum.height, anchorRight, maximumWidth])
  return { resize, style: size ? { '--panel-width': `${size.width}px`, '--panel-height': `${size.height}px` } as CSSProperties : undefined }
}

export function PanelResizeHandle({ panel, resize, name, anchorRight = false }: { panel: RefObject<HTMLElement>; resize: (size: PanelSize) => void; name: string; anchorRight?: boolean }) {
  const drag = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  return <button type="button" className={`portal-resize-handle${anchorRight ? ' portal-resize-left' : ''}`} aria-label={`Resize ${name}`} title="Drag to resize · Arrow keys resize · Shift for larger steps" onPointerDown={(event) => {
    if (event.button !== 0 || !panel.current) return
    const rect = panel.current.getBoundingClientRect()
    drag.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }} onPointerMove={(event) => {
    const start = drag.current
    if (start) resize({ width: start.width + (event.clientX - start.x) * (anchorRight ? -1 : 1), height: start.height + event.clientY - start.y })
  }} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }} onKeyDown={(event) => {
    if (!panel.current || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const { width, height } = panel.current.getBoundingClientRect()
    const step = event.shiftKey ? 32 : 8
    resize({ width: width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), height: height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) })
  }}><span aria-hidden="true">◢</span></button>
}
