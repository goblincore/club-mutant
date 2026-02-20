import { useState } from 'react'

import { useGameStore, type RoomListEntry } from '../stores/gameStore'
import { getNetwork } from '../network/NetworkManager'

interface Props {
  playerName: string
  textureId: number
  onBack: () => void
  onCreating: () => void
  onJoined: () => void
}

export function CustomRoomBrowser({ playerName, textureId, onBack, onCreating, onJoined }: Props) {
  const lobbyJoined = useGameStore((s) => s.lobbyJoined)
  const availableRooms = useGameStore((s) => s.availableRooms)

  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Password dialog state
  const [passwordRoom, setPasswordRoom] = useState<RoomListEntry | null>(null)
  const [password, setPassword] = useState('')

  const handleJoin = async (room: RoomListEntry) => {
    if (room.hasPassword) {
      setPasswordRoom(room)
      setPassword('')
      setError(null)
      return
    }

    await doJoin(room.roomId, null)
  }

  const handlePasswordSubmit = async () => {
    if (!passwordRoom) return
    await doJoin(passwordRoom.roomId, password)
  }

  const doJoin = async (roomId: string, pw: string | null) => {
    setJoining(true)
    setError(null)

    try {
      await getNetwork().joinCustomById(roomId, pw, playerName, textureId)
      getNetwork().sendReady()
      getNetwork().sendPlayerName(playerName)
      onJoined()
    } catch (err: any) {
      const msg = err?.message ?? String(err)

      if (msg.includes('403') || msg.includes('password')) {
        setError('Wrong password')
      } else {
        setError('Failed to join room')
      }

      console.error('[CustomRoomBrowser] Join failed:', err)
    } finally {
      setJoining(false)
    }
  }

  return (
    <div
      className="relative z-20 w-full max-w-lg mx-auto p-5 rounded-xl font-mono custom-room-enter"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(57, 255, 20, 0.4)',
        boxShadow: '0 0 30px rgba(57, 255, 20, 0.15)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="text-white/60 hover:text-white text-sm transition-colors"
        >
          ← back
        </button>
        <h2
          className="text-lg font-bold"
          style={{ color: '#39ff14', textShadow: '0 0 10px rgba(57, 255, 20, 0.5)' }}
        >
          custom rooms
        </h2>
        <div className="w-12" /> {/* spacer */}
      </div>

      {/* Loading state */}
      {!lobbyJoined && (
        <div className="text-center py-8 text-white/50 text-sm">
          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
          connecting to lobby...
        </div>
      )}

      {/* Room list */}
      {lobbyJoined && availableRooms.length === 0 && (
        <div className="text-center py-8">
          <p className="text-white/50 text-sm mb-2">no custom rooms yet</p>
          <p className="text-white/30 text-xs">create one below!</p>
        </div>
      )}

      {lobbyJoined && availableRooms.length > 0 && (
        <div className="max-h-64 overflow-y-auto mb-4 custom-scrollbar">
          <div className="space-y-2">
            {availableRooms.map((room) => (
              <div
                key={room.roomId}
                className="flex items-center justify-between p-3 rounded-lg transition-colors"
                style={{
                  backgroundColor: 'rgba(57, 255, 20, 0.08)',
                  border: '1px solid rgba(57, 255, 20, 0.2)',
                }}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-bold truncate">{room.name}</span>
                    {room.musicMode === 'jukebox' ? (
                      <span
                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none"
                        style={{
                          backgroundColor: 'rgba(168, 85, 247, 0.25)',
                          border: '1px solid rgba(168, 85, 247, 0.5)',
                          color: '#c084fc',
                        }}
                      >
                        jukebox
                      </span>
                    ) : (
                      <span
                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none"
                        style={{
                          backgroundColor: 'rgba(59, 130, 246, 0.25)',
                          border: '1px solid rgba(59, 130, 246, 0.5)',
                          color: '#93c5fd',
                        }}
                      >
                        DJ
                      </span>
                    )}
                    {room.hasPassword && (
                      <span className="text-yellow-400 text-xs" title="Password protected">
                        🔒
                      </span>
                    )}
                  </div>
                  {room.description && (
                    <p className="text-white/40 text-xs truncate mt-0.5">{room.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-white/40 text-xs">
                    {room.clients} {room.clients === 1 ? 'player' : 'players'}
                  </span>
                  <button
                    onClick={() => handleJoin(room)}
                    disabled={joining}
                    className="px-3 py-1 rounded text-xs font-bold transition-all
                               hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]
                               disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: 'rgba(57, 255, 20, 0.2)',
                      border: '1px solid #39ff14',
                      color: '#39ff14',
                    }}
                  >
                    join
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Password dialog (inline) */}
      {passwordRoom && (
        <div
          className="mb-4 p-3 rounded-lg"
          style={{
            backgroundColor: 'rgba(255, 200, 0, 0.1)',
            border: '1px solid rgba(255, 200, 0, 0.3)',
          }}
        >
          <p className="text-yellow-300 text-xs mb-2">
            🔒 "{passwordRoom.name}" requires a password
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePasswordSubmit()
                if (e.key === 'Escape') setPasswordRoom(null)
              }}
              placeholder="enter password"
              disabled={joining}
              className="flex-1 bg-black/50 border border-white/20 rounded px-3 py-1.5
                         text-xs font-mono text-white placeholder-white/30
                         focus:border-yellow-400 focus:outline-none transition-colors"
              autoFocus
            />
            <button
              onClick={handlePasswordSubmit}
              disabled={joining || !password}
              className="px-3 py-1.5 rounded text-xs font-bold transition-all
                         disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'rgba(255, 200, 0, 0.2)',
                border: '1px solid rgba(255, 200, 0, 0.6)',
                color: '#ffc800',
              }}
            >
              {joining ? '...' : 'go'}
            </button>
            <button
              onClick={() => setPasswordRoom(null)}
              className="px-2 py-1.5 rounded text-xs text-white/40 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-center text-sm font-bold mb-3" style={{ color: '#ff0080' }}>
          ⚠ {error}
        </p>
      )}

      {/* Create room button */}
      <button
        onClick={onCreating}
        disabled={!lobbyJoined}
        className="w-full py-2.5 rounded-lg text-sm font-bold transition-all
                   hover:shadow-[0_0_25px_rgba(57,255,20,0.4)]
                   disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'rgba(57, 255, 20, 0.15)',
          border: '2px solid #39ff14',
          color: '#39ff14',
          textShadow: '0 0 8px rgba(57, 255, 20, 0.5)',
        }}
      >
        + create room
      </button>

      <style>{`
        @keyframes custom-room-enter {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .custom-room-enter {
          animation: custom-room-enter 0.3s ease-out both;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(57, 255, 20, 0.3);
          border-radius: 2px;
        }
      `}</style>
    </div>
  )
}
