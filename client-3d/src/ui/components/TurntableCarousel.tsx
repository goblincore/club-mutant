import { useRef, useEffect, useState, useMemo } from 'react'
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
const RADIUS = 2.2 // ring radius in world units
const AUTO_SPEED = 0.10 // radians/sec (~5.7 deg/s, full rotation ~63s)
const SNAP_LERP = 8 // exponential approach factor
const SNAP_THRESHOLD = 0.003 // rad — close enough to snap
const RESUME_DELAY = 5000 // ms before auto-rotate resumes after user input
const LOGO_Y = 0.85 // logo center height in world units
const LOGO_SCALE = 2.0 // logo sprite scale

function shortestAngleDiff(from: number, to: number): number {
  return ((to - from) % TWO_PI + TWO_PI + Math.PI) % TWO_PI - Math.PI
}

// ─── Logo sprite at ring center ─────────────────────────────────────

function LogoSprite() {
  const texture = useLoader(THREE.TextureLoader, '/logo/ver1.png')
  const aspect = texture.image ? texture.image.width / texture.image.height : 1

  return (
    <sprite position={[0, LOGO_Y, 0]} scale={[LOGO_SCALE * aspect, LOGO_SCALE, 1]} renderOrder={-1}>
      <spriteMaterial map={texture} transparent depthWrite depthTest alphaTest={0.5} />
    </sprite>
  )
}

// ─── Invisible click sprite per character (always faces camera) ─────

function ClickSprite({ onClick }: { onClick: () => void }) {
  return (
    <sprite
      position={[0, 0.55, 0]}
      scale={[1.2, 1.6, 1]}
      onClick={onClick}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = 'default' }}
    >
      <spriteMaterial transparent opacity={0} depthWrite={false} />
    </sprite>
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
  selectedIndexRef: React.MutableRefObject<number>
}

function CarouselScene({
  characters,
  selectedIndex,
  onSelect,
  angleRef,
  targetAngleRef,
  autoResumeTsRef,
  selectedIndexRef,
}: CarouselSceneProps) {
  const N = characters.length
  const angleStep = TWO_PI / N
  const groupRefs = useRef<(THREE.Group | null)[]>([])

  // Camera setup — look down at the ring from above
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(0, 5, 5.5)
    camera.lookAt(0, 0.6, 0)
    camera.updateProjectionMatrix()
  }, [camera])

  useFrame((_, delta) => {
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
      group.lookAt(0, 0, 0)
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
          <ClickSprite onClick={() => { if (i !== selectedIndexRef.current) onSelect(i) }} />
        </group>
      ))}

      <LogoSprite />
    </>
  )
}

// ─── Glow layer: renders ONLY the selected character with CSS drop-shadow ──

function GlowScene({
  character,
  angleRef,
  selectedIndex,
  characterCount,
}: {
  character: CharacterEntry
  angleRef: React.MutableRefObject<number>
  selectedIndex: number
  characterCount: number
}) {
  const groupRef = useRef<THREE.Group>(null)
  const angleStep = TWO_PI / characterCount

  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(0, 5, 5.5)
    camera.lookAt(0, 0.6, 0)
    camera.updateProjectionMatrix()
  }, [camera])

  useFrame(() => {
    if (!groupRef.current) return
    const charAngle = angleRef.current + selectedIndex * angleStep
    const x = Math.sin(charAngle) * RADIUS
    const z = Math.cos(charAngle) * RADIUS
    groupRef.current.position.set(x, 0, z)
    groupRef.current.lookAt(0, 0, 0)
  })

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[2, 5, 3]} intensity={0.5} />
      <group ref={groupRef}>
        <PaperDoll characterPath={character.path} />
      </group>
    </>
  )
}

// ─── Pulsating glow filter driver ────────────────────────────────────

function useGlowFilter(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf: number
    const update = () => {
      const t = performance.now() * 0.003
      const pulse = 0.5 + 0.5 * Math.sin(t)
      const inner = 6 + pulse * 6        // tight inner glow: 6–12px
      const mid = 12 + pulse * 8          // mid glow: 12–20px
      const outer = 20 + pulse * 12       // wide outer glow: 20–32px
      // Three stacked drop-shadows for an intense, thick glowing outline
      el.style.filter =
        `drop-shadow(0 0 ${inner}px rgba(160, 190, 255, ${0.9 + pulse * 0.1})) ` +
        `drop-shadow(0 0 ${mid}px rgba(120, 160, 255, ${0.7 + pulse * 0.3})) ` +
        `drop-shadow(0 0 ${outer}px rgba(80, 130, 255, ${0.5 + pulse * 0.3}))`
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [ref])
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
  const selectedIndexRef = useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex

  const glowDivRef = useRef<HTMLDivElement>(null)
  useGlowFilter(glowDivRef)

  // --- Selection sync: when parent changes selectedIndex, set snap target ---
  useEffect(() => {
    if (characters.length === 0) return
    const target = -(selectedIndex * TWO_PI / characters.length)
    targetAngleRef.current = target
    autoResumeTsRef.current = performance.now() + RESUME_DELAY
  }, [selectedIndex, characters.length])

  // Initialize angle on first mount
  useEffect(() => {
    if (characters.length === 0) return
    angleRef.current = -(selectedIndex * TWO_PI / characters.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters.length > 0])

  const [isHovered, setIsHovered] = useState(false)

  const selectedChar = characters[selectedIndex]

  if (characters.length === 0) return null

  return (
    <div
      className="relative w-full h-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* "Choose a character!" speech bubble tooltip */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-30 transition-all duration-300"
        style={{
          top: '28%',
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

      {/* Canvas stack — fills available parent height */}
      <div className="w-full relative h-full">
        {/* Glow layer — renders only selected character with CSS drop-shadow outline */}
        {selectedChar && (
          <div
            ref={glowDivRef}
            className="absolute inset-0 pointer-events-none z-10"
          >
            <Canvas
              orthographic
              camera={{ position: [0, 5, 5.5], zoom: 120, near: 0.1, far: 100 }}
              dpr={0.5}
              gl={{ alpha: true, antialias: false }}
              style={{ background: 'transparent', pointerEvents: 'none' }}
              onCreated={({ gl }) => {
                gl.setClearColor(0x000000, 0)
                gl.domElement.style.pointerEvents = 'none'
              }}
            >
              <GlowScene
                key={selectedChar.id}
                character={selectedChar}
                angleRef={angleRef}
                selectedIndex={selectedIndex}
                characterCount={characters.length}
              />
            </Canvas>
          </div>
        )}

        {/* Main carousel canvas */}
        <Canvas
          orthographic
          camera={{ position: [0, 5, 5.5], zoom: 120, near: 0.1, far: 100 }}
          dpr={0.75}
          gl={{ alpha: true, antialias: false }}
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
            selectedIndexRef={selectedIndexRef}
          />
        </Canvas>
      </div>
    </div>
  )
}
