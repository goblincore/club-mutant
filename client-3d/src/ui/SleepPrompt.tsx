import { useUIStore } from '../stores/uiStore'
import { useGameStore } from '../stores/gameStore'
import { useDreamStore } from '../dream/dreamStore'
import { getNetwork } from '../network/NetworkManager'

export function SleepPrompt() {
  const open = useUIStore((s) => s.sleepPromptOpen)

  if (!open) return null

  const handleConfirm = () => {
    useUIStore.getState().setSleepPromptOpen(false)

    // Tell server we're dreaming
    getNetwork().sendDreamSleep()

    // Enter dream on client
    useDreamStore.getState().enterDream()
  }

  const handleCancel = () => {
    useUIStore.getState().setSleepPromptOpen(false)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 30 }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />

      {/* Prompt box */}
      <div className="relative bg-black/80 backdrop-blur-md border border-white/20 rounded-xl px-6 py-5 max-w-[320px] text-center">
        <div className="text-[13px] font-mono text-white mb-4">Go to sleep?</div>

        <div className="text-[10px] font-mono text-white/40 mb-5">
          Close your eyes and drift into the dream world...
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={handleCancel}
            className="px-4 py-1.5 text-[11px] font-mono bg-white/10 border border-white/20 rounded text-white/60 hover:text-white hover:border-white/40 transition-colors"
          >
            stay awake
          </button>

          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 text-[11px] font-mono bg-indigo-500/30 border border-indigo-500/50 rounded text-indigo-200 hover:bg-indigo-500/50 transition-colors"
          >
            sleep
          </button>
        </div>
      </div>
    </div>
  )
}
