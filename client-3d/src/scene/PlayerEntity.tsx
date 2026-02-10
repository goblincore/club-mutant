import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

import { PaperDoll } from '../character/PaperDoll'
import type { PlayerState } from '../stores/gameStore'

const WORLD_SCALE = 0.01 // Server pixels → world units
const LOCAL_LERP = 18 // Fast lerp for local player (smooth but responsive)
const REMOTE_LERP = 8 // Slower lerp for remote players
const MOVE_THRESHOLD = 0.0001 // World-unit velocity² threshold for "moving"
const STOP_GRACE = 0.15 // Seconds to keep "walk" after stopping (prevents flicker)

interface PlayerEntityProps {
  player: PlayerState
  isLocal: boolean
  characterPath: string
}

export function PlayerEntity({ player, isLocal, characterPath }: PlayerEntityProps) {
  const groupRef = useRef<THREE.Group>(null)

  const [animName, setAnimName] = useState('idle')
  const [flipX, setFlipX] = useState(false)
  const [speed, setSpeed] = useState(0)
  const [velX, setVelX] = useState(0)

  const lastVisualX = useRef(0)
  const stopTimer = useRef(0)
  const smoothSpeed = useRef(0)
  const smoothVelX = useRef(0)

  useFrame((_, delta) => {
    if (!groupRef.current) return

    const targetX = player.x * WORLD_SCALE
    const targetZ = -player.y * WORLD_SCALE

    const curX = groupRef.current.position.x
    const curZ = groupRef.current.position.z

    // Smooth lerp for everyone — local just lerps faster
    const t = 1 - Math.exp(-(isLocal ? LOCAL_LERP : REMOTE_LERP) * delta)

    groupRef.current.position.x = curX + (targetX - curX) * t
    groupRef.current.position.z = curZ + (targetZ - curZ) * t

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

    if (vSq > MOVE_THRESHOLD) {
      stopTimer.current = STOP_GRACE

      if (animName !== 'walk') setAnimName('walk')
      if (vx < -0.0005 && !flipX) setFlipX(true)
      if (vx > 0.0005 && flipX) setFlipX(false)
    } else {
      stopTimer.current -= delta

      if (stopTimer.current <= 0 && animName !== 'idle') {
        setAnimName('idle')
      }
    }
  })

  return (
    <group ref={groupRef}>
      {/* Character model — raised above ground */}
      <group position={[0, 0.7, 0]}>
        <PaperDoll
          characterPath={characterPath}
          animationName={animName}
          flipX={flipX}
          speed={speed}
          velocityX={velX}
        />
      </group>

      {/* Nametag */}
      <Html position={[0, 1.8, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
        <div className="text-[10px] font-mono text-white bg-black/60 px-1.5 py-0.5 rounded whitespace-nowrap select-none">
          {player.name}
        </div>
      </Html>
    </group>
  )
}
