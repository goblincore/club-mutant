import { useRef, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { Text } from '@react-three/drei'
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

// --- Speech bubble constants ---
const CAROUSEL_PHRASES = [
  'Pick me!', "I'm cute", "I'm cuter", 'Choose me!',
  'Over here!', 'Hey!', 'Me! Me!', 'Look at me!',
  '...', 'Yo!', '*waves*', 'Hi!', 'Hiii~',
]
const BUBBLE_SHOW_DURATION = 3000 // ms a bubble stays visible
const BUBBLE_FADE_MS = 600 // ms for shrink-out at end
const BUBBLE_MIN_INTERVAL = 2000 // min ms between any bubble appearing
const BUBBLE_MAX_INTERVAL = 5000 // max ms between bubbles
const BUBBLE_Y_OFFSET = 1.6 // world units above character ground
const CB_PAD_X = 0.08
const CB_PAD_Y = 0.06
const CB_RADIUS = 0.07
const CB_FONT_SIZE = 0.16

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
      <spriteMaterial transparent opacity={0.001} depthWrite={false} />
    </sprite>
  )
}

// ─── Speech bubble geometry helpers ──────────────────────────────────

const carouselBubbleMat = new THREE.MeshBasicMaterial({ color: 0xffffff })

const carouselTailGeo = (() => {
  const s = new THREE.Shape()
  s.moveTo(-0.03, 0)
  s.lineTo(0.03, 0)
  s.lineTo(0, -0.06)
  s.closePath()
  return new THREE.ShapeGeometry(s)
})()

function makeRoundedRect(w: number, h: number, r: number): THREE.ShapeGeometry {
  r = Math.min(r, w / 2, h / 2)
  const shape = new THREE.Shape()
  const hw = w / 2
  const hh = h / 2

  shape.moveTo(-hw + r, -hh)
  shape.lineTo(hw - r, -hh)
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r)
  shape.lineTo(hw, hh - r)
  shape.quadraticCurveTo(hw, hh, hw - r, hh)
  shape.lineTo(-hw + r, hh)
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r)
  shape.lineTo(-hw, -hh + r)
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh)

  return new THREE.ShapeGeometry(shape)
}

// ─── Single 3D speech bubble above a character ──────────────────────

const _parentQuatInverse = new THREE.Quaternion()

