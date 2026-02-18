import { useRef, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import * as THREE from 'three'

import { PaperDoll } from '../../character/PaperDoll'

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
const RADIUS = 2.5 // ring radius in world units
const AUTO_SPEED = 0.10 // radians/sec (~5.7 deg/s, full rotation ~63s)
const SNAP_LERP = 8 // exponential approach factor
const SNAP_THRESHOLD = 0.003 // rad — close enough to snap
const RESUME_DELAY = 5000 // ms before auto-rotate resumes after user input
const LOGO_Y = 1.2 // logo center height in world units
const LOGO_SCALE = 2.0 // logo sprite scale

function shortestAngleDiff(from: number, to: number): number {
  return ((to - from) % TWO_PI + TWO_PI + Math.PI) % TWO_PI - Math.PI
}

// ─── Logo sprite at ring center ─────────────────────────────────────

function LogoSprite() {
  const texture = useLoader(THREE.TextureLoader, '/logo/ver1.png')
  const aspect = texture.image ? texture.image.width / texture.image.height : 1

  return (
    <sprite position={[0, LOGO_Y, 0]} scale={[LOGO_SCALE * aspect, LOGO_SCALE, 1]}>
      <spriteMaterial map={texture} transparent />
    </sprite>
  )
}

// ─── Glow ring for selected character ────────────────────────────────

function GlowRing({ intensity }: { intensity: number }) {
  const ref = useRef<THREE.Mesh>(null!)
  const mat = useRef<THREE.MeshBasicMaterial>(null!)

  useFrame(() => {
    if (mat.current) {
      mat.current.opacity = intensity * 0.4
    }
  })

  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={0.02}>
      <ringGeometry args={[0.5, 0.9, 32]} />
      <meshBasicMaterial
        ref={mat}
        color="#aaaaff"
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

// ─── Invisible click plane per character ─────────────────────────────

function ClickPlane({ onClick }: { onClick: () => void }) {
  return (
    <mesh onClick={onClick} visible={false}>
      <planeGeometry args={[1.5, 2]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  )
}

// ─── Inner scene: characters on a ring ───────────────────────────────

interface CarouselSceneProps {
  characters: CharacterEntry[]
  selectedIndex: number
  onSelect: (index: number) => void
  angleRef: React.MutableRefObject<number>
  targetAngleRef: React.MutableRefObject<number | null>
  autoResumeTsRef: React.MutableRefObject<number>
  lastReportedIndexRef: React.MutableRefObject<number>
  isAutoRotateSelectRef: React.MutableRefObject<boolean>
  selectedIndexRef: React.MutableRefObject<number>
}

function CarouselScene({
  characters,
  selectedIndex,
  onSelect,
  angleRef,
  targetAngleRef,
  autoResumeTsRef,
  lastReportedIndexRef,
  isAutoRotateSelectRef,
  selectedIndexRef,
}: CarouselSceneProps) {
  const N = characters.length
  const angleStep = TWO_PI / N
  const groupRefs = useRef<(THREE.Group | null)[]>([])
  const glowRef = useRef(0)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Camera setup — look down at the ring from above
  const { camera } = useThree()
  useEffect(() => {
    // Position camera for a tilted top-down view
    camera.position.set(0, 5, 5.5)
    camera.lookAt(0, 0.3, 0)
    camera.updateProjectionMatrix()
  }, [camera])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    const now = performance.now()

    // --- Update angle ---
    if (targetAngleRef.current !== null) {
      const diff = shortestAngleDiff(angleRef.current, targetAngleRef.current)
      if (Math.abs(diff) < SNAP_THRESHOLD) {
        angleRef.current = targetAngleRef.current
        targetAngleRef.current = null
      } else {
        angleRef.current += diff * SNAP_LERP * dt
      }
    } else if (now > autoResumeTsRef.current) {
      angleRef.current += AUTO_SPEED * dt
    }

    // --- Position all characters on the ring ---
    for (let i = 0; i < N; i++) {
      const group = groupRefs.current[i]
      if (!group) continue

      const charAngle = angleRef.current + i * angleStep
      const x = Math.sin(charAngle) * RADIUS
      const z = Math.cos(charAngle) * RADIUS

      group.position.set(x, 0, z)
      // Face the character toward center
      group.lookAt(0, 0, 0)
    }

    // --- Pulsating glow ---
    glowRef.current = 0.6 + 0.4 * Math.sin(now * 0.003)

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
        isAutoRotateSelectRef.current = true
        onSelectRef.current(bestI)
      }
    }
  })

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[2, 5, 3]} intensity={0.5} />

      {characters.map((char, i) => (
        <group
          key={char.id}
          ref={(el) => { groupRefs.current[i] = el }}
        >
          <PaperDoll characterPath={char.path} />
          <ClickPlane onClick={() => { if (i !== selectedIndexRef.current) onSelect(i) }} />
          {i === selectedIndex && <GlowRing intensity={glowRef.current} />}
        </group>
      ))}

      <LogoSprite />
    </>
  )
}

