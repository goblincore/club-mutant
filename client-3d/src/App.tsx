import { getNetwork } from './network/NetworkManager'
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
import { ToastContainer } from './ui/ToastContainer'
import { DisconnectedOverlay } from './ui/DisconnectedOverlay'

const PLAYLIST_WIDTH = 360

function MinimizedBoothBar() {
  const isInQueue = useBoothStore((s) => s.isInQueue)
  const isCurrentDJ =
    useBoothStore((s) => s.currentDjSessionId) === useGameStore((s) => s.mySessionId)
  const djQueue = useBoothStore((s) => s.djQueue)
  const mySessionId = useGameStore((s) => s.mySessionId)
  const myQueuePos = djQueue.findIndex((e) => e.sessionId === mySessionId) + 1

  const handleLeave = () => {
    getNetwork().disconnectFromBooth()
    getNetwork().leaveDJQueue()
    useUIStore.getState().setPlaylistOpen(false)
  }

  return (
    <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2">
      <button
        onClick={() => useUIStore.getState().setPlaylistMinimized(false)}
        className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition-colors rounded hover:bg-white/10 flex-shrink-0"
        title="Expand panel"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>

      <span className="text-[13px] font-mono text-green-400 flex-1">
        {isCurrentDJ
          ? '● you are the dj'
          : isInQueue
            ? `● queue ${myQueuePos}/${djQueue.length}`
            : '● booth'}
      </span>

      <button
        onClick={handleLeave}
        className="flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 bg-red-500/15 border border-red-500/30 rounded text-red-400 hover:bg-red-500/30 transition-colors flex-shrink-0"
      >
        leave
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  )
}

export function App() {
  const connectionStatus = useGameStore((s) => s.connectionStatus)
  const mySessionId = useGameStore((s) => s.mySessionId)
  const playlistOpen = useUIStore((s) => s.playlistOpen)
  const playlistMinimized = useUIStore((s) => s.playlistMinimized)
  const isAtBooth = useBoothStore((s) => s.isConnected)

  const muted = useUIStore((s) => s.muted)
  const videoBackgroundEnabled = useBoothStore((s) => s.videoBackgroundEnabled)
  const videoBgMode = useBoothStore((s) => s.videoBgMode)
  const streamIsPlaying = useMusicStore((s) => s.stream.isPlaying)
  const streamCurrentLink = useMusicStore((s) => s.stream.currentLink)
  const currentDjSessionId = useBoothStore((s) => s.currentDjSessionId)

  const showIframe =
    videoBackgroundEnabled && videoBgMode === 'iframe' && streamIsPlaying && !!streamCurrentLink

  // Never connected yet — show lobby
  const neverConnected = connectionStatus === 'disconnected' && !mySessionId

  if (neverConnected) {
    return <LobbyScreen />
  }

  // Show full panel only when open AND not minimized
  const showFullPanel = playlistOpen && !playlistMinimized

  // NowPlaying is visible when something is playing OR the current user is the DJ
  const isCurrentDJ = currentDjSessionId === mySessionId
  const nowPlayingVisible = (streamIsPlaying && !!streamCurrentLink) || isCurrentDJ

  // Playlist panel starts below NowPlaying when visible, otherwise full height
  const playlistTop = nowPlayingVisible ? 68 : 0

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

      {/* Now playing mini bar — always top-left, above playlist panel */}
      <div className="absolute top-3 left-3" style={{ zIndex: 30 }}>
        <NowPlaying />
      </div>

      {/* Minimized booth bar — shown when panel is open but minimized */}
      {playlistOpen && playlistMinimized && isAtBooth && (
        <div className="absolute top-14" style={{ left: 12, zIndex: 20 }}>
          <MinimizedBoothBar />
        </div>
      )}

      {/* Playlist panel — left side, below NowPlaying bar */}
      {showFullPanel && (
        <div
          className="absolute left-0 bottom-0 bg-black/[0.75] backdrop-blur-md border-r border-white/[0.15] flex flex-col"
          style={{ top: playlistTop, width: PLAYLIST_WIDTH, zIndex: 20 }}
        >
          <PlaylistPanel />
        </div>
      )}

      {/* Chat panel — always visible, self-manages expand/collapse */}
      <ChatPanel />

      {/* Bottom toolbar */}
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2"
        style={{ zIndex: 20 }}
      >
        <button
          onClick={useUIStore.getState().togglePlaylist}
          className="px-3 py-1.5 text-[12px] font-mono bg-black/60 border border-white/10 rounded text-white/70 hover:text-white hover:border-white/30 transition-colors"
        >
          {playlistOpen ? 'hide playlist' : 'playlist'}
        </button>
      </div>

      {/* Mute toggle — lower left */}
      <button
        onClick={useUIStore.getState().toggleMuted}
        className={`absolute bottom-3 left-3 w-9 h-9 flex items-center justify-center rounded-lg border transition-colors ${
          muted
            ? 'bg-red-500/20 border-red-500/30 text-red-400'
            : 'bg-black/60 border-white/10 text-white/50 hover:text-white hover:border-white/30'
        }`}
        style={{ zIndex: 20 }}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </button>

      {/* Toast notifications */}
      <ToastContainer />

      {/* Booth prompt popup */}
      <BoothPrompt />

      {/* Reconnection / disconnection overlay */}
      <DisconnectedOverlay />
    </div>
  )
}
