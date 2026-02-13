import { useCallback, useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

import { PaperDoll } from '../character/PaperDoll'
import type { PlayerState } from '../stores/gameStore'
import { getPlayerPosition } from '../stores/gameStore'
import {
  useChatStore,
  BUBBLE_DURATION,
  type ChatBubble as ChatBubbleData,
} from '../stores/chatStore'
import { useMusicStore } from '../stores/musicStore'
import { consumeJumpRequest } from '../input/usePlayerInput'
import { addRipple, getDisplacementAt } from './TrampolineRipples'
import { getNetwork } from '../network/NetworkManager'

const WORLD_SCALE = 0.01 // Server pixels → world units
const LOCAL_LERP = 18 // Fast lerp for local player (smooth but responsive)
const REMOTE_LERP = 8 // Slower lerp for remote players
const MOVE_THRESHOLD = 0.0001 // World-unit velocity² threshold for "moving"
const STOP_GRACE = 0.15 // Seconds to keep "walk" after stopping (prevents flicker)
const BILLBOARD_LERP = 4 // How fast the billboard rotation catches up (lower = more lag/twist)
const TWIST_DAMPING = 6 // How fast the twist value decays

// ── Jump / trampoline constants (moon-bounce feel) ──

const JUMP_VELOCITY = 3.5 // world units/sec initial upward speed
const DOUBLE_JUMP_VELOCITY = 2.8 // slightly weaker second jump
const GRAVITY = 6.0 // world units/sec² (low = floaty moon-bounce)
const LANDING_RIPPLE_AMP = 0.25 // ripple amplitude on landing
const TAKEOFF_RIPPLE_AMP = 0.08 // smaller ripple on takeoff
const CHAIN_LAUNCH_THRESHOLD = 0.15 // floor displacement that auto-launches standing players
const CHAIN_LAUNCH_MULTIPLIER = 12.0 // displacement → launch velocity multiplier
const JUMP_SPIN_SPEED = 8.0 // radians/sec spin during air time

// Squash/stretch timing
const TAKEOFF_SQUASH_DURATION = 0.1 // seconds of squash before launch
const LANDING_SQUASH_DURATION = 0.15 // seconds of squash on landing
const SQUASH_SPRING_SPEED = 12.0 // how fast scale springs back to 1

// Shared jump signal for remote players (set by NetworkManager)
const _remoteJumpSignals = new Map<string, boolean>()

export function triggerRemoteJump(sessionId: string) {
  _remoteJumpSignals.set(sessionId, true)
}

function consumeRemoteJump(sessionId: string): boolean {
  if (_remoteJumpSignals.get(sessionId)) {
    _remoteJumpSignals.delete(sessionId)
    return true
  }

  return false
}

// ── 3D Chat bubble helpers ──

const TALL_THRESHOLD = 1.2
const BUBBLE_PAD_X = 0.035
const BUBBLE_PAD_Y = 0.025
const BUBBLE_RADIUS = 0.03

const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xffffff })

// Tail triangle (points -Y by default)
const tailGeo = (() => {
  const s = new THREE.Shape()
  s.moveTo(-0.012, 0)
  s.lineTo(0.012, 0)
  s.lineTo(0, -0.025)
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

function bubbleTextSize(len: number): number {
  if (len <= 8) return 0.09
  if (len <= 20) return 0.076
  return 0.064
}

const STACK_GAP = 0.12
const FADE_MS = 800

// ── Nametag (troika Text + background mesh, layer 1) ──

const NAME_FONT_SIZE = 0.065
const NAME_PAD_X = 0.03
const NAME_PAD_Y = 0.018
const NAME_BG_RADIUS = 0.02
const nametagBgMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.5,
})

