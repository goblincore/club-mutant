/**
 * DreamAcsCharacter — Renders Bonzi as the Drifter's visual/audio avatar
 * in the dream scene.
 *
 * Subscribes to dreamStore.dreamNpcMessage — when the Drifter responds in
 * DreamChatOverlay, Bonzi switches to 'speaking' animation and synthesizes
 * speech via SAPI4 TTS (graceful fallback if unavailable).
 *
 * Ortho camera: zoom=1 → 1 world unit = 1 pixel, origin = screen center.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import {
  loadAcsCharacterCached,
  getSharedAudioContext,
  type AcsCharacterData,
} from '../character/AcsLoader'
import { AcsAnimationEngine, type AcsNpcState } from '../character/AcsAnimationEngine'
import { useDreamStore } from '../stores/dreamStore'
import { synthesizeAndPlay } from '../audio/npcTtsPlayer'

// ── Constants ──

const ACS_URL = '/npc/bonzi/Bonzi.acs'

/** Display scale for the sprite in dream scene pixels. */
const DISPLAY_SCALE = 1.4    // ~1.4× native ACS size (Bonzi is 320×256)
const BOB_SPEED = 1.0         // idle bob frequency
const BOB_AMOUNT = 3          // idle bob amplitude (pixels)

// Idle variety: cycle through random animations every N seconds
const IDLE_CYCLE_MIN = 8_000  // ms
const IDLE_CYCLE_MAX = 15_000 // ms

// Fallback speaking duration: ~50ms per character when TTS unavailable
const MS_PER_CHAR = 50
const MIN_SPEAK_MS = 2_000
const MAX_SPEAK_MS = 12_000

// ── Component ──

