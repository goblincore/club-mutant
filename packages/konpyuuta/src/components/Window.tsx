import { useEffect, useState, useCallback, ReactNode } from 'react'
import { useWindow } from '../hooks/useWindow'
import { useDrag } from '../hooks/useDrag'
import { useResize, ResizeEdge } from '../hooks/useResize'
import { useWindowStore } from '../stores/windowStore'
import { AudioManager } from '../lib/audioManager'

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

  const TOPBAR_HEIGHT = 28

  const { handlePointerDown: handleDragStart } = useDrag({
    // Read from store directly to avoid stale closure over win.position
    onMove: useCallback((dx, dy) => {
      const current = useWindowStore.getState().windows[id]
      if (!current) return
      move({
        x: current.position.x + dx,
        y: Math.max(TOPBAR_HEIGHT, current.position.y + dy),
      })
    }, [id, move]),
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
    ? { position: 'fixed', top: 28, left: 0, right: 0, bottom: 0, zIndex: win.zIndex }
    : { position: 'fixed', left: win.position.x, top: win.position.y, width: win.size.width, height: win.size.height, zIndex: win.zIndex }

  const RESIZE_EDGES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

  return (
    <div
      className={`cde-window${opening ? ' cde-window-opening' : ''}${win.maximized ? ' cde-window-maximized' : ''}`}
      style={windowStyle}
      onPointerDown={focus}
    >
      {/* Titlebar */}
      <div
        className="cde-titlebar"
        onPointerDown={handleDragStart}
        onDoubleClick={shade}
      >
        <div className="cde-titlebar-left">
          <button className="cde-btn-shade" onPointerDown={(e) => e.stopPropagation()} onClick={() => { AudioManager.windowShade(); shade() }} aria-label="Shade" />
        </div>
        <span className="cde-titlebar-title">{win.title}</span>
        <div className="cde-titlebar-right">
          <button className="cde-btn-maximize" onPointerDown={(e) => e.stopPropagation()} onClick={() => { AudioManager.windowMaximize(); maximize() }} aria-label="Maximize" />
          <button className="cde-btn-close" onPointerDown={(e) => e.stopPropagation()} onClick={() => { AudioManager.windowClose(); close() }} aria-label="Close" />
        </div>
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
