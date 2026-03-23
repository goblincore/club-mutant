import { useOS5kStore } from '../../stores/os5000kStore'

export function OS5000kNativePlayer() {
  const activeVideo = useOS5kStore((s) => s.activeVideo)

  if (!activeVideo) return null

  const handleClose = () => {
    useOS5kStore.getState().setActiveVideo(null)
  }

  return (
    <div className="absolute inset-x-0 top-0 bottom-36 flex flex-col" style={{ zIndex: 5000 }}>
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-black/90 shrink-0">
        <span className="text-[11px] font-mono text-white/50">Now Playing:</span>
        <span className="text-[12px] font-mono text-white/80 truncate flex-1">{activeVideo.title}</span>
        <button
          onClick={handleClose}
          className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* YouTube embed — rendered at shell level, only 1 iframe deep */}
      <div className="flex-1 bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${activeVideo.videoId}?autoplay=1&rel=0`}
          allow="autoplay; encrypted-media"
          allowFullScreen
          className="w-full h-full border-0"
          title={activeVideo.title}
        />
      </div>
    </div>
  )
}
