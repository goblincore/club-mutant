import { useUIStore } from '../stores/uiStore'

export function SettingsPanel() {
  const muted = useUIStore((s) => s.muted)
  const toggleMuted = useUIStore((s) => s.toggleMuted)
  const renderScale = useUIStore((s) => s.renderScale)

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 font-mono">
      <div>
        <h3 className="text-white/80 text-[11px] uppercase tracking-wider mb-2 border-b border-white/10 pb-1">Audio</h3>
        <label className="flex items-center gap-2 text-[13px] text-white">
          <input
            type="checkbox"
            checked={muted}
            onChange={toggleMuted}
            className="rounded border-white/20 bg-black text-purple-500 focus:ring-purple-500"
          />
          Mute all sounds
        </label>
      </div>
      <div>
        <h3 className="text-white/80 text-[11px] uppercase tracking-wider mb-2 border-b border-white/10 pb-1 mt-4">Graphics</h3>
        <div className="flex flex-col gap-2">
          <div className="text-[12px] text-white/60 mb-1">Render Resolution</div>
          <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
            {[0.75, 0.5, 0.35].map((scale) => (
              <button
                key={scale}
                onClick={() => useUIStore.setState({ renderScale: scale })}
                className={`flex-1 py-1.5 text-[12px] font-mono rounded transition-colors ${
                  renderScale === scale
                    ? 'bg-purple-500/30 text-purple-300 shadow-sm'
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                {Math.round(scale * 100)}%
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
