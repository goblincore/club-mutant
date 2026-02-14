import { useState, useEffect } from 'react'

import { getNetwork } from '../network/NetworkManager'
import { useGameStore } from '../stores/gameStore'
import { getCharacters, type CharacterEntry } from '../character/characterRegistry'

export function LobbyScreen() {
  const [characters, setCharacters] = useState<CharacterEntry[]>([])
  const [name, setName] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Discover available characters on mount
  useEffect(() => {
    getCharacters().then((chars) => {
      setCharacters(chars)

      if (chars.length > 0 && !selectedId) {
        setSelectedId(chars[0]!.id)
      }
    })
  }, [])

  const handleJoin = async () => {
    const trimmed = name.trim()
    if (!trimmed) return

    const character = characters.find((c) => c.id === selectedId) ?? characters[0]

    if (!character) return

    useGameStore.getState().setSelectedCharacterPath(character.path)

    setConnecting(true)
    setError(null)

    try {
      await getNetwork().joinPublicRoom(trimmed, character.textureId)
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
      <div className="flex flex-col items-center gap-6 p-8 border border-white/10 rounded-xl bg-black/40 backdrop-blur max-w-md">
        <h1 className="text-2xl font-bold tracking-tight">
          Club Mutant <span className="text-green-400"></span>
        </h1>

        <p className="text-xs text-white/40 max-w-xs text-center">
          {/* PSX-style multiplayer hangout. Pick a character and enter a name to join. */}
        </p>

        {/* Character select grid */}
        <div className="flex gap-3">
          {characters.map((char) => {
            const isSelected = char.id === selectedId

            return (
              <button
                key={char.id}
                onClick={() => setSelectedId(char.id)}
                className={`
                  relative flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all cursor-pointer
                  ${
                    isSelected
                      ? 'border-green-400/60 bg-green-500/10 shadow-[0_0_12px_rgba(74,222,128,0.15)]'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                  }
                `}
              >
                {/* Character thumbnail */}
                <div className="w-16 h-16 flex items-center justify-center overflow-hidden">
                  <img
                    src={char.thumbnail}
                    alt={char.name}
                    className="w-14 h-14 object-contain"
                    style={{ imageRendering: 'pixelated' }}
                    draggable={false}
                  />
                </div>

                {/* Name label */}
                <span
                  className={`text-[10px] font-mono ${isSelected ? 'text-green-300' : 'text-white/50'}`}
                >
                  {char.name}
                </span>

                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-green-400" />
                )}
              </button>
            )
          })}
        </div>

        {/* Name input */}
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

        {/* Join button */}
        <button
          onClick={handleJoin}
          disabled={connecting || !name.trim()}
          className="w-64 bg-green-500/20 border border-green-400/30 text-green-300 rounded-lg px-4 py-2.5 text-sm font-bold hover:bg-green-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {connecting ? 'Connecting...' : 'Join'}
        </button>

        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    </div>
  )
}
