import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useOS5kStore } from '../../stores/os5000kStore'
import type { OS5000kBridgeHost } from './OS5000kBridgeHost'
import { win98, W98 } from './win98Styles'

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

  const windowOrder = useOS5kStore((s) => s.windowOrder)
  const isFocused = windowOrder[windowOrder.length - 1] === id

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

  const outerStyle: React.CSSProperties = {
    ...style,
    ...win98.raised,
    display: 'flex',
    flexDirection: 'column',
    background: W98.gray,
    borderRadius: 0,
    overflow: 'hidden',
  }

  return (
    <div
      style={outerStyle}
      onPointerDown={() => useOS5kStore.getState().focusWindow(id)}
    >
      {(dragging || resizing) && <div className="absolute inset-0 z-50" />}

      {/* Title bar */}
      <div
        style={{
          ...(isFocused ? win98.titleActive : win98.titleInactive),
          height: 20,
          flexShrink: 0,
          cursor: dragging ? 'grabbing' : 'grab',
        }}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
          {/* Minimize */}
          <button
            style={win98.titleButton}
            onClick={(e) => { e.stopPropagation(); useOS5kStore.getState().minimizeWindow(id) }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Minimize"
          >_</button>
          {/* Maximize */}
          <button
            style={win98.titleButton}
            onClick={(e) => { e.stopPropagation(); maximized ? useOS5kStore.getState().unmaximizeWindow(id) : useOS5kStore.getState().maximizeWindow(id) }}
            onPointerDown={(e) => e.stopPropagation()}
            title={maximized ? 'Restore' : 'Maximize'}
          >□</button>
          {/* Close */}
          <button
            style={{ ...win98.titleButton, marginLeft: 2 }}
            onClick={(e) => { e.stopPropagation(); useOS5kStore.getState().closeWindow(id) }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Close"
          >✕</button>
        </div>
      </div>

      {/* Content — sunken border + iframe */}
      <div style={{ flex: 1, ...win98.sunken, margin: 2, position: 'relative', overflow: 'hidden' }}>
        <iframe
          ref={iframeRef}
          src={`/os5000k/apps/${appId}.html`}
          title={title}
          sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
          onLoad={handleIframeLoad}
        />
      </div>

      {/* Resize handle */}
      {!maximized && (
        <div
          style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, cursor: 'se-resize', zIndex: 10 }}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M10 10L4 10M10 10L10 4M10 10L2 2" stroke={W98.mid} strokeWidth="1.5"/>
          </svg>
        </div>
      )}
    </div>
  )
}