// ─── Main exported component ─────────────────────────────────────────

export function TurntableCarousel({
  characters,
  selectedIndex,
  onSelect,
}: TurntableCarouselProps) {
  // --- Refs for animation (no React state in the hot path) ---
  const angleRef = useRef(0)
  const targetAngleRef = useRef<number | null>(null)
  const autoResumeTsRef = useRef(0)
  const lastReportedIndexRef = useRef(-1)
  const isAutoRotateSelectRef = useRef(false)
  const selectedIndexRef = useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex

  // --- Selection sync: when parent changes selectedIndex, set snap target ---
  useEffect(() => {
    if (characters.length === 0) return
    if (isAutoRotateSelectRef.current) {
      isAutoRotateSelectRef.current = false
      return
    }
    const target = -(selectedIndex * TWO_PI / characters.length)
    targetAngleRef.current = target
    autoResumeTsRef.current = performance.now() + RESUME_DELAY
  }, [selectedIndex, characters.length])

  // Initialize angle on first mount
  useEffect(() => {
    if (characters.length === 0) return
    angleRef.current = -(selectedIndex * TWO_PI / characters.length)
    lastReportedIndexRef.current = selectedIndex
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters.length > 0])

  const [isHovered, setIsHovered] = useState(false)

  if (characters.length === 0) return null

  return (
    <div
      className="relative w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* "Choose a character!" speech bubble tooltip */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-30 transition-all duration-300"
        style={{
          top: -8,
          opacity: isHovered ? 1 : 0,
          transform: `translateX(-50%) translateY(${isHovered ? 0 : 8}px)`,
        }}
      >
        <div
          className="relative px-5 py-2.5 rounded-2xl font-mono font-bold text-sm text-black whitespace-nowrap"
          style={{
            backgroundColor: 'white',
            boxShadow: '0 3px 12px rgba(0,0,0,0.25), 0 0 0 2px rgba(0,0,0,0.08)',
          }}
        >
          Choose a character!
          {/* Speech bubble tail */}
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              bottom: -10,
              width: 0,
              height: 0,
              borderLeft: '10px solid transparent',
              borderRight: '10px solid transparent',
              borderTop: '10px solid white',
            }}
          />
        </div>
      </div>

      {/* r3f Canvas — transparent background so WarpCheckBg shows through */}
      <div className="w-full" style={{ height: 400 }}>
        <Canvas
          orthographic
          camera={{ position: [0, 5, 5.5], zoom: 120, near: 0.1, far: 100 }}
          gl={{ alpha: true, antialias: true }}
          style={{ background: 'transparent' }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0)
          }}
        >
          <CarouselScene
            characters={characters}
            selectedIndex={selectedIndex}
            onSelect={onSelect}
            angleRef={angleRef}
            targetAngleRef={targetAngleRef}
            autoResumeTsRef={autoResumeTsRef}
            lastReportedIndexRef={lastReportedIndexRef}
            isAutoRotateSelectRef={isAutoRotateSelectRef}
            selectedIndexRef={selectedIndexRef}
          />
        </Canvas>
      </div>
    </div>
  )
}
