import { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react'
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

const AUTO_ROTATE_SPEED = 4000
const RADIUS = 280

export function TurntableCarousel({ 
  characters, 
  selectedIndex, 
  onSelect 
}: TurntableCarouselProps) {
  const autoRotateRef = useRef<NodeJS.Timeout | null>(null)
  const [rotation, setRotation] = useState(0)
  const targetRotationRef = useRef(0)
  const animationRef = useRef<number | null>(null)
  
  const anglePerChar = 360 / characters.length
  
  // Update target rotation when selectedIndex changes
  useEffect(() => {
    const targetRotation = -(selectedIndex * anglePerChar)
    targetRotationRef.current = targetRotation
  }, [selectedIndex, anglePerChar])
  
  // Smooth animation loop
  useEffect(() => {
    const animate = () => {
      const diff = targetRotationRef.current - rotation
      
      if (Math.abs(diff) > 0.1) {
        // Smooth lerp
        const newRotation = rotation + diff * 0.08
        setRotation(newRotation)
      } else if (rotation !== targetRotationRef.current) {
        setRotation(targetRotationRef.current)
      }
      
      animationRef.current = requestAnimationFrame(animate)
    }
    
    animationRef.current = requestAnimationFrame(animate)
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [rotation])
  
  // Auto-rotate logic
  const startAutoRotate = useCallback(() => {
    if (autoRotateRef.current) clearInterval(autoRotateRef.current)
    
    autoRotateRef.current = setInterval(() => {
      if (characters.length > 1) {
        onSelect((selectedIndex + 1) % characters.length)
      }
    }, AUTO_ROTATE_SPEED)
  }, [characters.length, selectedIndex, onSelect])
  
  useEffect(() => {
    startAutoRotate()
    return () => {
      if (autoRotateRef.current) clearInterval(autoRotateRef.current)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [startAutoRotate])
  
  const handlePrev = () => {
    const newIndex = (selectedIndex - 1 + characters.length) % characters.length
    onSelect(newIndex)
    if (autoRotateRef.current) {
      clearInterval(autoRotateRef.current)
      startAutoRotate()
    }
  }
  
  const handleNext = () => {
    const newIndex = (selectedIndex + 1) % characters.length
    onSelect(newIndex)
    if (autoRotateRef.current) {
      clearInterval(autoRotateRef.current)
      startAutoRotate()
    }
  }
  
  if (characters.length === 0) return null
  
  // Calculate which characters to show
  // We show all characters but position them based on current rotation
  const currentIndexOffset = -rotation / anglePerChar
  
  // Get indices for visible characters (center and neighbors)
  const visibleIndices = []
  const visibleCount = Math.min(7, characters.length)
  const halfVisible = Math.floor(visibleCount / 2)
  
  for (let i = -halfVisible; i <= halfVisible; i++) {
    const rawIndex = Math.round(currentIndexOffset) + i
    // Proper modulo that handles negative numbers
    const index = ((rawIndex % characters.length) + characters.length) % characters.length
    visibleIndices.push({
      index,
      offset: i + (currentIndexOffset - Math.round(currentIndexOffset)),
    })
  }
  
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
          <polyline points="15 18 9 12 15 6"></polyline>
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
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
      
      <div 
        className="relative w-full h-96"
        style={{ perspective: '1000px' }}
      >
        <div 
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateY(${rotation}deg)`,
          }}
        >
          {visibleIndices.map(({ index, offset }) => {
            const character = characters[index]
            if (!character) return null
            
            const isCenter = Math.abs(offset) < 0.5
            const angle = (index * anglePerChar * Math.PI) / 180
            const x = Math.sin(angle) * RADIUS
            const z = Math.cos(angle) * RADIUS - RADIUS * 0.5
            const scale = isCenter ? 1.5 : 1 - Math.abs(offset) * 0.08
            const opacity = isCenter ? 1 : 0.8 - Math.abs(offset) * 0.08
            
            return (
              <div
                key={`${character.id}-${index}`}
                className="absolute flex flex-col items-center"
                style={{
                  transform: `
                    translateX(${x}px) 
                    translateZ(${z}px)
                    scale(${scale})
                    rotateY(${-rotation}deg)
                  `,
                  opacity: Math.max(0.55, opacity),
                  zIndex: isCenter ? 10 : 5 - Math.round(Math.abs(offset)),
                  filter: isCenter ? 'drop-shadow(0 0 20px rgba(57, 255, 20, 0.6))' : 'none',
                }}
                onClick={() => {
                  if (!isCenter) {
                    onSelect(index)
                  }
                }}
              >
                <CharacterPreview 
                  characterPath={character.path}
                  isActive={isCenter}
                  size={isCenter ? 160 : 120}
                />
              </div>
            )
          })}
        </div>
        
        {/* Floor reflection */}
        <div 
          className="absolute bottom-12 left-1/2 -translate-x-1/2 w-[400px] h-0.5 opacity-30"
          style={{
            background: 'linear-gradient(90deg, transparent, #39ff14, transparent)',
          }}
        />
        
        {/* Selection dots */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {Array.from({ length: Math.min(characters.length, 10) }).map((_, i) => {
            const isActive = i === selectedIndex % 10
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

interface CharacterPreviewProps {
  characterPath: string
  isActive: boolean
  size: number
}

const CharacterPreview = memo(function CharacterPreview({ 
  characterPath, 
  isActive,
  size 
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
