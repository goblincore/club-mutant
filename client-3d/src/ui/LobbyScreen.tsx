import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'

import { getNetwork } from '../network/NetworkManager'
import { useGameStore } from '../stores/gameStore'
import { getCharacters, type CharacterEntry } from '../character/characterRegistry'
import { WarpCheckBg } from './WarpCheckBg'
import { MutantLogo } from './components/MutantLogo'
import { TurntableCarousel } from './components/TurntableCarousel'

export function LobbyScreen() {
  const [characters, setCharacters] = useState<CharacterEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [name, setName] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Discover available characters on mount
  useEffect(() => {
    getCharacters().then((chars) => {
      setCharacters(chars)
    })
  }, [])

  const selectedChar = characters[selectedIndex] ?? null

  // Keyboard nav for arrows
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
    <div className="relative flex items-center justify-center w-full h-full bg-grunge-black overflow-hidden">
      <WarpCheckBg />

      {/* Toxic particle overlay - OPTIMIZED: fewer particles, CSS animation */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full particle-float"
            style={{
              left: `${15 + i * 10}%`,
              top: `${20 + (i % 3) * 25}%`,
              backgroundColor: i % 3 === 0 ? '#39ff14' : i % 3 === 1 ? '#ff0080' : '#00ffff',
              filter: 'blur(1px)',
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${3 + (i % 3)}s`,
            }}
          />
        ))}
      </div>

      {/* Main card */}
      <motion.div 
        className="relative z-10 flex flex-col items-center gap-4 p-8 
                   border border-white/30 rounded-2xl 
                   bg-grunge-dark/80 backdrop-blur-xl w-96"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{
          boxShadow: `
            0 0 40px rgba(57, 255, 20, 0.1),
            0 0 80px rgba(57, 255, 20, 0.05),
            inset 0 1px 0 rgba(255,255,255,0.1)
          `,
        }}
      >
        {/* Logo */}
        <MutantLogo />

        {/* Character carousel */}
        {characters.length > 0 && (
          <div className="w-full">
            <TurntableCarousel
              characters={characters}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
            />
          </div>
        )}

        {/* Name input with holographic style */}
        <motion.div 
          className="w-full relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ENTER YOUR NAME"
            maxLength={20}
            disabled={connecting}
            className="w-full bg-grunge-black/60 border border-toxic-green/50 rounded-lg px-4 py-3 
                       text-sm font-mono text-white placeholder-white/40 text-center uppercase tracking-wider
                       focus:border-toxic-green focus:outline-none focus:shadow-[0_0_20px_rgba(57,255,20,0.3)]
                       transition-all duration-300"
            style={{
              textShadow: name ? '0 0 10px rgba(57, 255, 20, 0.3)' : 'none',
            }}
            autoFocus
          />
          {/* Scanline cursor effect */}
          <div 
            className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-toxic-green/50 to-transparent"
            style={{
              animation: name ? 'none' : 'pulse 1.5s ease-in-out infinite',
            }}
          />
        </motion.div>

        {/* Join button */}
        <motion.button
          onClick={handleJoin}
          disabled={connecting || !name.trim()}
          className="w-full relative overflow-hidden group
                     bg-transparent border border-toxic-green/70 rounded-lg px-4 py-3 
                     text-sm font-mono font-bold text-toxic-green uppercase tracking-widest
                     hover:bg-toxic-green/10 hover:border-toxic-green hover:shadow-[0_0_30px_rgba(57,255,20,0.4)]
                     disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent
                     transition-all duration-300"
          whileHover={{ scale: name.trim() ? 1.02 : 1 }}
          whileTap={{ scale: name.trim() ? 0.98 : 1 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          {/* Button glow effect */}
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-toxic-green/20 to-transparent 
                          translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
          
          <span className="relative z-10">
            {connecting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-toxic-green/30 border-t-toxic-green rounded-full animate-spin" />
                CONNECTING...
              </span>
            ) : (
              'JOIN THE CLUB'
            )}
          </span>
        </motion.button>

        {/* Error message */}
        {error && (
          <motion.p 
            className="text-rave-pink text-xs font-mono text-center"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            ⚠ {error}
          </motion.p>
        )}

        {/* Instructions */}
        <motion.p 
          className="text-white/30 text-xs font-mono text-center mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          Drag or use ← → arrows to browse
        </motion.p>
      </motion.div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
        @keyframes particle-float {
          0%, 100% { 
            transform: translateY(0) scale(0.5); 
            opacity: 0; 
          }
          50% { 
            transform: translateY(-30px) scale(1); 
            opacity: 0.6; 
          }
        }
        .particle-float {
          animation: particle-float ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
