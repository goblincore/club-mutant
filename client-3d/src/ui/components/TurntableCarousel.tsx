import { useRef, useEffect, useState, useMemo, memo } from 'react'
import type { CharacterManifest, ManifestPart, ManifestTrack } from '../../character/CharacterLoader'

interface CharacterEntry {
  id: string
  name: string
  path: string
  textureId: number
}

interface TurntableCarouselProps {
  characters: CharacterEntry[]
  selectedIndex: number
  onSelect: (index: number) => void
}

// --- Constants ---
const TWO_PI = Math.PI * 2
const RADIUS = 250 // ring radius in px
const AUTO_SPEED = 0.3 // radians/sec (~17 deg/s, full rotation ~21s)
const SNAP_LERP = 8 // exponential approach factor
const SNAP_THRESHOLD = 0.003 // rad — close enough to snap
const RESUME_DELAY = 3000 // ms before auto-rotate resumes after user input
const TILT_DEG = 8 // X-axis tilt for turntable perspective
const DEPTH_FACTOR = 0.5 // Z scaling for perspective exaggeration
const CHAR_SIZE = 140 // uniform size for all CharacterPreview instances

function shortestAngleDiff(from: number, to: number): number {
  return ((to - from) % TWO_PI + TWO_PI + Math.PI) % TWO_PI - Math.PI
}

