import { useState } from 'react'

import { getNetwork } from '../network/NetworkManager'
import { useGameStore } from '../stores/gameStore'

export function LobbyScreen() {
  const [name, setName] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleJoin = async () => {
    const trimmed = name.trim()
    if (!trimmed) return

    setConnecting(true)
    setError(null)

    try {
      await getNetwork().joinPublicRoom(trimmed)
      getNetwork().sendReady()
    } catch (err) {
      setError('Failed to connect. Is the server running?')
      console.error(err)
    } finally {
      setConnecting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin()
  }

  return (
    <div className="flex items-center justify-center w-full h-full bg-neutral-950">
      <div className="flex flex-col items-center gap-6 p-8 border border-white/10 rounded-xl bg-black/40 backdrop-blur">
        <h1 className="text-2xl font-bold tracking-tight">
          Club Mutant <span className="text-green-400">3D</span>
        </h1>

        <p className="text-xs text-white/40 max-w-xs text-center">
          PSX-style multiplayer hangout. Enter a name to join the public room.
        </p>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Your name"
          maxLength={20}
          className="w-64 bg-white/5 border border-white/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-green-400/50 focus:outline-none text-center"
          autoFocus
          disabled={connecting}
        />

        <button
          onClick={handleJoin}
          disabled={connecting || !name.trim()}
          className="w-64 bg-green-500/20 border border-green-400/30 text-green-300 rounded-lg px-4 py-2.5 text-sm font-bold hover:bg-green-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {connecting ? 'Connecting...' : 'Join'}
        </button>

        {error && (
          <p className="text-red-400 text-xs">{error}</p>
        )}
      </div>
    </div>
  )
}
