import { useUIStore } from '../stores/uiStore'
import { useDreamStore } from '../dream/dreamStore'
import { getNetwork } from '../network/NetworkManager'

export function WakePrompt() {
  const open = useUIStore((s) => s.wakePromptOpen)

  if (!open) return null

  const handleConfirm = () => {
    useUIStore.getState().setWakePromptOpen(false)

    // Tell server we're waking up
    getNetwork().sendDreamWake()

    // Exit dream on client
    useDreamStore.getState().exitDream()
  }

  const handleCancel = () => {
    useUIStore.getState().setWakePromptOpen(false)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 70 }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />

      {/* Prompt box */}
      <div className="relative bg-black/80 backdrop-blur-md border border-white/20 rounded-xl px-6 py-5 max-w-[320px] text-center">
        <div className="text-[13px] font-mono text-white mb-4">Pinch your cheek?</div>

        <div className="text-[10px] font-mono text-white/40 mb-5">
          Wake up and return to the real world...
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={handleCancel}
            className="px-4 py-1.5 text-[11px] font-mono bg-white/10 border border-white/20 rounded text-white/60 hover:text-white hover:border-white/40 transition-colors"
          >
            keep dreaming
          </button>

          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 text-[11px] font-mono bg-amber-500/30 border border-amber-500/50 rounded text-amber-200 hover:bg-amber-500/50 transition-colors"
          >
            wake up
          </button>
        </div>
      </div>
    </div>
  )
}
