import { useState, useEffect } from 'react'

import { getNetwork } from '../network/NetworkManager'
import { useGameStore } from '../stores/gameStore'
import { getCharacters, type CharacterEntry } from '../character/characterRegistry'
import { WarpCheckBg } from './WarpCheckBg'
import { TurntableCarousel } from './components/TurntableCarousel'
import { CharacterSidePreview } from './CharacterSidePreview'
import { CustomRoomBrowser } from './CustomRoomBrowser'
import { CreateRoomForm } from './CreateRoomForm'

type Screen = 'character-select' | 'room-select'
type RoomSubView = 'choose' | 'browse' | 'create'

export function LobbyScreen() {
  const [characters, setCharacters] = useState<CharacterEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [name, setName] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('character-select')
  const [roomSubView, setRoomSubView] = useState<RoomSubView>('choose')

  const lobbyJoined = useGameStore((s) => s.lobbyJoined)

  useEffect(() => {
    getCharacters().then((chars) => {
      setCharacters(chars)
    })
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

  // Screen 1: "Go!" button — save character + transition to room select
  const handleGo = () => {
    const trimmed = name.trim()
    if (!trimmed || !selectedChar) return
    useGameStore.getState().setSelectedCharacterPath(selectedChar.path)
    // Trigger lazy NetworkManager creation so joinLobbyRoom() fires in the constructor.
    // This starts the lobby connection before Screen 2 renders.
    getNetwork()
    setScreen('room-select')
    setRoomSubView('choose')
    setError(null)
  }

  // Screen 2: Join the global public room
  const handleJoinPublic = async () => {
    const trimmed = name.trim()
    if (!trimmed || !selectedChar) return

    setConnecting(true)
    setError(null)

    try {
      await getNetwork().joinPublicRoom(trimmed, selectedChar.textureId)
      getNetwork().sendReady()
    } catch (err) {
      setError('Failed to connect. Is the server running?')
      console.error(err)
    } finally {
      setConnecting(false)
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

  return (
    <div className="relative flex flex-col items-center w-full h-full overflow-hidden">
      <WarpCheckBg />

      {/* ───────── Screen 1: Character Select ───────── */}
      {screen === 'character-select' && (
        <>
          {/* Carousel floating in space */}
          <div className="relative z-10 flex-1 w-full flex items-end justify-center min-h-0">
            {characters.length > 0 && (
              <TurntableCarousel
                characters={characters}
                selectedIndex={selectedIndex}
                onSelect={handleCharacterSwitch}
              />
            )}
          </div>

          {/* Bottom card: name input + Go! button */}
          <div
            className="relative z-10 mb-6 mt-0 p-6 rounded-xl border-2 shrink-0 lobby-card-enter"
            style={{
              backgroundColor: 'rgba(57, 255, 20, 0.45)',
              backdropFilter: 'blur(12px)',
              borderColor: '#39ff14',
              boxShadow: `
                0 0 30px rgba(57, 255, 20, 0.3),
                inset 0 0 20px rgba(57, 255, 20, 0.15)
              `,
            }}
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

              {/* Go! button */}
              <button
                onClick={handleGo}
                disabled={!name.trim()}
                className="lobby-btn w-full relative overflow-hidden group
                           bg-green-700/40 border-2 border-toxic-green rounded-lg px-4 py-3
                           text-base font-mono font-bold text-white
                           hover:bg-green-600/50 hover:shadow-[0_0_40px_rgba(57,255,20,0.6)]
                           disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-green-700/40
                           transition-all duration-300"
              >
                {/* Button glow effect */}
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent
                                translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                <span className="relative z-10 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
                  Go!
                </span>
              </button>
            </div>
          </div>
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
                  playerName={name.trim()}
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
                                   disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-green-700/40
                                   transition-all duration-300"
                      >
                        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent
                                        translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                        <span className="relative z-10 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
                          {connecting ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              CONNECTING...
                            </span>
                          ) : (
                            'Global Lobby'
                          )}
                        </span>
                      </button>

                      {/* Custom Rooms button */}
                      <button
                        onClick={() => setRoomSubView('browse')}
                        disabled={!lobbyJoined}
                        className="lobby-btn w-full relative overflow-hidden group
                                   bg-green-700/40 border-2 border-toxic-green rounded-lg px-4 py-4
                                   text-base font-mono font-bold text-white
                                   hover:bg-green-600/50 hover:shadow-[0_0_40px_rgba(57,255,20,0.6)]
                                   disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-green-700/40
                                   transition-all duration-300"
                      >
                        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent
                                        translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                        <span className="relative z-10 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
                          {lobbyJoined ? 'Custom Rooms' : 'connecting...'}
                        </span>
                      </button>

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
