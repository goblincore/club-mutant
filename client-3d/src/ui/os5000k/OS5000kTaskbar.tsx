import { useEffect, useState } from 'react'
import { useOS5kStore } from '../../stores/os5000kStore'
import { useUIStore } from '../../stores/uiStore'

export function OS5000kTaskbar() {
  const windows = useOS5kStore((s) => s.windows)
  const windowOrder = useOS5kStore((s) => s.windowOrder)
  const [time, setTime] = useState('')

  useEffect(() => {
    const update = () => {
      const d = new Date()
      setTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    }
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [])

  const focusedId = windowOrder.length > 0 ? windowOrder[windowOrder.length - 1] : null

  const handleClose = () => {
    useOS5kStore.getState().closeAllWindows()
    useOS5kStore.getState().setBootPhase('off')
    useOS5kStore.getState().setActiveVideo(null)
    useUIStore.getState().setOsActive(false)
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex items-center gap-1 px-2 select-none"
      style={{
        height: 36,
        background: 'linear-gradient(180deg, #3a3a4a 0%, #2a2a3a 100%)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        zIndex: 9999,
      }}
    >
      {/* Power button */}
      <button
        onClick={handleClose}
        className="w-7 h-7 flex items-center justify-center rounded text-red-400/70 hover:text-red-400 hover:bg-white/10 transition-colors"
        title="Shut down OS5000k"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
          <line x1="12" y1="2" x2="12" y2="12"/>
        </svg>
      </button>

      <div className="w-px h-5 bg-white/10 mx-1" />

      {/* Window buttons */}
      <div className="flex-1 flex items-center gap-1 overflow-x-auto">
        {Array.from(windows.values()).map((win) => (
          <button
            key={win.id}
            onClick={() => {
              if (win.minimized) {
                useOS5kStore.getState().restoreWindow(win.id)
              }
              useOS5kStore.getState().focusWindow(win.id)
            }}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono transition-colors truncate max-w-[160px] ${
              win.id === focusedId && !win.minimized
                ? 'bg-white/15 text-white'
                : 'text-white/50 hover:bg-white/10 hover:text-white/70'
            } ${win.minimized ? 'opacity-50' : ''}`}
          >
            <span className="text-sm">{win.icon}</span>
            <span className="truncate">{win.title}</span>
          </button>
        ))}
      </div>

      {/* Clock */}
      <span className="text-[11px] font-mono text-white/40 px-2">{time}</span>
    </div>
  )
}
