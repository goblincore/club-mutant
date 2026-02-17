import { useUIStore } from '../stores/uiStore'

const BROWSER_URL = 'https://www.wikipedia.org/'

const DISPLAY_URL = 'wikipedia.org'

export function ComputerBrowser() {
  const open = useUIStore((s) => s.computerIframeOpen)

  if (!open) return null

  const handleClose = () => {
    useUIStore.getState().setComputerIframeOpen(false)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 40 }}>
      {/* Backdrop — does NOT close on click */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Browser window */}
      <div
        className="relative flex flex-col rounded-xl overflow-hidden"
        style={{
          width: 640,
          height: 480,
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

          {/* URL bar */}
          <div className="flex-1 mx-2">
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-mono truncate"
              style={{
                background: '#1a1a1e',
                color: 'rgba(255,255,255,0.5)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.4, flexShrink: 0 }}
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>

              <span className="truncate">{DISPLAY_URL}</span>
            </div>
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

        {/* Iframe content area */}
        <div className="flex-1 bg-white">
          <iframe
            src={BROWSER_URL}
            title="Computer Browser"
            referrerPolicy="no-referrer"
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  )
}
