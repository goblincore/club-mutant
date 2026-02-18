import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

import { getNetwork } from '../network/NetworkManager'
import { useGameStore } from '../stores/gameStore'
import { getCharacters, type CharacterEntry } from '../character/characterRegistry'
import { WarpCheckBg } from './WarpCheckBg'
import { TurntableCarousel } from './components/TurntableCarousel'

export function LobbyScreen() {
  const [characters, setCharacters] = useState<CharacterEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [name, setName] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getCharacters().then((chars) => {
      setCharacters(chars)
    })
  }, [])

  const selectedChar = characters[selectedIndex] ?? null

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setSelectedIndex((i) => (i - 1 + characters.length) % characters.length)
      }
      if (e.key === 'ArrowRight') {
        setSelectedIndex((i) => (i + 1) % characters.length)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [characters.length])

  const handleJoin = async () => {
    const trimmed = name.trim()
    if (!trimmed || !selectedChar) return

    useGameStore.getState().setSelectedCharacterPath(selectedChar.path)

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin()
  }

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full overflow-hidden">
      <WarpCheckBg />

      {/* Toxic particle overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full particle-float"
            style={{
              left: `${10 + i * 8}%`,
              top: `${15 + (i % 4) * 20}%`,
              backgroundColor: i % 3 === 0 ? '#39ff14' : i % 3 === 1 ? '#ff0080' : '#00ffff',
              filter: 'blur(1px)',
              animationDelay: `${i * 0.4}s`,
              animationDuration: `${2.5 + (i % 4)}s`,
            }}
          />
        ))}
      </div>

      {/* Carousel floating in space — logo is rendered inside TurntableCarousel's 3D space */}
      <div className="relative z-10 flex-1 w-full flex items-center justify-center">
        {characters.length > 0 && (
          <TurntableCarousel
            characters={characters}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />
        )}
      </div>

      {/* Input container - opaque green for legibility */}
      <motion.div
        className="relative z-10 mb-8 p-6 rounded-xl border-2"
        style={{
          backgroundColor: 'rgba(57, 255, 20, 0.45)',
          backdropFilter: 'blur(12px)',
          borderColor: '#39ff14',
          boxShadow: `
            0 0 30px rgba(57, 255, 20, 0.3),
            inset 0 0 20px rgba(57, 255, 20, 0.15)
          `,
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
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
              disabled={connecting}
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

          {/* Join button */}
          <motion.button
            onClick={handleJoin}
            disabled={connecting || !name.trim()}
            className="w-full relative overflow-hidden group
                       bg-green-700/40 border-2 border-toxic-green rounded-lg px-4 py-3
                       text-base font-mono font-bold text-white
                       hover:bg-green-600/50 hover:shadow-[0_0_40px_rgba(57,255,20,0.6)]
                       disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-green-700/40
                       transition-all duration-300"
            whileHover={{ scale: name.trim() ? 1.03 : 1 }}
            whileTap={{ scale: name.trim() ? 0.97 : 1 }}
          >
            {/* Button glow effect */}
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent 
                            translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
            
            <span className="relative z-10 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
              {connecting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  CONNECTING...
                </span>
              ) : (
                'Join'
              )}
            </span>
          </motion.button>

          {/* Error message */}
          {error && (
            <motion.p 
              className="text-rave-pink text-sm font-mono text-center font-bold"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              ⚠ {error}
            </motion.p>
          )}

        </div>
      </motion.div>

      <style>{`
        @keyframes scanline {
          0%, 100% { opacity: 0.3; transform: scaleX(0.3); }
          50% { opacity: 1; transform: scaleX(1); }
        }
        @keyframes particle-float {
          0%, 100% { 
            transform: translateY(0) scale(0.5); 
            opacity: 0; 
          }
          50% { 
            transform: translateY(-40px) scale(1.2); 
            opacity: 0.8; 
          }
        }
        .particle-float {
          animation: particle-float ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
