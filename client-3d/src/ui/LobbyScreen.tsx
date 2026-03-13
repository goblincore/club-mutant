import { useState, useEffect, useCallback } from 'react'

import { getNetwork } from '../network/NetworkManager'
import { getWearables } from '../network/nakamaClient'
import { useGameStore } from '../stores/gameStore'
import { useAuthStore } from '../stores/authStore'
import { getCharacters, getCharactersSync, type CharacterEntry } from '../character/characterRegistry'
import { WarpCheckBg } from './WarpCheckBg'
import { TurntableCarousel } from './components/TurntableCarousel'
import { CharacterSidePreview } from './CharacterSidePreview'
import { CustomRoomBrowser } from './CustomRoomBrowser'
import { CreateRoomForm } from './CreateRoomForm'

type Screen = 'character-select' | 'room-select'
type RoomSubView = 'choose' | 'browse' | 'create'

export function LobbyScreen() {
  const [characters, setCharacters] = useState<CharacterEntry[]>(() => getCharactersSync())
  const [selectedIndex, setSelectedIndex] = useState(0)
  const nakamaUsername = useAuthStore((s) => s.username)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [name, setName] = useState(nakamaUsername ?? '')
  const [connectingTarget, setConnectingTarget] = useState<'public' | 'myroom' | 'custom' | null>(null)
  const connecting = connectingTarget !== null
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('character-select')
  const [roomSubView, setRoomSubView] = useState<RoomSubView>('choose')

  // Direct room link state
  const pendingRoomId = useGameStore((s) => s.pendingRoomId)
  const [linkPassword, setLinkPassword] = useState('')
  const [showLinkPasswordPrompt, setShowLinkPasswordPrompt] = useState(false)

  const lobbyJoined = useGameStore((s) => s.lobbyJoined)
  // Carousel fade-in: stays invisible until the r3f scene signals readiness
  // (after a few frames, so textures are loaded and rendered)
  const [carouselVisible, setCarouselVisible] = useState(false)

  useEffect(() => {
    getCharacters().then((chars) => {
      setCharacters(chars)
    })
  }, [])

  // Initialize NetworkManager eagerly
  useEffect(() => {
    getNetwork()
  }, [])

  // Pre-load wearables for authenticated users so they're ready before any room join
  useEffect(() => {
    if (!isAuthenticated) return
    getWearables()
      .then((config) => {
        if (config.slots?.length > 0) {
          getNetwork().setWearablesJson(JSON.stringify(config))
        }
      })
      .catch(() => {}) // silently fail — wearables are optional
  }, [isAuthenticated])

  // Warm up the server connection and start lobby join when Screen 2 mounts.
  // The health fetch establishes a live HTTP/2 connection (TLS session reuse),
  // and the lobby join runs in the background so "Custom Rooms" is instant.
  useEffect(() => {
    if (screen !== 'room-select') return
    const net = getNetwork()
    const httpUrl = (import.meta.env.VITE_WS_ENDPOINT || 'ws://localhost:2567').replace(/^ws/, 'http')
    fetch(`${httpUrl}/health`, { mode: 'cors' }).catch(() => {})
    net.ensureLobbyJoined().catch(() => {})
  }, [screen])

  // Detect ?room=ROOM_ID in URL for direct room join links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const roomParam = params.get('room')
    if (roomParam) {
      useGameStore.getState().setPendingRoomId(roomParam)
    }
  }, [])

  // For logged-in users: auto-attempt direct join when a room link is present
  useEffect(() => {
    if (!isAuthenticated || !pendingRoomId || !name.trim() || !selectedChar || connecting) return
    attemptDirectJoin(pendingRoomId, null)
  }, [isAuthenticated, pendingRoomId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Called from inside the r3f Canvas after a few frames have rendered
  const handleCarouselReady = useCallback(() => {
    setCarouselVisible(true)
  }, [])

  const selectedChar = characters[selectedIndex] ?? null

  // Unified character switch handler — updates index + gameStore
  const handleCharacterSwitch = (newIndex: number) => {
    setSelectedIndex(newIndex)
    const char = characters[newIndex]
    if (char) {
      useGameStore.getState().setSelectedCharacterPath(char.path)
    }
  }

  useEffect(() => {
    // Arrow keys for character switching on Screen 1 and Screen 2 choose view
    // Disabled on browse/create because those have text inputs
    if (screen === 'room-select' && roomSubView !== 'choose') return
    if (screen !== 'character-select' && screen !== 'room-select') return

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handleCharacterSwitch((selectedIndex - 1 + characters.length) % characters.length)
      }
      if (e.key === 'ArrowRight') {
        handleCharacterSwitch((selectedIndex + 1) % characters.length)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [characters.length, screen, roomSubView, selectedIndex])

  // Direct room link: attempt to join the pending room
  const attemptDirectJoin = async (roomId: string, password: string | null) => {
    const trimmed = name.trim()
    if (!trimmed || !selectedChar) return

    setConnectingTarget('custom')
    setError(null)

    try {
      await getNetwork().joinCustomById(roomId, password, trimmed, selectedChar.textureId)
      getNetwork().sendReady()
      getNetwork().sendPlayerName(trimmed)
      // Clear URL param so refresh doesn't re-join
      history.replaceState(null, '', window.location.pathname)
      useGameStore.getState().setPendingRoomId(null)
      setShowLinkPasswordPrompt(false)
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      if (msg.includes('password') || msg.includes('403')) {
        // Room is password-protected — show password prompt
        setShowLinkPasswordPrompt(true)
        setError(null)
      } else {
        setError(msg.includes('another tab') ? msg : 'Room not found or no longer available')
        useGameStore.getState().setPendingRoomId(null)
        history.replaceState(null, '', window.location.pathname)
        if (!isAuthenticated) {
          setScreen('room-select')
          setRoomSubView('choose')
        }
      }
    } finally {
      setConnectingTarget(null)
    }
  }

  // Screen 1: "Go!" button — save character + transition to room select (guest flow)
  const handleGo = () => {
    const trimmed = name.trim()
    if (!trimmed || !selectedChar) return
    // Trigger lazy NetworkManager creation if not already created.
    getNetwork()

    if (pendingRoomId) {
      attemptDirectJoin(pendingRoomId, null)
      return
    }

    setScreen('room-select')
    setRoomSubView('choose')
    setError(null)
  }

  // Screen 1 (auth users): Custom Rooms button — go directly to browse
  const handleGoToCustomRooms = async () => {
    if (lobbyJoined) {
      setScreen('room-select')
      setRoomSubView('browse')
      setError(null)
      return
    }
    setConnectingTarget('custom')
    try {
      await getNetwork().ensureLobbyJoined()
      setScreen('room-select')
      setRoomSubView('browse')
      setError(null)
    } catch {
      setError('Failed to load room list')
    } finally {
      setConnectingTarget(null)
    }
  }

  // Screen 2: Join the global public room
  const handleJoinPublic = async () => {
    const trimmed = name.trim()
    if (!trimmed || !selectedChar) return

    setConnectingTarget('public')
    setError(null)

    try {
      await getNetwork().joinPublicRoom(trimmed, selectedChar.textureId)
      getNetwork().sendReady()
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      setError(msg.includes('another tab') ? msg : 'Failed to connect. Is the server running?')
      console.error(err)
    } finally {
      setConnectingTarget(null)
    }
  }

  // Screen 2: Join a personal "My Room"
  const handleJoinMyRoom = async () => {
    const trimmed = name.trim()
    if (!trimmed || !selectedChar) return

    setConnectingTarget('myroom')
    setError(null)

    try {
      await getNetwork().joinMyRoom(trimmed, selectedChar.textureId)
      getNetwork().sendReady()
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      setError(msg.includes('another tab') ? msg : 'Failed to connect. Is the server running?')
      console.error(err)
    } finally {
      setConnectingTarget(null)
    }
  }

  // Called when successfully joined/created a custom room
  const handleCustomRoomJoined = () => {
    if (selectedChar) {
      useGameStore.getState().setSelectedCharacterPath(selectedChar.path)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (screen === 'character-select') handleGo()
      else if (screen === 'room-select' && roomSubView === 'choose') handleJoinPublic()
    }
  }

  const handleBack = () => {
    setScreen('character-select')
    setError(null)
  }

  // Shared button class for lobby action buttons
  const btnClass = `lobby-btn w-full relative overflow-hidden group
                   bg-green-700/40 border-2 border-toxic-green rounded-lg px-4 py-3
                   text-base font-mono font-bold text-white
                   hover:bg-green-600/50 hover:shadow-[0_0_40px_rgba(57,255,20,0.6)]
                   disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-green-700/40
                   transition-all duration-300`

  const btnGlow = (
    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent
                    translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
  )

  const spinner = (
    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
  )

  const cardStyle = {
    backgroundColor: 'rgba(57, 255, 20, 0.45)',
    backdropFilter: 'blur(12px)',
    borderColor: '#39ff14',
    boxShadow: `
      0 0 30px rgba(57, 255, 20, 0.3),
      inset 0 0 20px rgba(57, 255, 20, 0.15)
    `,
  }

  const linkPasswordPrompt = pendingRoomId && (
    <div className="w-full flex flex-col gap-2">
      <p className="text-yellow-300 text-xs font-mono text-center">
        this room requires a password
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={linkPassword}
          onChange={(e) => setLinkPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && linkPassword) attemptDirectJoin(pendingRoomId, linkPassword)
            if (e.key === 'Escape') {
              setShowLinkPasswordPrompt(false)
              useGameStore.getState().setPendingRoomId(null)
              history.replaceState(null, '', window.location.pathname)
            }
          }}
          placeholder="enter room code"
          className="flex-1 bg-black/50 border border-yellow-400/50 rounded-lg px-3 py-2
                     text-sm font-mono text-white placeholder-white/30
                     focus:border-yellow-400 focus:outline-none transition-colors"
          style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
          autoFocus
        />
        <button
          onClick={() => attemptDirectJoin(pendingRoomId, linkPassword)}
          disabled={!linkPassword || connecting}
          className="px-4 py-2 rounded-lg text-sm font-mono font-bold
                     bg-yellow-500/20 border border-yellow-400 text-yellow-300
                     hover:bg-yellow-500/30 disabled:opacity-30 disabled:cursor-not-allowed
                     transition-all"
        >
          {connecting ? '...' : 'join'}
        </button>
      </div>
      <button
        onClick={() => {
          setShowLinkPasswordPrompt(false)
          useGameStore.getState().setPendingRoomId(null)
          history.replaceState(null, '', window.location.pathname)
        }}
        className="text-white/40 hover:text-white text-xs font-mono transition-colors"
      >
        cancel
      </button>
    </div>
  )

  return (
    <div className="relative flex flex-col items-center w-full h-full overflow-hidden">
      <WarpCheckBg />

      {/* ───────── Screen 1: Character Select ───────── */}
      {screen === 'character-select' && (
        <>
          {/* Carousel floating in space */}
          <div className="relative z-10 flex-1 w-full flex items-end justify-center min-h-0">
            <div
              className="w-full h-full"
              style={{
                opacity: carouselVisible ? 1 : 0,
                transition: carouselVisible ? 'opacity 0.5s ease-out' : 'none',
              }}
            >
              <TurntableCarousel
                characters={characters}
                selectedIndex={selectedIndex}
                onSelect={handleCharacterSwitch}
                onReady={handleCarouselReady}
              />
            </div>
          </div>

          {/* Bottom card */}
          {isAuthenticated ? (
            /* ── Logged-in: 3 destination buttons ── */
            <div
              className="relative z-10 mb-6 mt-0 p-6 rounded-xl border-2 shrink-0 lobby-card-enter"
              style={cardStyle}
            >
              <div className="flex flex-col items-center gap-4 w-80">
                {/* Invite link: loading indicator */}
                {pendingRoomId && !showLinkPasswordPrompt && (
                  <p className="text-white/60 text-xs font-mono text-center">
                    {connecting ? (
                      <span className="flex items-center justify-center gap-2">
                        {spinner} joining...
                      </span>
                    ) : 'joining room via invite link...'}
                  </p>
                )}

                {/* Invite link: password prompt */}
                {showLinkPasswordPrompt && linkPasswordPrompt}

                {/* Main buttons — hidden during invite-link flow */}
                {!pendingRoomId && !showLinkPasswordPrompt && (
                  <>
                    <button onClick={handleJoinPublic} disabled={connecting || !selectedChar} className={btnClass}>
                      {btnGlow}
                      <span className="relative z-10 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
                        {connectingTarget === 'public' ? <span className="flex items-center justify-center gap-2">{spinner} connecting...</span> : 'Global Lobby'}
                      </span>
                    </button>

                    <button onClick={handleGoToCustomRooms} disabled={connecting} className={btnClass}>
                      {btnGlow}
                      <span className="relative z-10 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
                        {connectingTarget === 'custom' ? <span className="flex items-center justify-center gap-2">{spinner} connecting...</span> : 'Custom Rooms'}
                      </span>
                    </button>

                    <button onClick={handleJoinMyRoom} disabled={connecting || !selectedChar} className={btnClass}>
                      {btnGlow}
                      <span className="relative z-10 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
                        {connectingTarget === 'myroom' ? <span className="flex items-center justify-center gap-2">{spinner} connecting...</span> : 'My Room'}
                      </span>
                    </button>
                  </>
                )}

                {error && screen === 'character-select' && (
                  <p className="text-sm font-mono font-bold text-center" style={{ color: '#ff0080' }}>
                    {error}
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* ── Guest flow: name input + Go! ── */
            <div
              className="relative z-10 mb-6 mt-0 p-6 rounded-xl border-2 shrink-0 lobby-card-enter"
              style={cardStyle}
            >
              <div className="flex flex-col items-center gap-4 w-80">
                {/* Name input */}
                <div className="w-full relative">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter your name"
                    maxLength={20}
                    className="w-full bg-green-800/50 border-2 border-toxic-green/50 rounded-lg px-4 py-3
                               text-base font-mono text-white placeholder-white/50 text-center
                               focus:border-toxic-green focus:outline-none focus:shadow-[0_0_25px_rgba(57,255,20,0.4)]
                               transition-all duration-300"
                    style={{
                      textShadow: name ? '0 0 12px rgba(57, 255, 20, 0.5)' : 'none',
                    }}
                    autoFocus
                  />
                  {/* Scanline cursor effect */}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-toxic-green to-transparent"
                    style={{
                      animation: name ? 'none' : 'scanline 1.2s ease-in-out infinite',
                    }}
                  />
                </div>

                {/* Room link indicator */}
                {pendingRoomId && !showLinkPasswordPrompt && (
                  <p className="text-white/60 text-xs font-mono text-center">
                    joining room via invite link...
                  </p>
                )}

                {/* Password prompt for direct room link */}
                {showLinkPasswordPrompt && linkPasswordPrompt}

                {/* Go! button */}
                <button
                  onClick={handleGo}
                  disabled={!name.trim() || connecting}
                  className={btnClass}
                >
                  {btnGlow}
                  <span className="relative z-10 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
                    {connecting ? (
                      <span className="flex items-center justify-center gap-2">
                        {spinner}
                        JOINING...
                      </span>
                    ) : (
                      'Go!'
                    )}
                  </span>
                </button>

                {/* Error from direct join attempt */}
                {error && screen === 'character-select' && (
                  <p className="text-sm font-mono font-bold text-center" style={{ color: '#ff0080' }}>
                    {error}
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ───────── Screen 2: Room Select (two-column layout) ───────── */}
      {screen === 'room-select' && (
        <div className="relative z-10 flex-1 w-full flex items-center justify-center px-4">
          <div className="flex flex-col max-w-3xl w-full room-select-enter">

            {/* Two-column row (stacks on narrow screens) */}
            <div className="flex flex-col sm:flex-row gap-4 items-stretch w-full">

              {/* Left column: Character preview */}
              {characters.length > 0 && (
                <CharacterSidePreview
                  characters={characters}
                  selectedIndex={selectedIndex}
                  onSelect={handleCharacterSwitch}
                  playerName={name}
                  onPlayerNameChange={isAuthenticated ? undefined : setName}
                  onBack={handleBack}
                />
              )}

              {/* Right column: Room selection sub-views */}
              <div className="flex-1 flex items-center justify-center">

                {/* Choose sub-view: Global Lobby vs Custom Rooms */}
                {roomSubView === 'choose' && (
                  <div
                    className="w-full p-6 rounded-xl font-mono"
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.75)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(57, 255, 20, 0.4)',
                      boxShadow: '0 0 30px rgba(57, 255, 20, 0.15)',
                    }}
                  >
                    <div className="flex flex-col gap-3">
                      {/* Global Lobby button */}
                      <button
                        onClick={handleJoinPublic}
                        onKeyDown={handleKeyDown}
                        disabled={connecting}
                        className="lobby-btn w-full relative overflow-hidden group
                                   bg-green-700/40 border-2 border-toxic-green rounded-lg px-4 py-4
                                   text-base font-mono font-bold text-white
                                   hover:bg-green-600/50 hover:shadow-[0_0_40px_rgba(57,255,20,0.6)]
                                   disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-700/40
                                   transition-all duration-300"
                      >
                        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent
                                        translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                        <span className="relative z-10 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
                          {connectingTarget === 'public' ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              connecting...
                            </span>
                          ) : 'Global Lobby'}
                        </span>
                      </button>

                      {/* Custom Rooms button */}
                      <button
                        onClick={async () => {
                          // If lobby already joined eagerly, skip straight to browse
                          if (lobbyJoined) {
                            setRoomSubView('browse')
                            return
                          }
                          setConnectingTarget('custom')
                          try {
                            await getNetwork().ensureLobbyJoined()
                            setRoomSubView('browse')
                          } catch (err) {
                            setError('Failed to load room list')
                          } finally {
                            setConnectingTarget(null)
                          }
                        }}
                        disabled={connecting}
                        className="lobby-btn w-full relative overflow-hidden group
                                   bg-green-700/40 border-2 border-toxic-green rounded-lg px-4 py-4
                                   text-base font-mono font-bold text-white
                                   hover:bg-green-600/50 hover:shadow-[0_0_40px_rgba(57,255,20,0.6)]
                                   disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-700/40
                                   transition-all duration-300"
                      >
                        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent
                                        translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                        <span className="relative z-10 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
                          {connectingTarget === 'custom' ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              connecting...
                            </span>
                          ) : 'Custom Rooms'}
                        </span>
                      </button>

                      {/* My Room button — logged-in users only (+ dev mode for testing) */}
                      {(isAuthenticated || import.meta.env.DEV) && (
                        <button
                          onClick={handleJoinMyRoom}
                          disabled={connecting}
                          className="lobby-btn w-full relative overflow-hidden group
                                     bg-green-700/40 border-2 border-toxic-green rounded-lg px-4 py-4
                                     text-base font-mono font-bold text-white
                                     hover:bg-green-600/50 hover:shadow-[0_0_40px_rgba(57,255,20,0.6)]
                                     disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-700/40
                                     transition-all duration-300"
                        >
                          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent
                                          translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                          <span className="relative z-10 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
                            {connectingTarget === 'myroom' ? (
                              <span className="flex items-center justify-center gap-2">
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                connecting...
                              </span>
                            ) : 'My Room'}
                          </span>
                        </button>
                      )}

                      {/* Error message */}
                      {error && (
                        <p className="lobby-error-enter text-rave-pink text-sm font-mono text-center font-bold">
                          {error}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Browse sub-view */}
                {roomSubView === 'browse' && selectedChar && (
                  <div className="w-full">
                    <CustomRoomBrowser
                      playerName={name.trim()}
                      textureId={selectedChar.textureId}
                      onBack={() => setRoomSubView('choose')}
                      onCreating={() => setRoomSubView('create')}
                      onJoined={handleCustomRoomJoined}
                    />
                  </div>
                )}

                {/* Create sub-view */}
                {roomSubView === 'create' && selectedChar && (
                  <div className="w-full">
                    <CreateRoomForm
                      playerName={name.trim()}
                      textureId={selectedChar.textureId}
                      onBack={() => setRoomSubView('browse')}
                      onCreated={handleCustomRoomJoined}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanline {
          0%, 100% { opacity: 0.3; transform: scaleX(0.3); }
          50% { opacity: 1; transform: scaleX(1); }
        }
        @keyframes lobby-card-enter {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .lobby-card-enter {
          animation: lobby-card-enter 0.5s ease-out 0.2s both;
        }
        @keyframes room-select-enter {
          from { opacity: 0; transform: translateY(30px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .room-select-enter {
          animation: room-select-enter 0.4s ease-out 0.1s both;
        }
        @keyframes lobby-error-enter {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .lobby-error-enter {
          animation: lobby-error-enter 0.3s ease both;
        }
        .lobby-btn:not(:disabled):hover  { transform: scale(1.03); }
        .lobby-btn:not(:disabled):active { transform: scale(0.97); }
      `}</style>
    </div>
  )
}
