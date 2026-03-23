import { useRef, useState, useCallback, useEffect } from 'react'
import { useOS5kStore } from '../../stores/os5000kStore'
import type { OS5000kBridgeHost } from './OS5000kBridgeHost'

interface OS5kWindowProps {
  id: string
  appId: string
  title: string
  icon: string
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
  maximized: boolean
  zIndex: number
  bridge: OS5000kBridgeHost | null
}

export function OS5000kWindow({
  id, appId, title, icon, x, y, width, height,
  minimized, maximized, zIndex, bridge,
}: OS5kWindowProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; winW: number; winH: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)

  // Local position during drag for smooth movement (committed to store on pointer up)
  const [localPos, setLocalPos] = useState({ x, y })
  const [localSize, setLocalSize] = useState({ width, height })

  // Sync from store when not actively dragging
  useEffect(() => {
    if (!dragging) setLocalPos({ x, y })
  }, [x, y, dragging])
  useEffect(() => {
    if (!resizing) setLocalSize({ width, height })
  }, [width, height, resizing])

  const handleIframeLoad = useCallback(() => {
    if (iframeRef.current && bridge) {
      bridge.registerIframe(iframeRef.current)
      // Give bridge-sdk time to initialize in the iframe
      setTimeout(() => {
        if (iframeRef.current) bridge.sendConnectedTo(iframeRef.current)
      }, 200)
    }
  }, [bridge])

  // Cleanup iframe from bridge on unmount
  useEffect(() => {
    return () => {
      if (iframeRef.current && bridge) {
        bridge.unregisterIframe(iframeRef.current)
      }
    }
  }, [bridge])

  // ── Drag handling ──
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (maximized) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, winX: localPos.x, winY: localPos.y }
    setDragging(true)
    useOS5kStore.getState().focusWindow(id)
  }, [id, localPos, maximized])

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setLocalPos({ x: dragRef.current.winX + dx, y: dragRef.current.winY + dy })
  }, [])

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    useOS5kStore.getState().moveWindow(id, localPos.x, localPos.y)
    dragRef.current = null
    setDragging(false)
  }, [id, localPos])

  // ── Resize handling ──
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    if (maximized) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeRef.current = { startX: e.clientX, startY: e.clientY, winW: localSize.width, winH: localSize.height }
    setResizing(true)
  }, [localSize, maximized])

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return
    const dx = e.clientX - resizeRef.current.startX
    const dy = e.clientY - resizeRef.current.startY
    setLocalSize({
      width: Math.max(280, resizeRef.current.winW + dx),
      height: Math.max(200, resizeRef.current.winH + dy),
    })
  }, [])

  const handleResizeEnd = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    useOS5kStore.getState().resizeWindow(id, localSize.width, localSize.height)
    resizeRef.current = null
    setResizing(false)
  }, [id, localSize])

  if (minimized) return null

  const style: React.CSSProperties = maximized
    ? { position: 'absolute', top: 0, left: 0, right: 0, bottom: 36, zIndex }
    : { position: 'absolute', top: localPos.y, left: localPos.x, width: localSize.width, height: localSize.height + 32, zIndex }

  return (
    <div
      style={style}
      onPointerDown={() => useOS5kStore.getState().focusWindow(id)}
      className="flex flex-col rounded-lg overflow-hidden"
    >
      {/* Pointer overlay during drag/resize to prevent iframe capturing events */}
      {(dragging || resizing) && <div className="absolute inset-0 z-50" />}

      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-2 py-1 select-none shrink-0 cursor-grab active:cursor-grabbing"
        style={{ background: '#2a2a2e', height: 32 }}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <span className="text-sm">{icon}</span>
        <span className="flex-1 text-[11px] font-mono text-white/70 truncate">{title}</span>
        <div className="flex items-center gap-1">
          {/* Minimize */}
          <button
            onClick={(e) => { e.stopPropagation(); useOS5kStore.getState().minimizeWindow(id) }}
            className="w-5 h-5 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          {/* Maximize */}
          <button
            onClick={(e) => { e.stopPropagation(); maximized ? useOS5kStore.getState().unmaximizeWindow(id) : useOS5kStore.getState().maximizeWindow(id) }}
            className="w-5 h-5 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          </button>
          {/* Close */}
          <button
            onClick={(e) => { e.stopPropagation(); useOS5kStore.getState().closeWindow(id) }}
            className="w-5 h-5 flex items-center justify-center rounded text-white/40 hover:text-red-400 hover:bg-white/10"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* Content — iframe */}
      <div className="flex-1 bg-black relative">
        <iframe
          ref={iframeRef}
          src={`/os5000k/apps/${appId}.html`}
          title={title}
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="w-full h-full border-0"
          onLoad={handleIframeLoad}
        />
      </div>

      {/* Resize handle (bottom-right corner) */}
      {!maximized && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" className="text-white/20">
            <path d="M14 14L8 14M14 14L14 8M14 14L6 6" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </div>
      )}
    </div>
  )
}
