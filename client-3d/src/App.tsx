import { useGameStore } from './stores/gameStore'
import { useUIStore } from './stores/uiStore'
import { GameScene } from './scene/GameScene'
import { ChatPanel } from './ui/ChatPanel'
import { LobbyScreen } from './ui/LobbyScreen'

export function App() {
  const connected = useGameStore((s) => s.connected)
  const chatOpen = useUIStore((s) => s.chatOpen)

  if (!connected) {
    return <LobbyScreen />
  }

  return (
    <div className="relative w-full h-full">
      {/* 3D scene fills the whole screen */}
      <GameScene />

      {/* Chat overlay — bottom-left */}
      {chatOpen && (
        <div className="absolute bottom-0 left-0 w-80 h-64 bg-black/60 backdrop-blur-sm border-t border-r border-white/10 rounded-tr-lg overflow-hidden">
          <ChatPanel />
        </div>
      )}

      {/* Minibar — top-right */}
      <div className="absolute top-3 right-3 flex gap-2">
        <button
          onClick={useUIStore.getState().toggleChat}
          className="px-3 py-1.5 text-[10px] font-mono bg-black/60 border border-white/10 rounded text-white/60 hover:text-white hover:border-white/30 transition-colors"
        >
          {chatOpen ? 'hide chat' : 'show chat'}
        </button>

        <button
          onClick={useUIStore.getState().togglePsx}
          className="px-3 py-1.5 text-[10px] font-mono bg-black/60 border border-white/10 rounded text-white/60 hover:text-white hover:border-white/30 transition-colors"
        >
          PSX
        </button>
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-3 right-3 text-[9px] font-mono text-white/20">
        WASD to move · Enter to chat
      </div>
    </div>
  )
}
