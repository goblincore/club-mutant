import { useRef, useEffect, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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
  onReady?: () => void
}

// --- Constants ---
const TWO_PI = Math.PI * 2
const RADIUS = 2.2 // ring radius in world units
const AUTO_SPEED = 0.10 // radians/sec (~5.7 deg/s, full rotation ~63s)
const SNAP_LERP = 8 // exponential approach factor
const SNAP_THRESHOLD = 0.003 // rad — close enough to snap
const RESUME_DELAY = 5000 // ms before auto-rotate resumes after user input
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
const GLOW_WIDTH = 1.2 // glow sprite width (character-width capsule)
const GLOW_HEIGHT = 2.4 // glow sprite height (character-height capsule)
const GLOW_PULSE_SPEED = 0.003 // sine wave speed for glow pulse

function shortestAngleDiff(from: number, to: number): number {
  return ((to - from) % TWO_PI + TWO_PI + Math.PI) % TWO_PI - Math.PI
}

// ─── Glow behind selected character (radial gradient texture) ────────

// Character-shaped capsule glow: tall ellipse with sharp falloff
const _glowTexture = (() => {
  const w = 128
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Draw a capsule/ellipse shape with tight falloff
  // Use elliptical gradient by scaling the canvas context
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.scale(1, h / w) // stretch vertically
  // Tight inner glow
  const g1 = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2)
  g1.addColorStop(0, 'rgba(200, 230, 255, 1.0)')
  g1.addColorStop(0.3, 'rgba(120, 180, 255, 0.95)')
  g1.addColorStop(0.6, 'rgba(80, 140, 255, 0.6)')
  g1.addColorStop(0.8, 'rgba(50, 100, 255, 0.2)')
  g1.addColorStop(1, 'rgba(30, 60, 255, 0)')
  ctx.fillStyle = g1
  ctx.fillRect(-w / 2, -w / 2, w, w) // fills the scaled circle
  ctx.restore()

  // Add a hot bright core center (upper body area)
  ctx.save()
  ctx.translate(w / 2, h * 0.4) // slightly above center
  ctx.scale(1, 1.2)
  const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.25)
  g2.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
  g2.addColorStop(0.4, 'rgba(180, 220, 255, 0.5)')
  g2.addColorStop(1, 'rgba(100, 160, 255, 0)')
  ctx.fillStyle = g2
  ctx.fillRect(-w * 0.25, -w * 0.25, w * 0.5, w * 0.5)
  ctx.restore()

  const tex = new THREE.CanvasTexture(canvas)
  return tex
})()