function CarouselBubble({ text }: { text: string | null }) {
  const groupRef = useRef<THREE.Group>(null)
  const bgRef = useRef<THREE.Mesh>(null)
  const tailRef = useRef<THREE.Mesh>(null)
  const animRef = useRef(0)
  const showStartRef = useRef(0)
  const prevTextRef = useRef<string | null>(null)
  const bgBounds = useRef({ cx: 0, cy: 0, w: 0.1, h: 0.1 })

  // Reset animation when text changes
  if (text !== null && text !== prevTextRef.current) {
    animRef.current = 0
    showStartRef.current = Date.now()
  }
  prevTextRef.current = text

  useFrame(({ camera }) => {
    if (!groupRef.current) return

    if (!text) {
      groupRef.current.scale.setScalar(0)
      return
    }

    // Billboard: counter parent's world rotation so bubble always faces camera
    const parent = groupRef.current.parent
    if (parent) {
      parent.updateWorldMatrix(true, false)
      _parentQuatInverse.copy(parent.getWorldQuaternion(_parentQuatInverse)).invert()
      groupRef.current.quaternion.copy(_parentQuatInverse).multiply(camera.quaternion)
    } else {
      groupRef.current.quaternion.copy(camera.quaternion)
    }

    // Pop-in
    if (animRef.current < 1) {
      animRef.current = Math.min(1, animRef.current + 0.016 * 8) // ~8/sec
    }

    // Shrink-out in last BUBBLE_FADE_MS
    const elapsed = Date.now() - showStartRef.current
    const remaining = BUBBLE_SHOW_DURATION - elapsed
    const fadeScale = remaining < BUBBLE_FADE_MS
      ? Math.max(0, remaining / BUBBLE_FADE_MS)
      : 1

    const ease = 1 - (1 - animRef.current) * (1 - animRef.current)
    groupRef.current.scale.setScalar(ease * fadeScale)

    // Tail position (below the bg rect)
    if (tailRef.current) {
      const { cx, cy, h } = bgBounds.current
      tailRef.current.rotation.z = 0
      tailRef.current.position.set(cx, cy - h / 2, 0)
    }
  })

  const handleSync = useCallback((troika: THREE.Mesh) => {
    troika.geometry.computeBoundingBox()
    const bb = troika.geometry.boundingBox
    if (!bb || !bgRef.current) return

    const w = bb.max.x - bb.min.x + CB_PAD_X * 2
    const h = bb.max.y - bb.min.y + CB_PAD_Y * 2
    const cx = (bb.min.x + bb.max.x) / 2
    const cy = (bb.min.y + bb.max.y) / 2

    bgBounds.current = { cx, cy, w, h }
    bgRef.current.geometry.dispose()
    bgRef.current.geometry = makeRoundedRect(w, h, CB_RADIUS)
    bgRef.current.position.set(cx, cy, -0.003)
  }, [])

  if (!text) return null

  return (
    <group ref={groupRef} position={[0, BUBBLE_Y_OFFSET, 0]} scale={0}>
      <Text
        fontSize={CB_FONT_SIZE}
        maxWidth={1.0}
        color="#000000"
        anchorX="center"
        anchorY="bottom"
        textAlign="center"
        font="/fonts/courier-prime.woff"
        onSync={handleSync}
      >
        {text}
      </Text>

      <mesh ref={bgRef} material={carouselBubbleMat}>
        <planeGeometry args={[0.1, 0.1]} />
      </mesh>

      <mesh ref={tailRef} geometry={carouselTailGeo} material={carouselBubbleMat} />
    </group>
  )
}

// ─── Bubble scheduler: randomly shows phrases on characters ─────────

function useBubbleScheduler(characterCount: number): (string | null)[] {
  const [bubbles, setBubbles] = useState<(string | null)[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (characterCount === 0) return
    setBubbles(new Array(characterCount).fill(null))

    const schedule = () => {
      const charIdx = Math.floor(Math.random() * characterCount)
      const phrase = CAROUSEL_PHRASES[Math.floor(Math.random() * CAROUSEL_PHRASES.length)]

      setBubbles(prev => {
        const next = [...prev]
        next[charIdx] = phrase
        return next
      })

      // Clear after duration
      setTimeout(() => {
        setBubbles(prev => {
          const next = [...prev]
          next[charIdx] = null
          return next
        })
      }, BUBBLE_SHOW_DURATION)

      // Schedule next bubble
      const delay = BUBBLE_MIN_INTERVAL + Math.random() * (BUBBLE_MAX_INTERVAL - BUBBLE_MIN_INTERVAL)
      timerRef.current = setTimeout(schedule, delay)
    }

    // Start first bubble after a short delay
    timerRef.current = setTimeout(schedule, 1000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [characterCount])

  return bubbles
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
  const bubbleTexts = useBubbleScheduler(characters.length)

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
          <PaperDoll characterPath={char.path} animationName={i === selectedIndex ? 'walk' : 'idle'} />
          <ClickSprite onClick={() => { if (i !== selectedIndexRef.current) onSelect(i) }} />
          <CarouselBubble text={bubbleTexts[i] ?? null} />
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
        <PaperDoll characterPath={character.path} animationName="walk" />
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

  // Reset cursor when component unmounts
  useEffect(() => {
    return () => { document.body.style.cursor = 'default' }
  }, [])

  const selectedChar = characters[selectedIndex]

  if (characters.length === 0) return null

  return (
    <div className="relative w-full h-full">
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