export function TurntableCarousel({
  characters,
  selectedIndex,
  onSelect,
}: TurntableCarouselProps) {
  // --- Refs for animation (no React state in the hot path) ---
  const angleRef = useRef(0)
  const targetAngleRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const autoResumeTsRef = useRef(0) // timestamp when auto-rotate can resume
  const lastReportedIndexRef = useRef(-1)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const rafRef = useRef<number>(0)

  // Keep fresh references for the rAF closure
  const charsRef = useRef(characters)
  charsRef.current = characters
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const selectedIndexRef = useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex

  // --- Selection sync: when parent changes selectedIndex, set snap target ---
  useEffect(() => {
    if (characters.length === 0) return
    const target = -(selectedIndex * TWO_PI / characters.length)
    targetAngleRef.current = target
    autoResumeTsRef.current = performance.now() + RESUME_DELAY
  }, [selectedIndex, characters.length])

  // --- Main rAF animation loop (runs once, never restarts) ---
  useEffect(() => {
    if (characters.length === 0) return

    // Initialize angle to show the selected character at front
    angleRef.current = -(selectedIndex * TWO_PI / characters.length)
    targetAngleRef.current = null
    lastFrameRef.current = performance.now()
    lastReportedIndexRef.current = selectedIndex

    const animate = (now: number) => {
      const dt = Math.min((now - lastFrameRef.current) / 1000, 0.1)
      lastFrameRef.current = now

      const N = charsRef.current.length
      if (N === 0) {
        rafRef.current = requestAnimationFrame(animate)
        return
      }

      const angleStep = TWO_PI / N

      // --- Update angle ---
      if (targetAngleRef.current !== null) {
        // Snap mode: exponential approach to target
        const diff = shortestAngleDiff(angleRef.current, targetAngleRef.current)
        if (Math.abs(diff) < SNAP_THRESHOLD) {
          angleRef.current = targetAngleRef.current
          targetAngleRef.current = null
        } else {
          angleRef.current += diff * SNAP_LERP * dt
        }
      } else if (now > autoResumeTsRef.current) {
        // Auto-rotate mode
        angleRef.current += AUTO_SPEED * dt
      }

      // --- Position all character DOM elements ---
      for (let i = 0; i < N; i++) {
        const el = itemRefs.current[i]
        if (!el) continue

        const charAngle = angleRef.current + i * angleStep
        const x = Math.sin(charAngle) * RADIUS
        const z = Math.cos(charAngle) * RADIUS
        const depth = (z + RADIUS) / (2 * RADIUS) // 0=back, 1=front

        const scale = 0.5 + 0.7 * depth
        const opacity = 0.3 + 0.7 * depth
        const brightness = 0.4 + 0.6 * depth
        const zIdx = Math.round(depth * 100)
        const isFront = depth > 0.92

        el.style.transform = `translateX(${x}px) translateZ(${z * DEPTH_FACTOR}px) scale(${scale})`
        el.style.opacity = String(opacity)
        el.style.zIndex = String(zIdx)
        el.style.filter = isFront
          ? `drop-shadow(0 0 20px rgba(57, 255, 20, 0.6)) brightness(${brightness})`
          : `brightness(${brightness})`
        el.style.pointerEvents = depth > 0.3 ? 'auto' : 'none'
      }

      // --- During auto-rotate, sync selectedIndex to front character ---
      if (targetAngleRef.current === null && now > autoResumeTsRef.current) {
        let bestI = 0
        let bestDist = Infinity
        for (let i = 0; i < N; i++) {
          const charAngle = angleRef.current + i * angleStep
          const normalized = ((charAngle % TWO_PI) + TWO_PI) % TWO_PI
          const dist = Math.min(normalized, TWO_PI - normalized)
          if (dist < bestDist) {
            bestDist = dist
            bestI = i
          }
        }
        if (bestI !== lastReportedIndexRef.current) {
          lastReportedIndexRef.current = bestI
          onSelectRef.current(bestI)
        }
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters.length > 0]) // only restart when chars become available

  const handlePrev = () => {
    const N = characters.length
    if (N === 0) return
    onSelect((selectedIndex - 1 + N) % N)
  }

  const handleNext = () => {
    const N = characters.length
    if (N === 0) return
    onSelect((selectedIndex + 1) % N)
  }

  if (characters.length === 0) return null

  return (
    <div className="relative w-full">
      {/* Arrow buttons */}
      <button
        onClick={handlePrev}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-14 h-14
                   flex items-center justify-center rounded-full
                   bg-black/60 border-2 border-white/40 text-white
                   hover:bg-white/30 hover:border-white/70 hover:scale-110
                   transition-all duration-200"
        style={{ backdropFilter: 'blur(4px)' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <button
        onClick={handleNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-14 h-14
                   flex items-center justify-center rounded-full
                   bg-black/60 border-2 border-white/40 text-white
                   hover:bg-white/30 hover:border-white/70 hover:scale-110
                   transition-all duration-200"
        style={{ backdropFilter: 'blur(4px)' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* 3D carousel container */}
      <div
        className="relative w-full h-96"
        style={{ perspective: '800px' }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateX(${TILT_DEG}deg)`,
          }}
        >
          {characters.map((char, i) => (
            <div
              key={char.id}
              ref={(el) => { itemRefs.current[i] = el }}
              className="absolute flex flex-col items-center cursor-pointer"
              onClick={() => { if (i !== selectedIndex) onSelect(i) }}
              style={{ willChange: 'transform, opacity' }}
            >
              <CharacterPreview
                characterPath={char.path}
                isActive={i === selectedIndex}
                size={CHAR_SIZE}
              />
              <span
                className="text-xs font-mono text-white/80 mt-1 text-center whitespace-nowrap"
                style={{ textShadow: '0 0 6px rgba(0,0,0,0.8)' }}
              >
                {char.name}
              </span>
            </div>
          ))}
        </div>

        {/* Floor reflection line */}
        <div
          className="absolute bottom-12 left-1/2 -translate-x-1/2 w-[400px] h-0.5 opacity-30"
          style={{
            background: 'linear-gradient(90deg, transparent, #39ff14, transparent)',
          }}
        />

        {/* Selection dots */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {characters.map((_, i) => {
            const isActive = i === selectedIndex
            return (
              <button
                key={i}
                onClick={() => onSelect(i)}
                className="w-2 h-2 rounded-full transition-all duration-200 hover:scale-150"
                style={{
                  backgroundColor: isActive ? '#39ff14' : 'rgba(255,255,255,0.3)',
                  transform: isActive ? 'scale(1.3)' : 'scale(1)',
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── CharacterPreview (unchanged) ────────────────────────────────────

interface CharacterPreviewProps {
  characterPath: string
  isActive: boolean
  size: number
}

const CharacterPreview = memo(function CharacterPreview({
  characterPath,
  isActive,
  size,
}: CharacterPreviewProps) {
  const [manifest, setManifest] = useState<CharacterManifest | null>(null)
  const partElsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const rafRef = useRef<number>(0)
  const isAnimatingRef = useRef(false)

  useEffect(() => {
    fetch(`${characterPath}/manifest.json`)
      .then((res) => res.json())
      .then(setManifest)
      .catch(() => {})
  }, [characterPath])

  useEffect(() => {
    if (!manifest || !isActive) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
      isAnimatingRef.current = false
      return
    }

    const idleAnim = manifest.animations?.find((a) => a.name === 'idle')
    if (!idleAnim) return

    const rotTracks = new Map<string, ManifestTrack>()
    for (const track of idleAnim.tracks) {
      if (track.property === 'rotation.z') {
        rotTracks.set(track.boneId, track)
      }
    }

    const startTime = performance.now()
    isAnimatingRef.current = true
    let frameCount = 0

    const tick = () => {
      if (!isAnimatingRef.current) return

      frameCount++
      if (frameCount % 2 === 0) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const elapsed = (performance.now() - startTime) / 1000
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

    return () => {
      isAnimatingRef.current = false
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [manifest, isActive])

  const layout = useMemo(() => {
    if (!manifest) return null

    const parts = manifest.parts
    const byId = new Map<string, ManifestPart>()

    for (const p of parts) byId.set(p.id, p)

    function getAbsPos(part: ManifestPart): [number, number] {
      let x = part.offset[0]
      let y = part.offset[1]
      let cur: ManifestPart | undefined = part.parent ? byId.get(part.parent) : undefined

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
            loading="lazy"
          />
        )
      })}
    </div>
  )
})

interface PartLayout {
  part: ManifestPart
  left: number
  top: number
}

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
