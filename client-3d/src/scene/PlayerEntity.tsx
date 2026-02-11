import { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

import { PaperDoll } from '../character/PaperDoll'
import type { PlayerState } from '../stores/gameStore'
import { useChatStore } from '../stores/chatStore'
import { useMusicStore } from '../stores/musicStore'

const WORLD_SCALE = 0.01 // Server pixels → world units
const LOCAL_LERP = 18 // Fast lerp for local player (smooth but responsive)
const REMOTE_LERP = 8 // Slower lerp for remote players
const MOVE_THRESHOLD = 0.0001 // World-unit velocity² threshold for "moving"
const STOP_GRACE = 0.15 // Seconds to keep "walk" after stopping (prevents flicker)
const BILLBOARD_LERP = 4 // How fast the billboard rotation catches up (lower = more lag/twist)
const TWIST_DAMPING = 6 // How fast the twist value decays

function bubbleFontSize(len: number): number {
  if (len <= 8) return 7
  if (len <= 20) return 6
  return 5
}

const TALL_THRESHOLD = 1.2 // visualTopY above this → side bubble

function ChatBubble({ sessionId, visualTopY }: { sessionId: string; visualTopY: number }) {
  const bubble = useChatStore((s) => s.bubbles.get(sessionId))
  const markerRef = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const [flipLeft, setFlipLeft] = useState(false)
  const tempVec = useRef(new THREE.Vector3())
  const frameCount = useRef(0)

  const useSide = visualTopY > TALL_THRESHOLD

  // Project character position to screen space every 4th frame (only for side bubbles)
  useFrame(() => {
    if (!useSide) return

    frameCount.current++
    if (frameCount.current % 4 !== 0) return
    if (!markerRef.current || !bubble) return

    markerRef.current.getWorldPosition(tempVec.current)
    tempVec.current.project(camera)

    const shouldFlip = tempVec.current.x > 0.3
    if (shouldFlip !== flipLeft) setFlipLeft(shouldFlip)
  })

  const fontSize = bubble ? bubbleFontSize(bubble.content.length) : 6

  // Short chars: above head. Tall chars: to the side.
  const position: [number, number, number] = useSide
    ? [flipLeft ? -0.5 : 0.5, visualTopY * 0.85, 0]
    : [0, visualTopY + 0.1, 0]

  return (
    <>
      <group ref={markerRef} />

      {bubble && (
        <Html position={position} center distanceFactor={6} style={{ pointerEvents: 'none' }}>
          <div
            className="relative max-w-[140px] px-2 py-1 bg-white rounded-lg text-black font-mono leading-tight select-none shadow-md"
            style={{
              fontSize: `${fontSize}px`,
              animation: 'bubble-in 0.2s ease-out both',
            }}
          >
            {bubble.content}

            {useSide ? (
              // Side tail — on the edge facing the character
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  [flipLeft ? 'right' : 'left']: -5,
                  marginTop: -4,
                  width: 0,
                  height: 0,
                  borderTop: '4px solid transparent',
                  borderBottom: '4px solid transparent',
                  [flipLeft ? 'borderLeft' : 'borderRight']: '6px solid white',
                }}
              />
            ) : (
              // Bottom tail — centered below bubble, pointing down
              <div
                style={{
                  position: 'absolute',
                  bottom: -5,
                  left: '50%',
                  marginLeft: -4,
                  width: 0,
                  height: 0,
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderTop: '6px solid white',
                }}
              />
            )}
          </div>

          <style>{`
            @keyframes bubble-in {
              0% { opacity: 0; transform: scale(0.5); }
              100% { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </Html>
      )}
    </>
  )
}

interface PlayerEntityProps {
  player: PlayerState
  isLocal: boolean
  characterPath: string
}

export function PlayerEntity({ player, isLocal, characterPath }: PlayerEntityProps) {
  const groupRef = useRef<THREE.Group>(null)
  const dollGroupRef = useRef<THREE.Group>(null)
  const { camera } = useThree()

  const [animName, setAnimName] = useState('idle')
  const isMusicPlaying = useMusicStore((s) => s.stream.isPlaying)
  const [flipX, setFlipX] = useState(false)
  const [speed, setSpeed] = useState(0)
  const [velX, setVelX] = useState(0)
  const [bbTwist, setBbTwist] = useState(0)
  const [visualTopY, setVisualTopY] = useState(1.1)

  const lastVisualX = useRef(0)
  const stopTimer = useRef(0)
  const smoothSpeed = useRef(0)
  const smoothVelX = useRef(0)
  const currentYRot = useRef(0)
  const smoothTwist = useRef(0)
  const danceClockRef = useRef(0)
  const charGroupRef = useRef<THREE.Group>(null)

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)

    if (!groupRef.current) return

    const targetX = player.x * WORLD_SCALE
    const targetZ = -player.y * WORLD_SCALE

    const curX = groupRef.current.position.x
    const curZ = groupRef.current.position.z

    // Smooth lerp for everyone — local just lerps faster
    const t = 1 - Math.exp(-(isLocal ? LOCAL_LERP : REMOTE_LERP) * delta)

    groupRef.current.position.x = curX + (targetX - curX) * t
    groupRef.current.position.z = curZ + (targetZ - curZ) * t

    // --- Billboard rotation (lazy, with twist) ---
    if (dollGroupRef.current) {
      // Angle from character to camera (Y-axis only)
      const dx = camera.position.x - groupRef.current.position.x
      const dz = camera.position.z - groupRef.current.position.z
      const targetYRot = Math.atan2(dx, dz)

      // Shortest-path angle difference
      let angleDiff = targetYRot - currentYRot.current
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

      // Lazy lerp toward target
      const bbT = 1 - Math.exp(-BILLBOARD_LERP * delta)
      currentYRot.current += angleDiff * bbT

      dollGroupRef.current.rotation.y = currentYRot.current

      // Angular velocity drives the twist
      const angularVelocity = (angleDiff * bbT) / Math.max(delta, 0.001)

      // Smooth the twist value
      smoothTwist.current +=
        (angularVelocity - smoothTwist.current) * (1 - Math.exp(-TWIST_DAMPING * delta))

      // Clamp and quantize for setState
      const clampedTwist = Math.max(-1, Math.min(1, smoothTwist.current * 0.3))
      const roundedTwist = Math.round(clampedTwist * 100) / 100

      if (Math.abs(roundedTwist - bbTwist) > 0.01) setBbTwist(roundedTwist)
    }

    // Compute visual velocity for animation state
    const vx = groupRef.current.position.x - lastVisualX.current
    const vSq =
      vx * vx + (groupRef.current.position.z - curZ) * (groupRef.current.position.z - curZ)

    lastVisualX.current = groupRef.current.position.x

    // Smooth the speed/velocity for distortion (avoid jittery shader)
    const rawSpeed = Math.min(Math.sqrt(vSq) * 80, 1) // normalize to 0..1
    const rawVelX = Math.min(Math.max(vx * 80, -1), 1)

    smoothSpeed.current += (rawSpeed - smoothSpeed.current) * Math.min(delta * 10, 1)
    smoothVelX.current += (rawVelX - smoothVelX.current) * Math.min(delta * 10, 1)

    // Only setState when the value changes meaningfully (avoid excess re-renders)
    const roundedSpeed = Math.round(smoothSpeed.current * 100) / 100
    const roundedVelX = Math.round(smoothVelX.current * 100) / 100

    if (Math.abs(roundedSpeed - speed) > 0.02) setSpeed(roundedSpeed)
    if (Math.abs(roundedVelX - velX) > 0.02) setVelX(roundedVelX)

    const isWalking = vSq > MOVE_THRESHOLD
    const shouldDance = isMusicPlaying && !isWalking && stopTimer.current <= 0

    // Dance scale bounce (squash-stretch) when dancing
    if (charGroupRef.current) {
      if (shouldDance) {
        danceClockRef.current += delta
        const beat = (danceClockRef.current * (Math.PI * 2)) / 0.6
        const scaleY = 1 + Math.sin(beat) * 0.08
        const scaleX = 1 - Math.sin(beat) * 0.04
        charGroupRef.current.scale.set(scaleX, scaleY, 1)
      } else {
        danceClockRef.current = 0
        charGroupRef.current.scale.set(1, 1, 1)
      }
    }

    if (isWalking) {
      stopTimer.current = STOP_GRACE

      if (animName !== 'walk') setAnimName('walk')
      if (vx < -0.0005 && !flipX) setFlipX(true)
      if (vx > 0.0005 && flipX) setFlipX(false)
    } else {
      stopTimer.current -= delta

      if (stopTimer.current <= 0) {
        const target = isMusicPlaying ? 'dance' : 'idle'
        if (animName !== target) setAnimName(target)
      }
    }
  })

  return (
    <group ref={groupRef}>
      {/* Billboard rotation group — lazily faces camera */}
      <group ref={dollGroupRef}>
        {/* Character model — PaperDoll self-grounds (feet at Y=0) */}
        <group ref={charGroupRef}>
          <PaperDoll
            characterPath={characterPath}
            animationName={animName}
            flipX={flipX}
            speed={speed}
            velocityX={velX}
            billboardTwist={bbTwist}
            onLayout={({ visualTopY: vt }) => setVisualTopY(vt)}
          />
        </group>

        {/* Chat bubble */}
        <ChatBubble sessionId={player.sessionId} visualTopY={visualTopY} />

        {/* Nametag — below the character */}
        <Html position={[0, -0.15, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
          <div className="text-[8px] font-mono text-white/80 bg-black/50 px-1 py-0.5 rounded whitespace-nowrap select-none">
            {player.name}
          </div>
        </Html>
      </group>
    </group>
  )
}