export function DreamAcsCharacter() {
  const spriteRef = useRef<THREE.Sprite>(null)
  const matRef = useRef<THREE.SpriteMaterial>(null)
  const engineRef = useRef<AcsAnimationEngine | null>(null)
  const charDataRef = useRef<AcsCharacterData | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textureRef = useRef<THREE.CanvasTexture | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [dimensions, setDimensions] = useState({ w: 320, h: 256 })
  const gainNodeRef = useRef<GainNode | null>(null)
  const idleCycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSpeakingRef = useRef(false)
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load ACS file ──
  useEffect(() => {
    let cancelled = false

    loadAcsCharacterCached(ACS_URL).then((data) => {
      if (cancelled) return

      charDataRef.current = data

      // Offscreen canvas
      const canvas = document.createElement('canvas')
      canvas.width = data.width
      canvas.height = data.height
      canvasRef.current = canvas

      // Texture — NearestFilter for pixel art crunch
      const texture = new THREE.CanvasTexture(canvas)
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.colorSpace = THREE.SRGBColorSpace
      texture.generateMipmaps = false
      textureRef.current = texture

      // Animation engine
      const engine = new AcsAnimationEngine(data)
      engineRef.current = engine

      // Audio
      const audioCtx = getSharedAudioContext()
      const gainNode = audioCtx.createGain()
      gainNode.gain.value = 0.4
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

      setDimensions({ w: data.width, h: data.height })
      setLoaded(true)
    }).catch((err) => {
      console.error('[DreamAcsCharacter] Failed to load:', err)
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
      if (idleCycleTimerRef.current) {
        clearTimeout(idleCycleTimerRef.current)
      }
      if (speakTimerRef.current) {
        clearTimeout(speakTimerRef.current)
      }
      canvasRef.current = null
      charDataRef.current = null
    }
  }, [])

  // ── Idle animation variety cycling (suppressed while speaking) ──
  useEffect(() => {
    if (!loaded) return

    const states: AcsNpcState[] = ['idle', 'greeting', 'speaking', 'reacting']

    const cycle = () => {
      // Don't interrupt speaking state with idle cycling
      if (engineRef.current && !isSpeakingRef.current) {
        const roll = Math.random()
        let state: AcsNpcState
        if (roll < 0.55) {
          state = 'idle'
        } else if (roll < 0.75) {
          state = 'greeting'
        } else if (roll < 0.90) {
          state = 'speaking'
        } else {
          state = 'reacting'
        }
        engineRef.current.requestState(state)
      }

      const delay = IDLE_CYCLE_MIN + Math.random() * (IDLE_CYCLE_MAX - IDLE_CYCLE_MIN)
      idleCycleTimerRef.current = setTimeout(cycle, delay)
    }

    const initialDelay = 3000 + Math.random() * 5000
    idleCycleTimerRef.current = setTimeout(cycle, initialDelay)

    return () => {
      if (idleCycleTimerRef.current) clearTimeout(idleCycleTimerRef.current)
    }
  }, [loaded])

  // ── React to Drifter NPC responses (speaking + TTS) ──
  useEffect(() => {
    if (!loaded) return

    let prevMessage: string | null = null

    const unsub = useDreamStore.subscribe((state) => {
      const message = state.dreamNpcMessage
      if (message === prevMessage) return
      prevMessage = message

      if (!message || !engineRef.current) return

      // Clear any previous speak timer
      if (speakTimerRef.current) {
        clearTimeout(speakTimerRef.current)
        speakTimerRef.current = null
      }

      // Switch to speaking animation
      isSpeakingRef.current = true
      engineRef.current.requestState('speaking')

      // Calculate fallback duration from text length
      const fallbackMs = Math.min(
        MAX_SPEAK_MS,
        Math.max(MIN_SPEAK_MS, message.length * MS_PER_CHAR)
      )

      // Try SAPI4 TTS (graceful fallback)
      synthesizeAndPlay(message).then((durationMs) => {
        // Use TTS duration if available, otherwise text-length fallback
        const speakDuration = durationMs ?? fallbackMs

        speakTimerRef.current = setTimeout(() => {
          isSpeakingRef.current = false
          if (engineRef.current) {
            engineRef.current.requestState('idle')
          }
          // Clear the message so the same text can re-trigger if needed
          useDreamStore.getState().setDreamNpcMessage(null)
        }, speakDuration)
      })
    })

    return () => {
      unsub()
      if (speakTimerRef.current) clearTimeout(speakTimerRef.current)
    }
  }, [loaded])

  // ── Frame loop ──
  useFrame(() => {
    const engine = engineRef.current
    const canvas = canvasRef.current
    const texture = textureRef.current
    const mat = matRef.current
    const sprite = spriteRef.current

    if (!engine || !canvas || !texture || !mat || !sprite) return

    const t = performance.now() * 0.001

    // Tick animation (~16ms frames)
    const result = engine.tick(16.67)

    // Play sound
    if (result.soundIndex >= 0 && charDataRef.current) {
      const buffer = charDataRef.current.soundBuffers.get(result.soundIndex)
      if (buffer && gainNodeRef.current) {
        const audioCtx = getSharedAudioContext()
        if (audioCtx.state !== 'suspended') {
          const source = audioCtx.createBufferSource()
          source.buffer = buffer
          source.connect(gainNodeRef.current)
          source.start()
        }
      }
    }

    // Render new frame to canvas
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

    // Gentle idle bob — centered on screen
    sprite.position.x = 0
    sprite.position.y = Math.sin(t * BOB_SPEED) * BOB_AMOUNT
  })

  // ── Click handler — trigger a random greeting/speaking animation ──
  const handleClick = useCallback(() => {
    if (engineRef.current) {
      const states: AcsNpcState[] = ['greeting', 'speaking', 'reacting']
      const state = states[Math.floor(Math.random() * states.length)]
      engineRef.current.requestState(state)

      // Return to idle after the animation plays
      setTimeout(() => {
        if (engineRef.current) {
          engineRef.current.requestState('idle')
        }
      }, 4000)
    }
  }, [])

  if (!loaded || !textureRef.current) return null

  const scaledW = dimensions.w * DISPLAY_SCALE
  const scaledH = dimensions.h * DISPLAY_SCALE

  return (
    <sprite
      ref={spriteRef}
      position={[0, 0, 0.5]}
      scale={[scaledW, scaledH, 1]}
      onClick={handleClick}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = 'default' }}
    >
      <spriteMaterial
        ref={matRef}
        map={textureRef.current}
        transparent
        depthWrite={false}
        opacity={0.95}
      />
    </sprite>
  )
}
