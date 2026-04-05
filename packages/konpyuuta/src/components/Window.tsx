import { useEffect, useState, ReactNode } from 'react'
import { useWindow } from '../hooks/useWindow'
import { useDrag } from '../hooks/useDrag'
import { useResize, ResizeEdge } from '../hooks/useResize'
import { useWindowStore } from '../stores/windowStore'

interface WindowProps {
  id: string
  children: ReactNode
}

export function Window({ id, children }: WindowProps) {
  const { win, close, focus, move, minimize, maximize, shade } = useWindow(id)
  const [opening, setOpening] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setOpening(false), 200)
    return () => clearTimeout(t)
  }, [])

  const { handlePointerDown: handleDragStart } = useDrag({
    onMove: (dx, dy) => {
      if (!win) return
      move({ x: win.position.x + dx, y: win.position.y + dy })
    },
    onStart: focus,
  })

  const { handleResizeStart } = useResize({
    onResize: ({ position, size }) => {
      useWindowStore.getState().moveWindow(id, position)
      useWindowStore.getState().resizeWindow(id, size)
    },
  })

  if (!win || win.minimized) return null

  const windowStyle: React.CSSProperties = win.maximized
    ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: win.zIndex, width: '100%', height: '100%' }
    : { position: 'fixed', left: win.position.x, top: win.position.y, width: win.size.width, height: win.size.height, zIndex: win.zIndex }

  const RESIZE_EDGES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

  return (
    <div
      className={`cde-window${opening ? ' cde-window-opening' : ''}`}
      style={windowStyle}
      onPointerDown={focus}
    >
      {/* Titlebar */}
      <div
        className="cde-titlebar"
        onPointerDown={handleDragStart}
        onDoubleClick={shade}
      >
        <div className="cde-titlebar-buttons">
          <button className="cde-btn-close" onPointerDown={(e) => e.stopPropagation()} onClick={close} aria-label="Close" />
          <button className="cde-btn-shade" onPointerDown={(e) => e.stopPropagation()} onClick={shade} aria-label="Shade" />
          <button className="cde-btn-maximize" onPointerDown={(e) => e.stopPropagation()} onClick={maximize} aria-label="Maximize" />
          <button className="cde-btn-minimize" onPointerDown={(e) => e.stopPropagation()} onClick={minimize} aria-label="Minimize" />
        </div>
        <span className="cde-titlebar-title">{win.title}</span>
      </div>

      {/* Window body */}
      {!win.shaded && (
        <div className="cde-window-body">
          {children}
        </div>
      )}

      {/* Resize handles (not shown when maximized) */}
      {!win.maximized && RESIZE_EDGES.map((edge) => (
        <div
          key={edge}
          className={`cde-resize cde-resize-${edge}`}
          onPointerDown={handleResizeStart(edge, { position: win.position, size: win.size })}
        />
      ))}
    </div>
  )
}
