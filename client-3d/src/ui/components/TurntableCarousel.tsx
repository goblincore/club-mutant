import { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useDrag } from '@use-gesture/react'
import * as THREE from 'three'
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
const RADIUS = 3.5

/**
 * Three.js-based 3D Turntable Carousel
 * Much more performant than CSS transforms - everything runs on GPU
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
  
  // Auto-rotate logic
  const startAutoRotate = useCallback(() => {
    if (autoRotateRef.current) clearInterval(autoRotateRef.current)
    
    autoRotateRef.current = setInterval(() => {
      if (!isDragging && characters.length > 1) {
        const nextIndex = (selectedIndex + 1) % characters.length
        onSelect(nextIndex)
        targetRotationRef.current = -(nextIndex * (Math.PI * 2 / characters.length))
      }
    }, AUTO_ROTATE_SPEED)
  }, [isDragging, characters.length, selectedIndex, onSelect])
  
  useEffect(() => {
    startAutoRotate()
    return () => {
      if (autoRotateRef.current) clearInterval(autoRotateRef.current)
    }
  }, [startAutoRotate])
  
  // Update target rotation when selectedIndex changes
  useEffect(() => {
    targetRotationRef.current = -(selectedIndex * (Math.PI * 2 / characters.length))
  }, [selectedIndex, characters.length])
  
  // Drag gesture
  const bind = useDrag(({ movement: [x], down }) => {
    setIsDragging(down)
    
    if (down) {
      if (autoRotateRef.current) clearInterval(autoRotateRef.current)
      // Direct control during drag
      rotationRef.current = targetRotationRef.current + x * 0.01
    } else {
      // Release - snap to nearest character
      const anglePerChar = (Math.PI * 2) / characters.length
      const charOffset = Math.round((rotationRef.current - targetRotationRef.current) / anglePerChar)
      let newIndex = selectedIndex - charOffset
      newIndex = ((newIndex % characters.length) + characters.length) % characters.length
      
      onSelect(newIndex)
      setTimeout(startAutoRotate, 1000)
    }
  }, {
    axis: 'x',
    bounds: { left: -200, right: 200 },
    rubberband: true,
  })
  
  if (characters.length === 0) return null
  
  return (
    <div 
      className="relative w-full h-64 cursor-grab active:cursor-grabbing"
      {...bind()}
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        gl={{ antialias: false, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} intensity={0.5} />
        <CarouselGroup
          characters={characters}
          selectedIndex={selectedIndex}
          rotationRef={rotationRef}
          targetRotationRef={targetRotationRef}
          onSelect={onSelect}
          isDragging={isDragging}
        />
      </Canvas>
      
      {/* Name label below canvas */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center">
        <span 
          className="text-sm font-mono"
          style={{
            color: '#39ff14',
            textShadow: '0 0 10px rgba(57, 255, 20, 0.5)',
          }}
        >
          {characters[selectedIndex]?.name}
        </span>
      </div>
      
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

interface CarouselGroupProps {
  characters: CharacterEntry[]
  selectedIndex: number
  rotationRef: React.MutableRefObject<number>
  targetRotationRef: React.MutableRefObject<number>
  onSelect: (index: number) => void
  isDragging: boolean
}

function CarouselGroup({ 
  characters, 
  selectedIndex, 
  rotationRef, 
  targetRotationRef,
}: CarouselGroupProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { viewport } = useThree()
  
  // Smooth rotation animation
  useFrame(() => {
    if (!groupRef.current) return
    
    // Lerp towards target rotation
    const diff = targetRotationRef.current - rotationRef.current
    rotationRef.current += diff * 0.08
    
    groupRef.current.rotation.y = rotationRef.current
  })
  
  // Calculate positions for visible characters only (show 7 at a time)
  const visibleCount = Math.min(7, characters.length)
  const halfVisible = Math.floor(visibleCount / 2)
  
  const visibleCharacters = useMemo(() => {
    const result = []
    for (let i = -halfVisible; i <= halfVisible; i++) {
      const index = ((selectedIndex + i + characters.length) % characters.length)
      result.push({
        character: characters[index],
        index,
        offset: i,
        angle: (i / characters.length) * Math.PI * 2,
      })
    }
    return result
  }, [characters, selectedIndex, halfVisible])
  
  return (
    <group ref={groupRef}>
      {visibleCharacters.map(({ character, index, offset, angle }) => {
        const isCenter = offset === 0
        const x = Math.sin(angle) * RADIUS
        const z = Math.cos(angle) * RADIUS - RADIUS
        const scale = isCenter ? 1.2 : 0.8 - Math.abs(offset) * 0.1
        const opacity = isCenter ? 1 : 0.5 - Math.abs(offset) * 0.1
        
        return (
          <CharacterCard
            key={`${character.id}-${index}`}
            character={character}
            position={[x, 0, z]}
            scale={scale}
            opacity={Math.max(0.2, opacity)}
            isCenter={isCenter}
          />
        )
      })}
      
      {/* Floor reflection */}
      <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 8]} />
        <meshBasicMaterial 
          color={0x39ff14} 
          transparent 
          opacity={0.05}
        />
      </mesh>
    </group>
  )
}

interface CharacterCardProps {
  character: CharacterEntry
  position: [number, number, number]
  scale: number
  opacity: number
  isCenter: boolean
}

function CharacterCard({ character, position, scale, opacity, isCenter }: CharacterCardProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  
  // Load character texture
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    loader.load(
      `${character.path}/head.png`,
      (tex) => {
        tex.minFilter = THREE.NearestFilter
        tex.magFilter = THREE.NearestFilter
        setTexture(tex)
      },
      undefined,
      () => {
        // Try body if head fails
        loader.load(
          `${character.path}/body.png`,
          (tex) => {
            tex.minFilter = THREE.NearestFilter
            tex.magFilter = THREE.NearestFilter
            setTexture(tex)
          }
        )
      }
    )
  }, [character.path])
  
  // Bobbing animation for center character
  useFrame(({ clock }) => {
    if (!meshRef.current || !isCenter) return
    meshRef.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * 2) * 0.1
  })
  
  if (!texture) {
    return (
      <mesh position={position}>
        <boxGeometry args={[1, 1, 0.1]} />
        <meshBasicMaterial color={0x333333} />
      </mesh>
    )
  }
  
  return (
    <mesh 
      ref={meshRef}
      position={position}
      scale={[scale, scale, scale]}
    >
      <planeGeometry args={[1.5, 1.5]} />
      <meshBasicMaterial 
        map={texture}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
      />
      
      {/* Glow effect for center */}
      {isCenter && (
        <mesh position={[0, 0, -0.05]} scale={[1.3, 1.3, 1]}>
          <planeGeometry args={[1.5, 1.5]} />
          <meshBasicMaterial 
            color={0x39ff14}
            transparent
            opacity={0.2}
          />
        </mesh>
      )}
    </mesh>
  )
}

/**
 * Fallback CSS-based character preview (kept for compatibility)
 */
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
