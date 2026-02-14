import JSZip from 'jszip'

import { useEditorStore } from '../store'

export function Toolbar() {
  const psxEnabled = useEditorStore((s) => s.psxEnabled)
  const setPsxEnabled = useEditorStore((s) => s.setPsxEnabled)
  const exportManifest = useEditorStore((s) => s.exportManifest)
  const parts = useEditorStore((s) => s.parts)
  const mode = useEditorStore((s) => s.mode)
  const setMode = useEditorStore((s) => s.setMode)
  const characterName = useEditorStore((s) => s.characterName)
  const setCharacterName = useEditorStore((s) => s.setCharacterName)
  const resetAll = useEditorStore((s) => s.resetAll)

  const handleExport = async () => {
    const json = exportManifest()
    const zip = new JSZip()

    zip.file('manifest.json', json)

    // Fetch each part's image blob and add to zip with the original filename
    for (const part of parts) {
      try {
        const response = await fetch(part.textureUrl)
        const blob = await response.blob()

        zip.file(part.originalFilename, blob)
      } catch (err) {
        console.warn(`[export] Failed to fetch image for part "${part.id}":`, err)
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')

    a.href = url
    a.download = `${characterName.trim() || 'character'}.zip`
    a.click()

    URL.revokeObjectURL(url)
  }

  const handleNew = () => {
    const hasParts = parts.length > 0

    if (hasParts && !window.confirm('Start a new character? Current work will be lost.')) {
      return
    }

    resetAll()
  }

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/10">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-bold text-white/90 font-mono tracking-wider">
          PAPER RIG EDITOR
        </h1>

        <button
          className="px-2 py-0.5 rounded text-[10px] font-mono border border-white/20 text-white/50 hover:border-white/40 hover:text-white/80 transition-colors"
          onClick={handleNew}
        >
          new
        </button>

        <input
          type="text"
          value={characterName}
          onChange={(e) => setCharacterName(e.target.value)}
          placeholder="character name"
          className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xs font-mono text-white/80 placeholder:text-white/25 focus:border-white/30 focus:outline-none w-36"
        />

        <span className="text-[10px] text-white/30 font-mono">{parts.length} parts</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Mode toggle */}
        <div className="flex rounded border border-white/20 overflow-hidden mr-2">
          <button
            className={`px-3 py-1 text-xs font-mono transition-colors ${
              mode === 'rig' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
            }`}
            onClick={() => setMode('rig')}
          >
            rig
          </button>

          <button
            className={`px-3 py-1 text-xs font-mono transition-colors border-l border-white/20 ${
              mode === 'slicer' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
            }`}
            onClick={() => setMode('slicer')}
          >
            slicer
          </button>
        </div>

        {/* PSX toggle (rig mode only) */}
        {mode === 'rig' && (
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
        )}

        {/* Export (rig mode only) */}
        {mode === 'rig' && (
          <button
            className="px-3 py-1 rounded text-xs font-mono border border-white/20 text-white/60 hover:border-white/40 hover:text-white/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleExport}
            disabled={parts.length === 0}
          >
            export zip
          </button>
        )}
      </div>
    </div>
  )
}
