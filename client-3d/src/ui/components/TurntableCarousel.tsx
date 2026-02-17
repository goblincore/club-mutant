import { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react'
import { useDrag } from '@use-gesture/react'
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
const RADIUS = 220 // px

/**
 * CSS 3D Turntable Carousel with full body characters
 * Uses CSS transforms (GPU accelerated) with composited character previews
 */
export function TurntableCarousel({ 
  characters, 
  selectedIndex, 
  onSelect 
}: TurntableCarouselProps) {
  const [isDragging, setIsDragging] = useState(false)
  const autoRotateRef = useRef<NodeJS.Timeout | null>(null)
  const rotationRef = useRef(0)
  const targetRotationRef = useRef(0)
  const animationFrameRef = useRef<number>(0)
  
  // Calculate angle per character
  const anglePerChar = (Math.PI * 2) / Math.min(characters.length, 12)
  
  // Auto-rotate logic
  const startAutoRotate = useCallback(() => {
    if (autoRotateRef.current) clearInterval(autoRotateRef.current)
    
    autoRotateRef.current = setInterval(() => {
      if (!isDragging && characters.length > 1) {
        const nextIndex = (selectedIndex + 1) % characters.length
        onSelect(nextIndex)
      }
    }, AUTO_ROTATE_SPEED)
  }, [isDragging, characters.length, selectedIndex, onSelect])
  
  useEffect(() => {
    startAutoRotate()
    return () => {
      if (autoRotateRef.current) clearInterval(autoRotateRef.current)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [startAutoRotate])
  
  // Update target rotation when selectedIndex changes
  useEffect(() => {
    targetRotationRef.current = -(selectedIndex * anglePerChar)
  }, [selectedIndex, characters.length, anglePerChar])
  
  // Animation loop for smooth rotation
  useEffect(() => {
    const animate = () => {
      // Lerp towards target rotation
      const diff = targetRotationRef.current - rotationRef.current
      if (Math.abs(diff) > 0.001) {
        rotationRef.current += diff * 0.1
        // Trigger re-render
        setRotationState(rotationRef.current)
      }
      animationFrameRef.current = requestAnimationFrame(animate)
    }
    
    animationFrameRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [])
  
  // Force re-render state
  const [, setRotationState] = useState(0)
  
  // Drag gesture
  const bind = useDrag(({ movement: [x], down }) => {
    setIsDragging(down)
    
    if (down) {
      if (autoRotateRef.current) clearInterval(autoRotateRef.current)
      rotationRef.current = targetRotationRef.current + x * 0.005
      setRotationState(rotationRef.current)
    } else {
      const charOffset = Math.round((rotationRef.current - targetRotationRef.current) / anglePerChar)
      let newIndex = selectedIndex - charOffset
      newIndex = ((newIndex % characters.length) + characters.length) % characters.length
      
      onSelect(newIndex)
      setTimeout(startAutoRotate, 1000)
    }
  }, {
    axis: 'x',
    bounds: { left: -300, right: 300 },
    rubberband: true,
  })
  
  if (characters.length === 0) return null
  
  // Calculate visible characters (show 7 at a time)
  const visibleCount = Math.min(7, characters.length)
  const halfVisible = Math.floor(visibleCount / 2)
  
  const visibleCharacters = []
  for (let i = -halfVisible; i <= halfVisible; i++) {
    const index = ((selectedIndex + i + characters.length) % characters.length)
    const angle = (i / characters.length) * Math.PI * 2
    visibleCharacters.push({
      character: characters[index],
      index,
      offset: i,
      angle,
    })
  }
  
  return (
    <div 
      className="relative w-full h-80 cursor-grab active:cursor-grabbing"
      style={{ perspective: '1000px' }}
      {...bind()}
    >
      <div 
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateY(${rotationRef.current}rad)`,
        }}
      >
        {visibleCharacters.map(({ character, index, offset, angle }) => {
          const isCenter = offset === 0
          const x = Math.sin(angle) * RADIUS
          const z = Math.cos(angle) * RADIUS - RADIUS
          const scale = isCenter ? 1.3 : 0.85 - Math.abs(offset) * 0.08
          const opacity = isCenter ? 1 : 0.4 - Math.abs(offset) * 0.08
          
          return (
            <div
              key={`${character.id}-${offset}`}
              className="absolute flex flex-col items-center"
              style={{
                transform: `
                  translateX(${x}px) 
                  translateZ(${z}px)
                  scale(${scale})
                `,
                opacity: Math.max(0.15, opacity),
                zIndex: isCenter ? 10 : 5 - Math.abs(offset),
                transition: isDragging ? 'none' : 'opacity 0.3s ease',
                filter: isCenter ? 'drop-shadow(0 0 20px rgba(57, 255, 20, 0.6))' : 'none',
              }}
              onClick={() => {
                if (!isDragging && !isCenter) {
                  onSelect(index)
                }
              }}
            >
              <CharacterPreview 
                characterPath={character.path}
                isActive={isCenter}
                size={isCenter ? 140 : 100}
              />
            </div>
          )
        })}
      </div>
      
      {/* Floor reflection */}
      <div 
        className="absolute bottom-8 left-1/2 -translate-x-1/2 w-96 h-px opacity-30"
        style={{
          background: 'linear-gradient(90deg, transparent, #39ff14, transparent)',
        }}
      />
      
      {/* Selection dots */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
        {Array.from({ length: Math.min(characters.length, 8) }).map((_, i) => {
          const isActive = i === selectedIndex % 8
          return (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: isActive ? '#39ff14' : 'rgba(255,255,255,0.3)',
                transform: isActive ? 'scale(1.3)' : 'scale(1)',
                transition: 'all 0.3s ease',
              }}
            />
          )
        })}
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
    
    // Frame skip: animate every 2nd frame for performance
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