function makeNametagRect(w: number, h: number, r: number): THREE.ShapeGeometry {
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

function Nametag({ name }: { name: string }) {
  const bgRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    bgRef.current?.layers.set(1)
  }, [])

  const handleSync = useCallback((troika: THREE.Mesh) => {
    troika.layers.set(1)

    troika.geometry.computeBoundingBox()
    const bb = troika.geometry.boundingBox
    if (!bb || !bgRef.current) return

    const w = bb.max.x - bb.min.x + NAME_PAD_X * 2
    const h = bb.max.y - bb.min.y + NAME_PAD_Y * 2
    const cx = (bb.min.x + bb.max.x) / 2
    const cy = (bb.min.y + bb.max.y) / 2

    bgRef.current.geometry.dispose()
    bgRef.current.geometry = makeNametagRect(w, h, NAME_BG_RADIUS)
    bgRef.current.position.set(cx, cy, -0.001)
  }, [])

  return (
    <group position={[0, -0.15, 0]}>
      <Text
        fontSize={NAME_FONT_SIZE}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        font="/fonts/courier-prime.woff"
        onSync={handleSync}
      >
        {name}
      </Text>

      <mesh ref={bgRef} material={nametagBgMat}>
        <planeGeometry args={[0.1, 0.1]} />
      </mesh>
    </group>
  )
}

// ── Single bubble in the stack ──

function SingleBubble({
  bubble,
  yOffset,
  showTail,
  useSide,
  flipLeft,
}: {
  bubble: ChatBubbleData
  yOffset: number
  showTail: boolean
  useSide: boolean
  flipLeft: boolean
}) {
  const bgRef = useRef<THREE.Mesh>(null)
  const tailRef = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)
  const animRef = useRef(0)
  const bgBounds = useRef({ cx: 0, cy: 0, w: 0.1, h: 0.1 })

  // Layer setup — runs on mount
  useEffect(() => {
    bgRef.current?.layers.set(1)
    tailRef.current?.layers.set(1)
  }, [])

  useFrame((_, delta) => {
    if (!groupRef.current) return

    // Pop-in
    if (animRef.current < 1) {
      animRef.current = Math.min(1, animRef.current + delta * 8)
    }

    // Shrink-out in last FADE_MS
    const remaining = BUBBLE_DURATION - (Date.now() - bubble.timestamp)
    const fadeScale = remaining < FADE_MS ? Math.max(0, remaining / FADE_MS) : 1

    const ease = 1 - (1 - animRef.current) * (1 - animRef.current)
    groupRef.current.scale.setScalar(ease * fadeScale)

    // Tail position
    if (tailRef.current) {
      const { cx, cy, w, h } = bgBounds.current

      if (useSide) {
        tailRef.current.rotation.z = flipLeft ? -Math.PI / 2 : Math.PI / 2
        tailRef.current.position.set(flipLeft ? cx + w / 2 : cx - w / 2, cy, 0)
      } else {
        tailRef.current.rotation.z = 0
        tailRef.current.position.set(cx, cy - h / 2, 0)
      }
    }
  })

  const handleSync = useCallback((troika: THREE.Mesh) => {
    troika.layers.set(1)

    troika.geometry.computeBoundingBox()
    const bb = troika.geometry.boundingBox
    if (!bb || !bgRef.current) return

    const w = bb.max.x - bb.min.x + BUBBLE_PAD_X * 2
    const h = bb.max.y - bb.min.y + BUBBLE_PAD_Y * 2
    const cx = (bb.min.x + bb.max.x) / 2
    const cy = (bb.min.y + bb.max.y) / 2

    bgBounds.current = { cx, cy, w, h }

    bgRef.current.geometry.dispose()
    bgRef.current.geometry = makeRoundedRect(w, h, BUBBLE_RADIUS)
    bgRef.current.position.set(cx, cy, -0.003)
  }, [])

  const fontSize = bubbleTextSize(bubble.content.length)

  return (
    <group ref={groupRef} position={[0, yOffset, 0]} scale={0}>
      <Text
        fontSize={fontSize}
        maxWidth={0.6}
        color="#000000"
        anchorX="center"
        anchorY="bottom"
        textAlign="center"
        font="/fonts/courier-prime.woff"
        onSync={handleSync}
      >
        {bubble.content}
      </Text>

      <mesh ref={bgRef} material={bubbleMat}>
        <planeGeometry args={[0.1, 0.1]} />
      </mesh>

      {showTail && <mesh ref={tailRef} geometry={tailGeo} material={bubbleMat} />}
    </group>
  )
}

// ── Stacked bubble container — handles positioning, distance scaling, flip ──

