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
import { BoothPrompt } from './ui/BoothPrompt'

const CHAT_WIDTH = 340
const PLAYLIST_WIDTH = 360

function PsxToggle() {
  const psxEnabled = useUIStore((s) => s.psxEnabled)

  return (
    <button
      onClick={useUIStore.getState().togglePsx}
      className={`px-3 py-1.5 text-[10px] font-mono rounded border transition-colors ${
        psxEnabled
          ? 'bg-purple-500/30 border-purple-500/50 text-purple-200 hover:bg-purple-500/50'
          : 'bg-black/60 border-white/10 text-white/60 hover:text-white hover:border-white/30'
      }`}
    >
      VHS {psxEnabled ? 'on' : 'off'}
    </button>
  )
}

function MinimizedBoothBar() {
  const isInQueue = useBoothStore((s) => s.isInQueue)
  const isCurrentDJ =
    useBoothStore((s) => s.currentDjSessionId) === useGameStore((s) => s.mySessionId)
  const djQueue = useBoothStore((s) => s.djQueue)
  const mySessionId = useGameStore((s) => s.mySessionId)
  const myQueuePos = djQueue.findIndex((e) => e.sessionId === mySessionId) + 1

  return (
    <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2">
      <span className="text-[11px] font-mono text-white/70">dj booth</span>

      {isInQueue && (
        <span className="text-[9px] font-mono text-green-400">
          {isCurrentDJ ? '● dj' : `● ${myQueuePos}/${djQueue.length}`}
        </span>
      )}

      <button
        onClick={() => useUIStore.getState().setPlaylistMinimized(false)}
        className="text-[9px] font-mono px-2 py-0.5 bg-purple-500/20 border border-purple-500/30 rounded text-purple-300 hover:bg-purple-500/30 transition-colors"
      >
        expand
      </button>

      <button
        onClick={() => {
          const { getNetwork } = require('./network/NetworkManager')
          getNetwork().leaveDJQueue()
          getNetwork().disconnectFromBooth()
          useUIStore.getState().setPlaylistOpen(false)
        }}
        className="text-[9px] font-mono px-2 py-0.5 bg-red-500/15 border border-red-500/30 rounded text-red-400 hover:bg-red-500/30 transition-colors"
      >
        leave
      </button>
    </div>
  )
}

export function App() {
  const connected = useGameStore((s) => s.connected)
  const chatOpen = useUIStore((s) => s.chatOpen)
  const playlistOpen = useUIStore((s) => s.playlistOpen)
  const playlistMinimized = useUIStore((s) => s.playlistMinimized)
  const isAtBooth = useBoothStore((s) => s.isConnected)

  const videoBackgroundEnabled = useBoothStore((s) => s.videoBackgroundEnabled)
  const videoBgMode = useBoothStore((s) => s.videoBgMode)
  const stream = useMusicStore((s) => s.stream)

  const showIframe =
    videoBackgroundEnabled && videoBgMode === 'iframe' && stream.isPlaying && !!stream.currentLink

  if (!connected) {
    return <LobbyScreen />
  }

  // Show full panel only when open AND not minimized
  const showFullPanel = playlistOpen && !playlistMinimized

  // Mini bar left offset: push right when full playlist panel is visible
  const miniBarLeft = showFullPanel ? PLAYLIST_WIDTH + 12 : 12

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

      {/* Now playing mini bar — shifts right when full playlist panel is visible */}
      <div className="absolute top-3" style={{ left: miniBarLeft, zIndex: 20 }}>
        <NowPlaying />
      </div>

      {/* Minimized booth bar — shown when panel is open but minimized */}
      {playlistOpen && playlistMinimized && isAtBooth && (
        <div className="absolute top-14" style={{ left: 12, zIndex: 20 }}>
          <MinimizedBoothBar />
        </div>
      )}

      {/* Playlist panel — left side, full height */}
      {showFullPanel && (
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

        <PsxToggle />
      </div>

      {/* Booth prompt popup */}
      <BoothPrompt />
    </div>
  )
}
