import { useUIStore } from '../stores/uiStore'
import { useGameStore, setPlayerPosition } from '../stores/gameStore'
import { getNetwork } from '../network/NetworkManager'
import { BOOTH_WORLD_Z, getDJSlotWorldX } from '../scene/Room'

const WORLD_SCALE = 0.01

// Server-Y for behind the booth (0.8 world units behind)
const BEHIND_BOOTH_SERVER_Y = -(BOOTH_WORLD_Z - 0.8) / WORLD_SCALE

export function BoothPrompt() {
  const open = useUIStore((s) => s.boothPromptOpen)

  if (!open) return null

  const handleConfirm = () => {
    const slotIndex = useUIStore.getState().boothPromptSlotIndex

    useUIStore.getState().setBoothPromptOpen(false)

    // Connect to booth + join queue with chosen slot
    getNetwork().connectToBooth(0)
    getNetwork().joinDJQueue(slotIndex)
    useUIStore.getState().setPlaylistOpen(true)

    // Teleport to the slot position the player clicked
    const offsetX = getDJSlotWorldX(slotIndex)
    const serverX = offsetX / WORLD_SCALE

    // Move player behind the booth
    const state = useGameStore.getState()

    state.setLocalPosition(serverX, BEHIND_BOOTH_SERVER_Y)

    if (state.mySessionId) {
      setPlayerPosition(state.mySessionId, serverX, BEHIND_BOOTH_SERVER_Y)
    }

    getNetwork().sendPosition(serverX, BEHIND_BOOTH_SERVER_Y, 'idle')
  }

  const handleCancel = () => {
    useUIStore.getState().setBoothPromptOpen(false)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 30 }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />

      {/* Prompt box */}
      <div className="relative bg-black/80 backdrop-blur-md border border-white/20 rounded-xl px-6 py-5 max-w-[320px] text-center">
        <div className="text-[13px] font-mono text-white mb-4">Join the DJ queue?</div>

        <div className="text-[10px] font-mono text-white/40 mb-5">
          You'll be moved behind the booth and can start adding tracks to your playlist.
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={handleCancel}
            className="px-4 py-1.5 text-[11px] font-mono bg-white/10 border border-white/20 rounded text-white/60 hover:text-white hover:border-white/40 transition-colors"
          >
            cancel
          </button>

          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 text-[11px] font-mono bg-purple-500/30 border border-purple-500/50 rounded text-purple-200 hover:bg-purple-500/50 transition-colors"
          >
            join queue
          </button>
        </div>
      </div>
    </div>
  )
}
