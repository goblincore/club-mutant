import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { useGameStore } from '../stores/gameStore'

const WORLD_SCALE = 0.01
const CAMERA_OFFSET = new THREE.Vector3(0, 8, 8)
const LERP_SPEED = 3

// Follow camera that tracks the local player with an isometric-ish angle
export function FollowCamera() {
  const { camera } = useThree()
  const targetRef = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    const state = useGameStore.getState()
    const myId = state.mySessionId
    if (!myId) return

    const me = state.players.get(myId)
    if (!me) return

    // Target = player world position
    targetRef.current.set(me.x * WORLD_SCALE, 0, -me.y * WORLD_SCALE)

    // Camera position = target + offset
    const desiredPos = targetRef.current.clone().add(CAMERA_OFFSET)

    camera.position.lerp(desiredPos, delta * LERP_SPEED)
    camera.lookAt(targetRef.current)
  })

  return null
}
