import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

import { getNetwork } from '../network/NetworkManager'
import { useGameStore } from '../stores/gameStore'
import { getCharacters, type CharacterEntry } from '../character/characterRegistry'
import type { CharacterManifest, ManifestPart, ManifestTrack } from '../character/CharacterLoader'
import { WarpCheckBg } from './WarpCheckBg'

interface PartLayout {
  part: ManifestPart
  left: number
  top: number
}

/** Linearly interpolate keyframes at a given time */
function interpolateKeys(keys: [number, number][], t: number): number {
  if (keys.length === 0) return 0
  if (t <= keys[0][0]) return keys[0][1]
  if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1][1]

  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i]
    const [t1, v1] = keys[i + 1]

    if (t >= t0 && t <= t1) {
      const frac = (t - t0) / (t1 - t0)
      return v0 + frac * (v1 - v0)
    }
  }

  return keys[keys.length - 1][1]
}

/**
 * Full-body character preview composited from manifest parts via CSS.
 * Computes absolute positions, centers within container, and plays idle animation.
 */
function CharacterPreview({ characterPath, size = 180 }: { characterPath: string; size?: number }) {
  const [manifest, setManifest] = useState<CharacterManifest | null>(null)
  const partElsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const rafRef = useRef<number>(0)
  const startRef = useRef(performance.now())

  useEffect(() => {
    fetch(`${characterPath}/manifest.json`)
      .then((res) => res.json())
      .then(setManifest)
      .catch(() => {})
  }, [characterPath])

  // Idle animation loop — updates transforms directly on DOM elements
  useEffect(() => {
    if (!manifest) return

    const idleAnim = manifest.animations?.find((a) => a.name === 'idle')
    if (!idleAnim) return

    // Build lookup: boneRole → rotation.z track
    const rotTracks = new Map<string, ManifestTrack>()

    for (const track of idleAnim.tracks) {
      if (track.property === 'rotation.z') {
        rotTracks.set(track.boneId, track)
      }
    }

    startRef.current = performance.now()

    const tick = () => {
      const elapsed = (performance.now() - startRef.current) / 1000
      const loopTime = elapsed % idleAnim.duration

      for (const [boneRole, track] of rotTracks) {
        const el = partElsRef.current.get(boneRole)
        if (!el) continue

        const rad = interpolateKeys(track.keys, loopTime)
        const deg = rad * (180 / Math.PI)
        el.style.transform = `rotate(${deg}deg)`
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(rafRef.current)
  }, [manifest])

  const layout = useMemo(() => {
    if (!manifest) return null

    const parts = manifest.parts
    const byId = new Map<string, ManifestPart>()

    for (const p of parts) byId.set(p.id, p)

    function getAbsPos(part: ManifestPart): [number, number] {
      let x = part.offset[0]
      let y = part.offset[1]
      let cur = part.parent ? byId.get(part.parent) : undefined

      while (cur) {
        x += cur.offset[0]
        y += cur.offset[1]
        cur = cur.parent ? byId.get(cur.parent) : undefined
      }

      return [x, y]
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    const layouts: PartLayout[] = parts.map((part) => {
      const [ax, ay] = getAbsPos(part)
      const left = ax - part.pivot[0] * part.size[0]
      const top = ay - (1 - part.pivot[1]) * part.size[1]

      minX = Math.min(minX, left)
      minY = Math.min(minY, top)
      maxX = Math.max(maxX, left + part.size[0])
      maxY = Math.max(maxY, top + part.size[1])

      return { part, left, top }
    })

    const totalW = maxX - minX
    const totalH = maxY - minY
    const scale = size / Math.max(totalW, totalH)

    // Center offset for the smaller dimension
    const centerX = (size - totalW * scale) / 2
    const centerY = (size - totalH * scale) / 2

    const sorted = [...layouts].sort((a, b) => a.part.zIndex - b.part.zIndex)

    return { sorted, minX, minY, scale, centerX, centerY }
  }, [manifest, size])

  if (!layout) return <div style={{ width: size, height: size }} />

  const { sorted, minX, minY, scale, centerX, centerY } = layout

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {sorted.map(({ part, left, top }) => {
        const w = part.size[0] * scale
        const h = part.size[1] * scale

        // Transform-origin at the pivot point within the image (Y-flipped for CSS)
        const originX = part.pivot[0] * 100
        const originY = (1 - part.pivot[1]) * 100

        return (
          <img
            key={part.id}
            ref={(el) => {
              if (el && part.boneRole) partElsRef.current.set(part.boneRole, el)
            }}
            src={`${characterPath}/${part.texture}`}
            className="absolute"
            style={{
              left: (left - minX) * scale + centerX,
              top: (top - minY) * scale + centerY,
              width: w,
              height: h,
              imageRendering: 'pixelated',
              transformOrigin: `${originX}% ${originY}%`,
            }}
            draggable={false}
          />
        )
      })}
    </div>
  )
}

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

  const prev = useCallback(() => {
    setSelectedIndex((i) => (i - 1 + characters.length) % characters.length)
  }, [characters.length])

  const next = useCallback(() => {
    setSelectedIndex((i) => (i + 1) % characters.length)
  }, [characters.length])

  // Keyboard nav for arrows
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }

    window.addEventListener('keydown', handler)

    return () => window.removeEventListener('keydown', handler)
  }, [prev, next])

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
    <div className="relative flex items-center justify-center w-full h-full bg-neutral-950 overflow-hidden">
      <WarpCheckBg />

      <div className="relative z-10 flex flex-col items-center gap-5 p-8 border border-white/30 rounded-xl bg-green-500/70 backdrop-blur-md w-80">
        <h1 className="text-2xl font-bold tracking-tight text-white">Club Mutant</h1>

        {/* Character carousel */}
        {characters.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              {/* Left arrow */}
              <button
                onClick={prev}
                className="w-10 h-10 flex items-center justify-center text-white/90 hover:text-white transition-colors text-2xl font-bold flex-shrink-0"
              >
                ‹
              </button>

              {/* Character preview */}
              <div className="flex items-center justify-center" style={{ width: 160, height: 160 }}>
                {selectedChar && (
                  <CharacterPreview
                    key={selectedChar.id}
                    characterPath={selectedChar.path}
                    size={160}
                  />
                )}
              </div>

              {/* Right arrow */}
              <button
                onClick={next}
                className="w-10 h-10 flex items-center justify-center text-white/90 hover:text-white transition-colors text-2xl font-bold flex-shrink-0"
              >
                ›
              </button>
            </div>

            <span className="text-sm font-mono text-white">{selectedChar?.name}</span>

            {/* Dot indicators */}
            <div className="flex gap-1.5">
              {characters.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedIndex(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    i === selectedIndex ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/60'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Name input */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Your name"
          maxLength={20}
          className="w-full bg-white/20 border border-white/50 rounded-lg px-4 py-3 text-base text-white placeholder-white/60 focus:border-white focus:outline-none text-center"
          autoFocus
          disabled={connecting}
        />

        {/* Join button */}
        <button
          onClick={handleJoin}
          disabled={connecting || !name.trim()}
          className="w-full bg-white/30 border border-white/50 text-white rounded-lg px-4 py-3 text-base font-bold hover:bg-white/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {connecting ? 'Connecting...' : 'Join'}
        </button>

        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    </div>
  )
}
