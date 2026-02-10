import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

import { PaperDoll } from '../character/PaperDoll'
import type { PlayerState } from '../stores/gameStore'

const WORLD_SCALE = 0.01 // Server pixels → world units
const LERP_SPEED = 8 // Interpolation speed for other players

interface PlayerEntityProps {
  player: PlayerState
  isLocal: boolean
  characterPath: string
}

export function PlayerEntity({ player, isLocal, characterPath }: PlayerEntityProps) {
  const groupRef = useRef<THREE.Group>(null)
  const prevX = useRef(player.x)
  const prevY = useRef(player.y)

  // Determine facing direction and animation from movement
  const dx = player.x - prevX.current
  const isMoving = Math.abs(dx) > 0.5 || Math.abs(player.y - prevY.current) > 0.5
  const flipX = dx < -0.5

  useFrame((_, delta) => {
    if (!groupRef.current) return

    // Target position: server (x, y) → Three.js (x, 0, -z)
    const targetX = player.x * WORLD_SCALE
    const targetZ = -player.y * WORLD_SCALE

    if (isLocal) {
      // Local player: snap immediately
      groupRef.current.position.x = targetX
      groupRef.current.position.z = targetZ
    } else {
      // Remote players: smooth interpolation
      groupRef.current.position.x = THREE.MathUtils.lerp(
        groupRef.current.position.x,
        targetX,
        delta * LERP_SPEED,
      )

      groupRef.current.position.z = THREE.MathUtils.lerp(
        groupRef.current.position.z,
        targetZ,
        delta * LERP_SPEED,
      )
    }

    prevX.current = player.x
    prevY.current = player.y
  })

  const animName = isMoving ? 'walk' : 'idle'

  return (
    <group ref={groupRef}>
      {/* Character model */}
      <PaperDoll
        characterPath={characterPath}
        animationName={animName}
        flipX={flipX}
      />

      {/* Nametag */}
      <Html
        position={[0, 1.8, 0]}
        center
        distanceFactor={10}
        style={{ pointerEvents: 'none' }}
      >
        <div className="text-[10px] font-mono text-white bg-black/60 px-1.5 py-0.5 rounded whitespace-nowrap select-none">
          {player.name}
        </div>
      </Html>
    </group>
  )
}
