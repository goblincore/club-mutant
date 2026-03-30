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
  const shutdownRequested = useOS5kStore((s) => s.shutdownRequested)
  const bridgeRef = useRef<OS5000kBridgeHost | null>(null)

  useEffect(() => {
    if (osActive && bootPhase === 'off') {
      useOS5kStore.getState().setBootPhase('booting')
    }
  }, [osActive, bootPhase])

  useEffect(() => {
    if (!osActive) return
    const bridge = new OS5000kBridgeHost()
    bridgeRef.current = bridge
    return () => { bridge.destroy(); bridgeRef.current = null }
  }, [osActive])

  // Escape key → request shutdown (shows confirmation dialog)
  useEffect(() => {
    if (!osActive) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useOS5kStore.getState().requestShutdown()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [osActive])

  // When confirmShutdown resets bootPhase to 'off', also deactivate OS
  useEffect(() => {
    if (!osActive) return
    if (bootPhase === 'off' && !shutdownRequested) {
      useUIStore.getState().setOsActive(false)
    }
  }, [bootPhase, shutdownRequested, osActive])

  const handleBootComplete = useCallback(() => {
    useOS5kStore.getState().setBootPhase('desktop')
  }, [])

  const handleConfirmShutdown = () => {
    useOS5kStore.getState().confirmShutdown()
    useUIStore.getState().setOsActive(false)
  }

  if (!osActive) return null

  if (bootPhase === 'booting') {
    return <OS5000kBoot onComplete={handleBootComplete} />
  }

  if (bootPhase !== 'desktop') return null

  return (
    <div className="fixed inset-0" style={{ zIndex: 40, background: '#000' }}>
      <OS5000kDesktop />

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

      <OS5000kNativePlayer />
      <OS5000kTaskbar />

      {/* Win98-style shutdown confirmation dialog */}
      {shutdownRequested && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 10000, background: 'rgba(0,0,0,0.3)' }}
        >
          <div style={{
            background: '#c0c0c0',
            border: '2px solid',
            borderTopColor: '#dfdfdf',
            borderLeftColor: '#dfdfdf',
            borderBottomColor: '#808080',
            borderRightColor: '#808080',
            boxShadow: 'inset 1px 1px 0 #ffffff, inset -1px -1px 0 #404040, 4px 4px 0 #000',
            minWidth: 280,
            fontFamily: 'monospace',
          }}>
            {/* Title bar */}
            <div style={{
              background: 'linear-gradient(180deg, #000080 0%, #1084d0 100%)',
              color: '#fff',
              padding: '2px 4px',
              fontSize: 11,
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              userSelect: 'none',
            }}>
              <span>💻</span>
              <span>Shut Down OS5000k</span>
            </div>
            {/* Body */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 12, color: '#000', lineHeight: 1.4 }}>
                Are you sure you want to shut down OS5000k?
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                {(['Yes', 'No'] as const).map((label) => (
                  <button
                    key={label}
                    onClick={label === 'Yes' ? handleConfirmShutdown : () => useOS5kStore.getState().cancelShutdown()}
                    style={{
                      background: '#c0c0c0',
                      border: '2px solid',
                      borderTopColor: '#dfdfdf',
                      borderLeftColor: '#dfdfdf',
                      borderBottomColor: '#808080',
                      borderRightColor: '#808080',
                      boxShadow: 'inset 1px 1px 0 #ffffff, inset -1px -1px 0 #404040',
                      padding: '3px 20px',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: '#000',
                      minWidth: 75,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
