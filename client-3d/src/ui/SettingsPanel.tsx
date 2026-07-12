import { useSettingsStore } from '../stores/settingsStore'
import { useGameStore } from '../stores/gameStore'
import { useAuthStore } from '../stores/authStore'
import { getNetwork, getOrCreatePlayerId } from '../network/NetworkManager'

type NpcDjMode = 'off' | 'fallback' | 'rotation'

// Mirrors the create-form choices (CreateRoomForm.tsx).
const NPC_DJ_CHOICES: Array<{ value: NpcDjMode; label: string; hint: string }> = [
  { value: 'off', label: 'off', hint: 'humans only' },
  { value: 'fallback', label: 'fill-in', hint: 'plays when booth is empty' },
  { value: 'rotation', label: 'resident', hint: 'always in the queue' },
]

/** Owner-only live NPC DJ toggle — custom round-robin (djqueue) rooms only. */
function RoomOptionsSection() {
  const roomType = useGameStore((s) => s.roomType)
  const musicMode = useGameStore((s) => s.musicMode)
  const npcDjMode = useGameStore((s) => s.npcDjMode)
  const creatorPlayerId = useGameStore((s) => s.roomCreatorPlayerId)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const nakamaUserId = useAuthStore((s) => s.userId)

  // Server-side playerId: Nakama uid when authenticated, persistent guest id otherwise.
  const myPlayerId = isAuthenticated && nakamaUserId ? nakamaUserId : getOrCreatePlayerId()
  const isOwner = !!creatorPlayerId && creatorPlayerId === myPlayerId

  if (roomType !== 'custom' || musicMode !== 'djqueue' || !isOwner) return null

  return (
    <div>
      <h3 className="text-white/80 text-[11px] uppercase tracking-wider mb-2 border-b border-white/10 pb-1 mt-4">Room Options</h3>
      <div className="flex flex-col gap-2">
        <div className="text-[12px] text-white/60 mb-1">NPC DJ</div>
        <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
          {NPC_DJ_CHOICES.map((choice) => (
            <button
              key={choice.value}
              onClick={() => getNetwork().setNpcDjMode(choice.value)}
              title={choice.hint}
              className={`flex-1 py-1.5 text-[12px] font-mono rounded transition-colors ${
                npcDjMode === choice.value
                  ? 'bg-purple-500/30 text-purple-300 shadow-sm'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <p className="text-white/25 text-[10px]">
          {NPC_DJ_CHOICES.find((c) => c.value === npcDjMode)?.hint}
        </p>
      </div>
    </div>
  )
}

export function SettingsPanel() {
  const muted = useSettingsStore((s) => s.muted)
  const toggleMuted = useSettingsStore((s) => s.toggleMuted)
  const renderScale = useSettingsStore((s) => s.renderScale)

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
                onClick={() => useSettingsStore.setState({ renderScale: scale })}
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
      <RoomOptionsSection />
    </div>
  )
}
