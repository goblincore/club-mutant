/**
 * AcsCharacter — R3F component for rendering ACS (Microsoft Agent) characters.
 *
 * Parallel to PaperDoll.tsx: renders a character as a textured plane in the 3D world.
 * ACS characters are pre-composited full-frame bitmaps (e.g., Bonzi = 320×256 RGBA)
 * with timer-based animation, probabilistic branching, and embedded sounds.
 *
 * Rendering pipeline:
 *   AcsFile (WASM) → renderFrame() → RGBA pixels → offscreen canvas → CanvasTexture → mesh
 *
 * Uses NearestFilter for PSX aesthetic consistency with PaperDoll.
 */

import { useRef, useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { loadAcsCharacterCached, getSharedAudioContext, type AcsCharacterData } from './AcsLoader'
import { AcsAnimationEngine, type AcsNpcState } from './AcsAnimationEngine'
import {
  createAcsWalkMaterial,
  updateAcsWalkUniforms,
  type AcsWalkUniforms,
} from './acsWalkShader'

// ── Constants ──

/** Target height in pixels — must match PaperDoll's TARGET_HEIGHT_PX for consistent scale. */
const TARGET_HEIGHT_PX = 110
const PX_SCALE = 0.01

/** Vertical subdivisions for walk distortion shader. */
const PLANE_SEGMENTS_Y = 8
const PLANE_SEGMENTS_X = 1

// ── Props ──

interface AcsCharacterProps {
  /** URL to the .acs file (e.g., "/npc/bonzi/Bonzi.acs"). */
  acsUrl: string
  /** NPC animation state from the server. */
  animationState?: AcsNpcState
  /** Mirror character horizontally. */
  flipX?: boolean
  /** Normalized movement speed (0..1). */
  speed?: number
  /** Whether the character is currently moving. */
  isMoving?: boolean
  /** Layout callback — same interface as PaperDoll for ChatBubble/Nametag positioning. */
  onLayout?: (layout: { worldHeight: number; headTopY: number; visualTopY: number }) => void
}

export function AcsCharacter({
  acsUrl,
  animationState = 'idle',
  flipX = false,
  speed = 0,
  isMoving = false,
  onLayout,
}: AcsCharacterProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const engineRef = useRef<AcsAnimationEngine | null>(null)
  const charDataRef = useRef<AcsCharacterData | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textureRef = useRef<THREE.CanvasTexture | null>(null)
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [charScale, setCharScale] = useState(1)

  // GainNode for per-character volume control
  const gainNodeRef = useRef<GainNode | null>(null)

  // ── Load ACS file ──
  useEffect(() => {
    let cancelled = false

    loadAcsCharacterCached(acsUrl).then((data) => {
      if (cancelled) return

      charDataRef.current = data

      // Create offscreen canvas matching character dimensions
      const canvas = document.createElement('canvas')
      canvas.width = data.width
      canvas.height = data.height
      canvasRef.current = canvas

      // Create CanvasTexture with pixelated filtering (PSX look)
      const texture = new THREE.CanvasTexture(canvas)
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.colorSpace = THREE.SRGBColorSpace
      texture.generateMipmaps = false
      textureRef.current = texture

      // Create walk distortion material
      const material = createAcsWalkMaterial(texture)
      materialRef.current = material

      // Create animation engine
      const engine = new AcsAnimationEngine(data)
      engineRef.current = engine

      // Compute scale to match PaperDoll height
      const scale = TARGET_HEIGHT_PX / data.height
      setCharScale(scale)

      // Report layout (approximate — ACS chars are rectangular)
      const worldHeight = TARGET_HEIGHT_PX * PX_SCALE
      if (onLayout) {
        onLayout({
          worldHeight,
          headTopY: worldHeight,      // Top of character
          visualTopY: worldHeight,    // Same for ACS (no hair overshoot)
        })
      }

      // Create audio gain node
      const audioCtx = getSharedAudioContext()
      const gainNode = audioCtx.createGain()
      gainNode.gain.value = 0.5
      gainNode.connect(audioCtx.destination)
      gainNodeRef.current = gainNode

      // Render initial frame
      const frame = engine.renderFrame()
      if (frame) {
        const ctx = canvas.getContext('2d')!
        const imgData = new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.putImageData(imgData, 0, 0)
        texture.needsUpdate = true
      }

      setLoaded(true)
    }).catch((err) => {
      console.error('[AcsCharacter] Failed to load:', err)
    })

    return () => {
      cancelled = true
      if (engineRef.current) {
        engineRef.current.dispose()
        engineRef.current = null
      }
      if (textureRef.current) {
        textureRef.current.dispose()
        textureRef.current = null
      }
      if (materialRef.current) {
        materialRef.current.dispose()
        materialRef.current = null
      }
      canvasRef.current = null
      charDataRef.current = null
    }
  }, [acsUrl]) // Only reload when URL changes

  // ── Sync animation state from server ──
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.requestState(animationState)
    }
  }, [animationState])

  // ── Report layout when scale changes ──
  useEffect(() => {
    if (loaded && onLayout) {
      const worldHeight = TARGET_HEIGHT_PX * PX_SCALE
      onLayout({
        worldHeight,
        headTopY: worldHeight,
        visualTopY: worldHeight,
      })
    }
  }, [loaded, charScale, onLayout])

  // ── Plane geometry (subdivided for walk shader) ──
  const geometry = useMemo(() => {
    if (!charDataRef.current) return null
    const data = charDataRef.current
    const w = data.width * PX_SCALE * charScale
    const h = data.height * PX_SCALE * charScale
    const geo = new THREE.PlaneGeometry(w, h, PLANE_SEGMENTS_X, PLANE_SEGMENTS_Y)
    // Shift up so bottom edge = Y=0 (feet on ground)
    geo.translate(0, h / 2, 0)
    return geo
  }, [charScale, loaded])

  // ── Frame loop ──
  useFrame((_, rawDelta) => {
    const engine = engineRef.current
    const canvas = canvasRef.current
    const texture = textureRef.current
    const material = materialRef.current

    if (!engine || !canvas || !texture || !material) return

    const deltaMs = Math.min(rawDelta, 0.1) * 1000

    // Tick animation engine
    const result = engine.tick(deltaMs)

    // Update walk shader uniforms
    const uniforms = material.uniforms as unknown as AcsWalkUniforms
    updateAcsWalkUniforms(uniforms, deltaMs, speed, isMoving)

    // Play sound if triggered
    if (result.soundIndex >= 0 && charDataRef.current) {
      playSound(result.soundIndex, charDataRef.current)
    }

    // Render frame to canvas when it changes
    if (result.frameChanged) {
      const frame = engine.renderFrame()
      if (frame) {
        const ctx = canvas.getContext('2d')!
        const imgData = new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.putImageData(imgData, 0, 0)
        texture.needsUpdate = true
      }
    }

    // Update flipX on mesh
    if (meshRef.current) {
      meshRef.current.scale.x = flipX ? -1 : 1
    }
  })

  // ── Sound playback ──
  function playSound(index: number, data: AcsCharacterData) {
    const buffer = data.soundBuffers.get(index)
    if (!buffer || !gainNodeRef.current) return

    const audioCtx = getSharedAudioContext()
    if (audioCtx.state === 'suspended') return // Don't try to play if blocked

    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    source.connect(gainNodeRef.current)
    source.start()
  }

  // ── Render ──

  if (!loaded || !geometry || !materialRef.current) {
    // Loading placeholder — match PaperDoll's capsule placeholder
    return (
      <mesh position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.15, 0.7, 4, 8]} />
        <meshBasicMaterial color="#555" transparent opacity={0.3} wireframe />
      </mesh>
    )
  }

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={materialRef.current}
      renderOrder={1}
    />
  )
}
