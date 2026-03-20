import { useEffect, useRef } from 'react'
import { useUIStore } from '../stores/uiStore'
import { OS5000kBridgeHost } from './os5000k/OS5000kBridgeHost'

export function ComputerBrowser() {
  const open = useUIStore((s) => s.computerIframeOpen)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const bridgeRef = useRef<OS5000kBridgeHost | null>(null)

  useEffect(() => {
    if (!open) return

    const bridge = new OS5000kBridgeHost()
    bridgeRef.current = bridge

    return () => {
      bridge.destroy()
      bridgeRef.current = null
    }
  }, [open])

  const handleIframeLoad = () => {
    if (iframeRef.current && bridgeRef.current) {
      bridgeRef.current.setIframe(iframeRef.current)
      bridgeRef.current.sendConnected()
    }
  }

  if (!open) return null

  const handleClose = () => {
    useUIStore.getState().setComputerIframeOpen(false)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 40 }}>
      {/* Backdrop — does NOT close on click */}
      <div className="absolute inset-0 bg-black/50" />

      {/* OS window */}
      <div
        className="relative flex flex-col rounded-xl overflow-hidden"
        style={{
          width: 800,
          height: 600,
          boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center gap-2 px-3 py-2 select-none"
          style={{ background: '#2a2a2e' }}
        >
          {/* Traffic light dots */}
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ background: '#ff5f57', border: '1px solid #e0443e' }}
            />
            <div
              className="w-3 h-3 rounded-full"
              style={{ background: '#febc2e', border: '1px solid #d4a022' }}
            />
            <div
              className="w-3 h-3 rounded-full"
              style={{ background: '#28c840', border: '1px solid #1aab29' }}
            />
          </div>

          {/* Title */}
          <div className="flex-1 text-center text-[11px] font-mono text-white/40 select-none">
            OS5000k
          </div>

          {/* Close button */}
          <button
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* OS5000k content */}
        <div className="flex-1 bg-black">
          <iframe
            ref={iframeRef}
            src="/os5000k/index.html"
            title="OS5000k"
            sandbox="allow-scripts allow-same-origin allow-popups"
            className="w-full h-full border-0"
            onLoad={handleIframeLoad}
          />
        </div>
      </div>
    </div>
  )
}
