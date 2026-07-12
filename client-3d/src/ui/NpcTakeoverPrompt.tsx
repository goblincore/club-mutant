import { create } from 'zustand'
import { NPC_DJ_SESSION_PREFIX } from '@club-mutant/types/Players'
import { useBoothStore } from '../stores/boothStore'
import { useGameStore } from '../stores/gameStore'
import { getNetwork } from '../network/NetworkManager'

interface NpcTakeoverState {
  npcName: string | null // non-null = prompt open
  open: (npcName: string) => void
  close: () => void
}

const useNpcTakeoverStore = create<NpcTakeoverState>((set) => ({
  npcName: null,
  open: (npcName) => set({ npcName }),
  close: () => set({ npcName: null }),
}))

/**
 * Call right before leaving the DJ queue. If the leaver is the last human in
 * the queue and a fallback NPC DJ lives in the room, ask whether the NPC
 * should take the decks back. (The fallback NPC stays out of the queue while
 * humans hold it, so a single-entry queue containing me means it is about to
 * be empty.) Declining puts the NPC on standby; it can be summoned again by
 * clicking it.
 */
export function maybePromptNpcTakeover() {
  const { djQueue } = useBoothStore.getState()
  const { players, mySessionId } = useGameStore.getState()
  if (djQueue.length !== 1 || djQueue[0].sessionId !== mySessionId) return

  for (const [sessionId, player] of players) {
    if (sessionId.startsWith(NPC_DJ_SESSION_PREFIX)) {
      useNpcTakeoverStore.getState().open(player.name)
      return
    }
  }
}

export function NpcTakeoverPrompt() {
  const npcName = useNpcTakeoverStore((s) => s.npcName)

  if (!npcName) return null

  const close = () => useNpcTakeoverStore.getState().close()

  const handleKeepFree = () => {
    getNetwork().setNpcDjStandby(true)
    close()
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 30 }}>
      {/* Backdrop — dismissing counts as "sure" (NPC takes over after grace) */}
      <div className="absolute inset-0 bg-black/40" onClick={close} />

      {/* Prompt box */}
      <div className="relative bg-black/80 backdrop-blur-md border border-white/20 rounded-xl px-6 py-5 max-w-[320px] text-center">
        <div className="text-[13px] font-mono text-white mb-4">
          let {npcName} take the decks?
        </div>

        <div className="text-[10px] font-mono text-white/40 mb-5">
          the booth is empty — {npcName} will start spinning again in a couple
          minutes unless you'd rather keep it free. (click {npcName} anytime to
          call them back.)
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={handleKeepFree}
            className="px-4 py-1.5 text-[11px] font-mono bg-white/10 border border-white/20 rounded text-white/60 hover:text-white hover:border-white/40 transition-colors"
          >
            keep it free
          </button>

          <button
            onClick={close}
            className="px-4 py-1.5 text-[11px] font-mono bg-purple-500/30 border border-purple-500/50 rounded text-purple-200 hover:bg-purple-500/50 transition-colors"
          >
            sure
          </button>
        </div>
      </div>
    </div>
  )
}
