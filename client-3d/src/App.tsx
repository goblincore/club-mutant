import { useEffect, useRef } from 'react'
import { Routes, Route } from 'react-router-dom'
import { getNetwork } from './network/NetworkManager'
import { useGameStore } from './stores/gameStore'
import { useUIStore } from './stores/uiStore'
import { useAuthStore } from './stores/authStore'
import { usePlaylistStore } from './stores/playlistStore'
import { useDreamStore } from './dream/dreamStore'
import { AuthScreen } from './ui/AuthScreen'
import { ProfileBadge } from './ui/ProfileBadge'
import { NotificationBell } from './ui/NotificationBell'
import { FriendsSidebar } from './ui/FriendsSidebar'
import { UserProfilePage } from './ui/UserProfilePage'
import { PlayerContextMenu } from './ui/PlayerContextMenu'
import { useBoothStore } from './stores/boothStore'
import { useMusicStore } from './stores/musicStore'
import { GameScene } from './scene/GameScene'
import { ChatInput } from './ui/ChatInput'
import { DjQueuePanel } from './ui/DjQueuePanel'
import { RightPanel } from './ui/RightPanel'
import { LeaveRoomPrompt } from './ui/LeaveRoomPrompt'
import { LobbyScreen } from './ui/LobbyScreen'
import { NowPlaying } from './ui/NowPlaying'
import { IframeVideoBackground } from './ui/IframeVideoBackground'
import { BoothPrompt } from './ui/BoothPrompt'
import { ToastContainer } from './ui/ToastContainer'
import { DisconnectedOverlay } from './ui/DisconnectedOverlay'
import { ComputerBrowser } from './ui/ComputerBrowser'
import { MagazineReader } from './ui/MagazineReader'
import { SleepPrompt } from './ui/SleepPrompt'
import { WakePrompt } from './ui/WakePrompt'
import { DreamIframe } from './ui/DreamIframe'

const PLAYLIST_WIDTH = 360
const RIGHT_PANEL_WIDTH = 340
const RIGHT_ICONS_WIDTH = 64

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
    useUIStore.getState().setDjQueueOpen(false)
  }

  return (
    <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2">
      <button
        onClick={() => useUIStore.getState().setDjQueueMinimized(false)}
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

function MainApp() {
  // Load playlists from Nakama on first authenticated render
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const playlistSyncTriggered = useRef(false)
  useEffect(() => {
    if (isAuthenticated && !playlistSyncTriggered.current) {
      playlistSyncTriggered.current = true
      usePlaylistStore.getState().loadFromServer()
    }
  }, [isAuthenticated])

  const connectionStatus = useGameStore((s) => s.connectionStatus)
  const mySessionId = useGameStore((s) => s.mySessionId)
  const playlistOpen = useUIStore((s) => s.djQueueOpen)
  const playlistMinimized = useUIStore((s) => s.djQueueMinimized)
  const isAtBooth = useBoothStore((s) => s.isConnected)
  const musicMode = useGameStore((s) => s.musicMode)
  const isJukeboxMode = musicMode === 'jukebox' || musicMode === 'personal'

  const muted = useUIStore((s) => s.muted)
  const videoBackgroundEnabled = useBoothStore((s) => s.videoBackgroundEnabled)
  const videoBgMode = useBoothStore((s) => s.videoBgMode)
  const streamIsPlaying = useMusicStore((s) => s.stream.isPlaying)
  const streamCurrentLink = useMusicStore((s) => s.stream.currentLink)
  const currentDjSessionId = useBoothStore((s) => s.currentDjSessionId)

  const rightPanelOpen = useUIStore((s) => s.rightPanelOpen)

  const showIframe =
    videoBackgroundEnabled && videoBgMode === 'iframe' && streamIsPlaying && !!streamCurrentLink

  // Right sidebar pushes the canvas when open
  const rightInset = rightPanelOpen ? RIGHT_PANEL_WIDTH + RIGHT_ICONS_WIDTH : 0

  // Auth screen — shown before lobby if user hasn't chosen guest or logged in
  const authReady = useAuthStore((s) => s.authReady)

  // Hide social nav in dream mode (must be above early returns to satisfy rules of hooks)
  const isDreaming = useDreamStore((s) => s.isDreaming)

  if (!authReady) {
    return <AuthScreen />
  }

  // Badge/bell: fixed overlay, always on top regardless of lobby or game view
  const socialBar = isAuthenticated && !isDreaming && (
    <div className="fixed top-3 right-3 flex items-center gap-2" style={{ zIndex: 200 }}>
      <NotificationBell />
      <FriendsSidebar />
      <ProfileBadge />
    </div>
  )

  // Never connected yet — show lobby
  const neverConnected = connectionStatus === 'disconnected' && !mySessionId

  if (neverConnected) {
    return (
      <>
        <LobbyScreen />
        {socialBar}
      </>
    )
  }

  // Show full panel only when open AND not minimized
  const showFullPanel = playlistOpen && !playlistMinimized

  // NowPlaying mini bar is only visible in DJ queue mode (jukebox mode hides it)
  const isCurrentDJ = currentDjSessionId === mySessionId
  const nowPlayingVisible = !isJukeboxMode && ((streamIsPlaying && !!streamCurrentLink) || isCurrentDJ)

  // Playlist panel starts below NowPlaying when visible, otherwise full height
  const playlistTop = nowPlayingVisible ? 68 : 0

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Layer 0: Iframe video background (behind canvas) */}
      {showIframe && (
        <div className="absolute top-0 left-0 bottom-0 transition-[right] duration-300 ease-in-out" style={{ zIndex: 0, right: rightInset }}>
          <IframeVideoBackground />
        </div>
      )}

      {/* Layer 1: 3D canvas (transparent when iframe active) */}
      <div className="absolute top-0 left-0 bottom-0 transition-[right] duration-300 ease-in-out" style={{ zIndex: 1, right: rightInset }}>
        <GameScene />
      </div>

      {/* Layer 2+: All UI */}

      {/* Now playing mini bar — always top-left, above playlist panel */}
      <div className="absolute top-3 left-3" style={{ zIndex: 30 }}>
        <NowPlaying />
      </div>

      {/* Profile badge + notification bell — rendered as fixed overlay in socialBar above */}
      {socialBar}

      {/* Minimized booth bar — shown when DJ queue panel is open but minimized (booth only, not jukebox) */}
      {playlistOpen && playlistMinimized && isAtBooth && !isJukeboxMode && (
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
          <DjQueuePanel />
        </div>
      )}

      {/* Chat input — center bottom */}
      <ChatInput />

      {/* Right navigation panel (tabs & icons) */}
      <RightPanel />

      {/* Leave room prompt modal */}
      <LeaveRoomPrompt />

      {/* Toast notifications */}
      <ToastContainer />

      {/* Booth prompt popup */}
      <BoothPrompt />

      {/* Computer desk mini browser */}
      <ComputerBrowser />

      {/* Magazine rack reader */}
      <MagazineReader />

      {/* Dream mode iframe (Phaser app) */}
      <DreamIframe />

      {/* Sleep prompt (dream mode entry) */}
      <SleepPrompt />

      {/* Wake prompt (dream mode exit) */}
      <WakePrompt />

      {/* Reconnection / disconnection overlay */}
      <DisconnectedOverlay />

      {/* In-game player context menu */}
      <PlayerContextMenu />
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/user/:username" element={<UserProfilePage />} />
      <Route path="*" element={<MainApp />} />
    </Routes>
  )
}
