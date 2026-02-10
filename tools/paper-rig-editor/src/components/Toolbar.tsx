import { useEditorStore } from '../store'

export function Toolbar() {
  const psxEnabled = useEditorStore((s) => s.psxEnabled)
  const setPsxEnabled = useEditorStore((s) => s.setPsxEnabled)
  const exportManifest = useEditorStore((s) => s.exportManifest)
  const parts = useEditorStore((s) => s.parts)

  const handleExport = () => {
    const json = exportManifest()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')

    a.href = url
    a.download = 'character.json'
    a.click()

    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/10">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-bold text-white/90 font-mono tracking-wider">
          PAPER RIG EDITOR
        </h1>

        <span className="text-[10px] text-white/30 font-mono">
          {parts.length} parts
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* PSX toggle */}
        <button
          className={`px-3 py-1 rounded text-xs font-mono border transition-colors ${
            psxEnabled
              ? 'border-green-400/50 text-green-300 bg-green-400/10'
              : 'border-white/20 text-white/40 hover:border-white/40'
          }`}
          onClick={() => setPsxEnabled(!psxEnabled)}
        >
          psx {psxEnabled ? 'on' : 'off'}
        </button>

        {/* Export */}
        <button
          className="px-3 py-1 rounded text-xs font-mono border border-white/20 text-white/60 hover:border-white/40 hover:text-white/80 transition-colors"
          onClick={handleExport}
          disabled={parts.length === 0}
        >
          export json
        </button>
      </div>
    </div>
  )
}
