import { useGameStore } from './stores/gameStore'
import { useUIStore } from './stores/uiStore'
import { useBoothStore } from './stores/boothStore'
import { useMusicStore } from './stores/musicStore'
import { GameScene } from './scene/GameScene'
import { ChatPanel } from './ui/ChatPanel'
import { PlaylistPanel } from './ui/PlaylistPanel'
import { LobbyScreen } from './ui/LobbyScreen'
import { NowPlaying } from './ui/NowPlaying'
import { IframeVideoBackground } from './ui/IframeVideoBackground'

const CHAT_WIDTH = 340
const PLAYLIST_WIDTH = 360

export function App() {
  const connected = useGameStore((s) => s.connected)
  const chatOpen = useUIStore((s) => s.chatOpen)
  const playlistOpen = useUIStore((s) => s.playlistOpen)

  const videoBackgroundEnabled = useBoothStore((s) => s.videoBackgroundEnabled)
  const videoBgMode = useBoothStore((s) => s.videoBgMode)
  const stream = useMusicStore((s) => s.stream)

  const showIframe =
    videoBackgroundEnabled && videoBgMode === 'iframe' && stream.isPlaying && !!stream.currentLink

  if (!connected) {
    return <LobbyScreen />
  }

  // Mini bar left offset: push right when playlist panel is open
  const miniBarLeft = playlistOpen ? PLAYLIST_WIDTH + 12 : 12

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Layer 0: Iframe video background (behind canvas) */}
      {showIframe && (
        <div className="absolute inset-0" style={{ zIndex: 0 }}>
          <IframeVideoBackground />
        </div>
      )}

      {/* Layer 1: 3D canvas (transparent when iframe active) */}
      <div className="absolute inset-0" style={{ zIndex: 1 }}>
        <GameScene />
      </div>

      {/* Layer 2+: All UI */}

      {/* Now playing mini bar — shifts right when playlist is open */}
      <div className="absolute top-3" style={{ left: miniBarLeft, zIndex: 20 }}>
        <NowPlaying />
      </div>

      {/* Playlist panel — left side */}
      {playlistOpen && (
        <div
          className="absolute top-0 left-0 bottom-0 bg-black/[0.35] backdrop-blur-md border-r border-white/[0.25] flex flex-col"
          style={{ width: PLAYLIST_WIDTH, zIndex: 20 }}
        >
          <PlaylistPanel />
        </div>
      )}

      {/* Chat panel — right side, full height, matching 2D client style */}
      {chatOpen && (
        <div
          className="absolute top-0 right-0 bottom-0 bg-black/[0.35] backdrop-blur-md border-l border-white/[0.25] flex flex-col"
          style={{ width: CHAT_WIDTH, zIndex: 20 }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.15]">
            <span className="text-[13px] font-mono text-white/80">chat</span>

            <button
              onClick={useUIStore.getState().toggleChat}
              className="text-[10px] font-mono text-white/40 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          <ChatPanel />
        </div>
      )}

      {/* Bottom toolbar */}
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2"
        style={{ zIndex: 20 }}
      >
        <button
          onClick={useUIStore.getState().togglePlaylist}
          className="px-3 py-1.5 text-[10px] font-mono bg-black/60 border border-white/10 rounded text-white/60 hover:text-white hover:border-white/30 transition-colors"
        >
          {playlistOpen ? 'hide playlist' : 'playlist'}
        </button>

        <button
          onClick={useUIStore.getState().toggleChat}
          className="px-3 py-1.5 text-[10px] font-mono bg-black/60 border border-white/10 rounded text-white/60 hover:text-white hover:border-white/30 transition-colors"
        >
          {chatOpen ? 'hide chat' : 'chat'}
        </button>

        <button
          onClick={useUIStore.getState().togglePsx}
          className="px-3 py-1.5 text-[10px] font-mono bg-black/60 border border-white/10 rounded text-white/60 hover:text-white hover:border-white/30 transition-colors"
        >
          PSX
        </button>
      </div>

      {/* Controls hint */}
      <div
        className="absolute bottom-3 right-3 text-[9px] font-mono text-white/20"
        style={{ zIndex: 20 }}
      >
        WASD or click · R near booth · Enter to chat
      </div>
    </div>
  )
}