function SelectionGlow({ isSelected }: { isSelected: boolean }) {
  const meshRef = useRef<THREE.Sprite>(null)

  useFrame(() => {
    if (!meshRef.current) return
    if (!isSelected) {
      meshRef.current.visible = false
      return
    }
    meshRef.current.visible = true
    const t = performance.now() * GLOW_PULSE_SPEED
    const pulse = 0.92 + 0.08 * Math.sin(t)
    meshRef.current.scale.set(GLOW_WIDTH * pulse, GLOW_HEIGHT * pulse, 1)
    const mat = meshRef.current.material as THREE.SpriteMaterial
    mat.opacity = 0.85 + 0.15 * Math.sin(t)
  })

  return (
    <sprite ref={meshRef} position={[0, 0.55, -0.15]} renderOrder={-2}>
      <spriteMaterial
        map={_glowTexture}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
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

// ─── Rounded-rect geometry cache (keyed by quantized w×h) ───────────

const _roundedRectCache = new Map<string, THREE.ShapeGeometry>()

function getCachedRoundedRect(w: number, h: number, r: number): THREE.ShapeGeometry {
  const qw = Math.round(w * 100) / 100
  const qh = Math.round(h * 100) / 100
  const key = `${qw}_${qh}`
  let geo = _roundedRectCache.get(key)
  if (!geo) {
    geo = makeRoundedRect(qw, qh, r)
    _roundedRectCache.set(key, geo)
  }
  return geo
}

// ─── Single 3D speech bubble above a character ──────────────────────

const _parentQuatInverse = new THREE.Quaternion()

function CarouselBubble({ textRef, index }: { textRef: React.MutableRefObject<(string | null)[]>; index: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const bgRef = useRef<THREE.Mesh>(null)
  const tailRef = useRef<THREE.Mesh>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const troikaRef = useRef<any>(null)
  const animRef = useRef(0)
  const showStartRef = useRef(0)
  const bgBounds = useRef({ cx: 0, cy: 0, w: 0.1, h: 0.1 })
  const prevTextRef = useRef<string | null>(null)
  const activeTextRef = useRef<string | null>(null)

  useFrame(({ camera }) => {
    if (!groupRef.current) return

    const text = textRef.current[index] ?? null

    // Track text changes — update troika imperatively (no useState, no React re-render)
    if (text !== prevTextRef.current) {
      if (text !== null) {
        animRef.current = 0
        showStartRef.current = Date.now()
        activeTextRef.current = text
        // Imperatively update troika text — avoids React reconciliation inside Canvas
        if (troikaRef.current) {
          troikaRef.current.text = text
          troikaRef.current.sync(() => handleSync(troikaRef.current))
        }
      }
      // When text goes null, keep showing current text during fade-out
      prevTextRef.current = text
    }

    // When text is null and animation is done, hide
    if (!text && animRef.current <= 0) {
      groupRef.current.scale.setScalar(0)
      if (activeTextRef.current !== null) {
        activeTextRef.current = null
        // Clear troika text imperatively
        if (troikaRef.current) {
          troikaRef.current.text = ''
          troikaRef.current.sync()
        }
      }
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
    if (w < 0.02 || h < 0.02) return // skip degenerate bounds from empty text

    const cx = (bb.min.x + bb.max.x) / 2
    const cy = (bb.min.y + bb.max.y) / 2

    bgBounds.current = { cx, cy, w, h }
    bgRef.current.geometry = getCachedRoundedRect(w, h, CB_RADIUS)
    bgRef.current.position.set(cx, cy, -0.003)
  }, [])

  return (
    <group ref={groupRef} position={[0, BUBBLE_Y_OFFSET, 0]} scale={0}>
      <Text
        ref={troikaRef}
        fontSize={CB_FONT_SIZE}
        maxWidth={1.0}
        color="#000000"
        anchorX="center"
        anchorY="bottom"
        textAlign="center"
        font="/fonts/courier-prime.woff"
        onSync={handleSync}
      >{''}</Text>

      <mesh ref={bgRef} material={carouselBubbleMat}>
        <planeGeometry args={[0.1, 0.1]} />
      </mesh>

      <mesh ref={tailRef} geometry={carouselTailGeo} material={carouselBubbleMat} />
    </group>
  )
}

// ─── Bubble scheduler: randomly shows phrases on characters (ref-based, no re-renders) ─

function useBubbleScheduler(characterCount: number): React.MutableRefObject<(string | null)[]> {
  const bubblesRef = useRef<(string | null)[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (characterCount === 0) return
    bubblesRef.current = new Array(characterCount).fill(null)

    const schedule = () => {
      const charIdx = Math.floor(Math.random() * characterCount)
      const phrase = CAROUSEL_PHRASES[Math.floor(Math.random() * CAROUSEL_PHRASES.length)]

      bubblesRef.current[charIdx] = phrase

      // Clear after duration
      setTimeout(() => {
        bubblesRef.current[charIdx] = null
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

  return bubblesRef
}

// ─── Readiness probe: fires onReady after N rendered frames WITH characters present ──

function ReadinessProbe({ onReady, hasCharacters }: { onReady?: () => void; hasCharacters: boolean }) {
  const frameCount = useRef(0)
  const fired = useRef(false)

  useFrame(() => {
    if (fired.current || !onReady) return
    // Only start counting once characters have loaded into the scene
    if (!hasCharacters) return
    frameCount.current++
    // Wait a few frames so PaperDoll textures resolve and render
    if (frameCount.current >= 4) {
      fired.current = true
      onReady()
    }
  })

  return null
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
  onReady?: () => void
}

function CarouselScene({
  characters,
  selectedIndex,
  onSelect,
  angleRef,
  targetAngleRef,
  autoResumeTsRef,
  selectedIndexRef,
  onReady,
}: CarouselSceneProps) {
  const N = characters.length
  const angleStep = TWO_PI / N
  const groupRefs = useRef<(THREE.Group | null)[]>([])
  const bubblesRef = useBubbleScheduler(characters.length)

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
          <SelectionGlow isSelected={i === selectedIndex} />
          <ClickSprite onClick={() => { if (i !== selectedIndexRef.current) onSelect(i) }} />
          <CarouselBubble textRef={bubblesRef} index={i} />
        </group>
      ))}

      <ReadinessProbe onReady={onReady} hasCharacters={characters.length > 0} />
    </>
  )
}

// ─── Main exported component ─────────────────────────────────────────

export function TurntableCarousel({
  characters,
  selectedIndex,
  onSelect,
  onReady,
}: TurntableCarouselProps) {
  // --- Refs for animation (no React state in the hot path) ---
  const angleRef = useRef(0)
  const targetAngleRef = useRef<number | null>(null)
  const autoResumeTsRef = useRef(0)
  const selectedIndexRef = useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex


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

  return (
    <div className="relative w-full h-full">
      <Canvas
        orthographic
        camera={{ position: [0, 5, 5.5], zoom: 120, near: 0.1, far: 100 }}
        dpr={0.75}
        gl={{ alpha: true, antialias: false }}
        style={{ background: 'transparent' }}
        resize={{ offsetSize: true }}
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
          onReady={onReady}
        />
      </Canvas>
    </div>
  )
}
