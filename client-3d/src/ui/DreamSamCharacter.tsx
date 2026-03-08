import { useCallback, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { getSamSinger } from '../audio/SamSinger'
import { ALL_MELODIES } from '../audio/samMelodies'
import { useDreamDebugStore } from '../stores/dreamDebugStore'

// ── Pixel art ghost singer texture (32×64, drawn once) ───────────────────

const SPRITE_W = 32
const SPRITE_H = 64

function createSingerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_W
  canvas.height = SPRITE_H
  const c = canvas.getContext('2d')!

  // Transparent background
  c.clearRect(0, 0, SPRITE_W, SPRITE_H)

  // Ghostly robed figure — simple pixel art
  // Color palette: translucent whites and pale blues
  const body = 'rgba(200, 210, 230, 0.7)'
  const bodyLight = 'rgba(220, 230, 245, 0.85)'
  const face = 'rgba(240, 240, 255, 0.9)'
  const eyes = 'rgba(60, 40, 80, 0.9)'
  const mouth = 'rgba(80, 50, 60, 0.8)'
  const hood = 'rgba(160, 170, 200, 0.75)'
  const glow = 'rgba(180, 200, 255, 0.15)'

  // Outer glow aura
  c.fillStyle = glow
  c.beginPath()
  c.ellipse(16, 36, 14, 28, 0, 0, Math.PI * 2)
  c.fill()

  // Hood / head outline (rounded top)
  c.fillStyle = hood
  c.fillRect(10, 8, 12, 6)   // hood top
  c.fillRect(9, 11, 14, 4)   // hood sides
  c.fillRect(8, 14, 16, 3)   // hood brim

  // Face
  c.fillStyle = face
  c.fillRect(11, 12, 10, 8)  // face rectangle

  // Eyes — two dark pixels
  c.fillStyle = eyes
  c.fillRect(13, 14, 2, 2)   // left eye
  c.fillRect(18, 14, 2, 2)   // right eye

  // Mouth — small open circle (singing!)
  c.fillStyle = mouth
  c.fillRect(15, 18, 3, 2)

  // Robe body — wider toward bottom
  c.fillStyle = body
  c.fillRect(10, 20, 12, 8)  // upper robe
  c.fillRect(9, 28, 14, 8)   // mid robe
  c.fillRect(7, 36, 18, 10)  // lower robe
  c.fillRect(6, 46, 20, 8)   // robe hem (wide)

  // Robe highlight stripe
  c.fillStyle = bodyLight
  c.fillRect(14, 22, 4, 30)  // center highlight

  // Bottom wispy fade — ghost trailing off
  c.fillStyle = 'rgba(200, 210, 230, 0.3)'
  c.fillRect(8, 54, 16, 4)
  c.fillStyle = 'rgba(200, 210, 230, 0.15)'
  c.fillRect(10, 58, 12, 3)
  c.fillStyle = 'rgba(200, 210, 230, 0.06)'
  c.fillRect(12, 61, 8, 3)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Module-level singleton texture
const singerTexture = createSingerTexture()

// ── Singing mouth texture variant ────────────────────────────────────────

function createSingerOpenMouthTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_W
  canvas.height = SPRITE_H
  const c = canvas.getContext('2d')!

  // Draw the same base by reusing the closed-mouth canvas
  c.drawImage(singerTexture.image as HTMLCanvasElement, 0, 0)

  // Override mouth area with larger open mouth
  const face = 'rgba(240, 240, 255, 0.9)'
  c.fillStyle = face
  c.fillRect(14, 17, 5, 4) // clear old mouth area
  const mouth = 'rgba(60, 30, 40, 0.85)'
  c.fillStyle = mouth
  c.fillRect(14, 17, 4, 3) // wider open mouth

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const singerOpenTexture = createSingerOpenMouthTexture()

// ── Sprite scale in pixels ───────────────────────────────────────────────

const SPRITE_SCALE_X = 64   // display width in pixels
const SPRITE_SCALE_Y = 128  // display height in pixels
const MARGIN = 30            // pixels from screen edge

// ── Component ────────────────────────────────────────────────────────────

export function DreamSamCharacter() {
  const spriteRef = useRef<THREE.Sprite>(null)
  const matRef = useRef<THREE.SpriteMaterial>(null)
  const isSingingRef = useRef(false)
  const size = useThree((s) => s.size)

  // Position: bottom-right, offset from edge
  // Orthographic zoom=1 → 1 world unit = 1 pixel, origin = screen center
  const posX = size.width / 2 - SPRITE_SCALE_X / 2 - MARGIN
  const posY = -size.height / 2 + SPRITE_SCALE_Y / 2 + MARGIN

  // Animation loop
  useFrame(() => {
    const sprite = spriteRef.current
    const mat = matRef.current
    if (!sprite || !mat) return

    const t = performance.now() * 0.001
    const singer = getSamSinger()
    const singing = singer.isSinging
    isSingingRef.current = singing

    // Gentle bob
    const bobAmount = singing ? 4 : 2
    const bobSpeed = singing ? 2.5 : 1.2
    sprite.position.y = posY + Math.sin(t * bobSpeed) * bobAmount

    // Scale pulse when singing
    if (singing) {
      const pulse = 1.0 + 0.08 * Math.sin(t * 6)
      sprite.scale.set(SPRITE_SCALE_X * pulse, SPRITE_SCALE_Y * pulse, 1)

      // Toggle mouth open/closed texture every ~0.15s
      const mouthOpen = Math.sin(t * 20) > 0
      mat.map = mouthOpen ? singerOpenTexture : singerTexture
    } else {
      sprite.scale.set(SPRITE_SCALE_X, SPRITE_SCALE_Y, 1)
      mat.map = singerTexture
    }

    // Fade opacity gently
    mat.opacity = singing ? 0.95 : 0.7 + 0.05 * Math.sin(t * 0.8)
  })

  const handleClick = useCallback(() => {
    const dbg = useDreamDebugStore.getState()
    if (!dbg.samEnabled) return

    const singer = getSamSinger()

    // Update params from debug store
    singer.updateParams({
      samPitch: dbg.samPitch,
      samSpeed: dbg.samSpeed,
      samMouth: dbg.samMouth,
      samThroat: dbg.samThroat,
      lowpassFreq: dbg.samLowpassFreq,
      lowpassQ: dbg.samLowpassQ,
      reverbDecay: dbg.samReverbDecay,
      reverbMix: dbg.samReverbMix,
      masterGain: dbg.samMasterGain,
      baseMidiNote: dbg.samBaseMidiNote,
      chorusEnabled: dbg.samChorusEnabled,
      chorusRate: dbg.samChorusRate,
      chorusDepth: dbg.samChorusDepth,
      chorusWet: dbg.samChorusWet,
    })

    // Pick a random melody
    const melody = ALL_MELODIES[Math.floor(Math.random() * ALL_MELODIES.length)]
    singer.sing(melody)
  }, [])

  return (
    <sprite
      ref={spriteRef}
      position={[posX, posY, 0.5]}
      scale={[SPRITE_SCALE_X, SPRITE_SCALE_Y, 1]}
      onClick={handleClick}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = 'default' }}
    >
      <spriteMaterial
        ref={matRef}
        map={singerTexture}
        transparent
        depthWrite={false}
        opacity={0.7}
      />
    </sprite>
  )
}
