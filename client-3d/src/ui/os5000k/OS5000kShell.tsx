import { useEffect, useRef, useCallback } from 'react'
import { useOS5kStore } from '../../stores/os5000kStore'
import { useUIStore } from '../../stores/uiStore'
import { OS5000kBridgeHost } from './OS5000kBridgeHost'
import { OS5000kBoot } from './OS5000kBoot'
import { OS5000kDesktop } from './OS5000kDesktop'
import { OS5000kWindow } from './OS5000kWindow'
import { OS5000kTaskbar } from './OS5000kTaskbar'
import { OS5000kNativePlayer } from './OS5000kNativePlayer'

export function OS5000kShell() {
  const osActive = useUIStore((s) => s.osActive)
  const bootPhase = useOS5kStore((s) => s.bootPhase)
  const windows = useOS5kStore((s) => s.windows)
  const windowOrder = useOS5kStore((s) => s.windowOrder)
  const bridgeRef = useRef<OS5000kBridgeHost | null>(null)

  // Start boot when OS becomes active
  useEffect(() => {
    if (osActive && bootPhase === 'off') {
      useOS5kStore.getState().setBootPhase('booting')
    }
  }, [osActive, bootPhase])

  // Create/destroy bridge host
  useEffect(() => {
    if (!osActive) return

    const bridge = new OS5000kBridgeHost()
    bridgeRef.current = bridge

    return () => {
      bridge.destroy()
      bridgeRef.current = null
    }
  }, [osActive])

  // Escape key to close OS
  useEffect(() => {
    if (!osActive) return

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        useOS5kStore.getState().closeAllWindows()
        useOS5kStore.getState().setBootPhase('off')
        useOS5kStore.getState().setActiveVideo(null)
        useUIStore.getState().setOsActive(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [osActive])

  const handleBootComplete = useCallback(() => {
    useOS5kStore.getState().setBootPhase('desktop')
  }, [])

  if (!osActive) return null

  if (bootPhase === 'booting') {
    return <OS5000kBoot onComplete={handleBootComplete} />
  }

  if (bootPhase !== 'desktop') return null

  return (
    <div className="fixed inset-0 bg-black" style={{ zIndex: 40 }}>
      {/* Desktop (background) */}
      <OS5000kDesktop />

      {/* Windows */}
      {windowOrder.map((winId, i) => {
        const win = windows.get(winId)
        if (!win) return null
        return (
          <OS5000kWindow
            key={winId}
            id={win.id}
            appId={win.appId}
            title={win.title}
            icon={win.icon}
            x={win.x}
            y={win.y}
            width={win.width}
            height={win.height}
            minimized={win.minimized}
            maximized={win.maximized}
            zIndex={100 + i}
            bridge={bridgeRef.current}
          />
        )
      })}

      {/* Native video player (above windows) */}
      <OS5000kNativePlayer />

      {/* Taskbar (always on top) */}
      <OS5000kTaskbar />
    </div>
  )
}