function ChatBubble({
  sessionId,
  visualTopY,
  headTopY,
}: {
  sessionId: string
  visualTopY: number
  headTopY: number
}) {
  const bubbles = useChatStore((s) => s.bubbles.get(sessionId))
  const outerRef = useRef<THREE.Group>(null)
  const markerRef = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const [flipLeft, setFlipLeft] = useState(false)
  const tempVec = useRef(new THREE.Vector3())
  const frameCount = useRef(0)

  const useSide = visualTopY > TALL_THRESHOLD

  // Enable layer 1 on camera so bubbles render when post-processing is off
  useEffect(() => {
    camera.layers.enable(1)
  }, [camera])

  // Distance scaling + screen-edge flip
  useFrame(() => {
    if (!outerRef.current || !markerRef.current || !bubbles?.length) return

    markerRef.current.getWorldPosition(tempVec.current)
    const dist = tempVec.current.distanceTo(camera.position)
    const targetScale = Math.max(0.8, Math.min(2.5, dist / 4))
    outerRef.current.scale.setScalar(targetScale)

    // Screen-edge flip for side bubbles (every 4th frame)
    if (useSide) {
      frameCount.current++

      if (frameCount.current % 4 === 0) {
        tempVec.current.project(camera)
        const shouldFlip = tempVec.current.x > 0.3
        if (shouldFlip !== flipLeft) setFlipLeft(shouldFlip)
      }
    }
  })

  if (!bubbles?.length) return <group ref={markerRef} />

  const position: [number, number, number] = useSide
    ? [flipLeft ? -0.5 : 0.5, headTopY, 0]
    : [0, visualTopY + 0.15, 0]

  return (
    <>
      <group ref={markerRef} />

      <group ref={outerRef} position={position}>
        {bubbles.map((bubble, i) => (
          <SingleBubble
            key={bubble.id}
            bubble={bubble}
            yOffset={i * STACK_GAP}
            showTail={i === 0}
            useSide={useSide}
            flipLeft={flipLeft}
          />
        ))}
      </group>
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
  const [headTopY, setHeadTopY] = useState(1.1)

  const lastVisualX = useRef(0)
  const stopTimer = useRef(0)
  const smoothSpeed = useRef(0)
  const smoothVelX = useRef(0)
  const currentYRot = useRef(0)
  const smoothTwist = useRef(0)
  const danceClockRef = useRef(0)
  const charGroupRef = useRef<THREE.Group>(null)

  // Jump state refs (not React state — updated every frame, no re-renders needed)
  const jumpY = useRef(0)
  const jumpVelY = useRef(0)
  const isJumping = useRef(false)
  const hasDoubleJump = useRef(true)
  const jumpSpinAccum = useRef(0)
  const landingSquashTimer = useRef(0)
  const jumpScaleY = useRef(1)
  const jumpScaleX = useRef(1)

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)

    if (!groupRef.current) return

    const pos = getPlayerPosition(player.sessionId)
    const targetX = (pos?.x ?? 0) * WORLD_SCALE
    const targetZ = -(pos?.y ?? 0) * WORLD_SCALE

    const curX = groupRef.current.position.x
    const curZ = groupRef.current.position.z

    // Smooth lerp for everyone — local just lerps faster
    const t = 1 - Math.exp(-(isLocal ? LOCAL_LERP : REMOTE_LERP) * delta)

    groupRef.current.position.x = curX + (targetX - curX) * t
    groupRef.current.position.z = curZ + (targetZ - curZ) * t

    const worldX = groupRef.current.position.x
    const worldZ = groupRef.current.position.z

    // ── Jump input (local player) or remote signal ──
    const wantsJump = isLocal ? consumeJumpRequest() : consumeRemoteJump(player.sessionId)

    if (wantsJump) {
      if (!isJumping.current) {
        // Ground jump
        isJumping.current = true
        hasDoubleJump.current = true
        jumpVelY.current = JUMP_VELOCITY
        jumpSpinAccum.current = 0
        landingSquashTimer.current = 0

        // Takeoff ripple (local only — remote takeoff ripples are created
        // immediately by NetworkManager when the PLAYER_JUMP message arrives)
        if (isLocal) {
          addRipple(worldX, worldZ, TAKEOFF_RIPPLE_AMP)
          getNetwork().sendJump()
        }
      } else if (hasDoubleJump.current) {
        // Double jump
        hasDoubleJump.current = false
        jumpVelY.current = DOUBLE_JUMP_VELOCITY
        jumpSpinAccum.current = 0

        // Small mid-air ripple at position below
        if (isLocal) {
          addRipple(worldX, worldZ, TAKEOFF_RIPPLE_AMP * 0.5)
          getNetwork().sendJump()
        }
      }
    }

    // ── Jump physics ──
    const floorHeight = getDisplacementAt(worldX, worldZ)

    if (isJumping.current) {
      jumpVelY.current -= GRAVITY * delta
      jumpY.current += jumpVelY.current * delta

      // Spin during air time
      jumpSpinAccum.current += JUMP_SPIN_SPEED * delta

      // Air stretch
      const airPhase = jumpVelY.current > 0 ? 0.3 : 0.7 // going up vs coming down
      jumpScaleY.current = 1 + (1 - airPhase) * 0.15
      jumpScaleX.current = 1 - (1 - airPhase) * 0.08

      // Landing check
      if (jumpY.current <= floorHeight && jumpVelY.current < 0) {
        // Landing ripple (amplitude scales with impact velocity)
        const impactVel = Math.abs(jumpVelY.current)
        const amp = Math.min(LANDING_RIPPLE_AMP * (impactVel / JUMP_VELOCITY), 0.4)
        addRipple(worldX, worldZ, amp)

        jumpY.current = floorHeight
        jumpVelY.current = 0
        isJumping.current = false
        hasDoubleJump.current = true
        jumpSpinAccum.current = 0

        // Start landing squash
        landingSquashTimer.current = LANDING_SQUASH_DURATION
        jumpScaleY.current = 0.6
        jumpScaleX.current = 1.3
      }

      groupRef.current.position.y = jumpY.current
    } else {
      // Grounded — ride the ripple waves
      jumpY.current = floorHeight
      groupRef.current.position.y = floorHeight

      // Chain reaction: if floor pushes us high enough, auto-launch
      if (floorHeight > CHAIN_LAUNCH_THRESHOLD) {
        isJumping.current = true
        hasDoubleJump.current = true
        jumpVelY.current = floorHeight * CHAIN_LAUNCH_MULTIPLIER
        jumpSpinAccum.current = 0
        landingSquashTimer.current = 0
      }

      // Landing squash spring-back
      if (landingSquashTimer.current > 0) {
        landingSquashTimer.current -= delta
        const progress = 1 - landingSquashTimer.current / LANDING_SQUASH_DURATION
        const spring = 1 + Math.sin(progress * Math.PI) * 0.3 * (1 - progress)
        jumpScaleY.current +=
          (spring - jumpScaleY.current) * Math.min(delta * SQUASH_SPRING_SPEED, 1)
        jumpScaleX.current +=
          (2 - spring - jumpScaleX.current) * Math.min(delta * SQUASH_SPRING_SPEED, 1)
      } else {
        jumpScaleY.current += (1 - jumpScaleY.current) * Math.min(delta * SQUASH_SPRING_SPEED, 1)
        jumpScaleX.current += (1 - jumpScaleX.current) * Math.min(delta * SQUASH_SPRING_SPEED, 1)
      }
    }

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

      // Add jump spin on top of billboard rotation
      dollGroupRef.current.rotation.y =
        currentYRot.current + (isJumping.current ? jumpSpinAccum.current : 0)

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
    const shouldDance = isMusicPlaying && !isWalking && stopTimer.current <= 0 && !isJumping.current

    // Dance scale bounce OR jump squash-stretch
    if (charGroupRef.current) {
      if (isJumping.current || landingSquashTimer.current > 0) {
        // Jump squash-stretch takes priority
        charGroupRef.current.scale.set(jumpScaleX.current, jumpScaleY.current, 1)
      } else if (shouldDance) {
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
            onLayout={({ visualTopY: vt, headTopY: ht }) => {
              setVisualTopY(vt)
              setHeadTopY(ht)
            }}
          />
        </group>

        {/* Chat bubble */}
        <ChatBubble sessionId={player.sessionId} visualTopY={visualTopY} headTopY={headTopY} />

        {/* Nametag — below the character */}
        <Nametag name={player.name} />
      </group>
    </group>
  )
}
