import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import * as THREE from 'three'

import { useGameStore } from '../stores/gameStore'

const ROOM_SIZE = 12
const WALL_HEIGHT = 3
const WALL_COLOR = '#e84420'
const FLOOR_COLOR = '#f5d442'
const WORLD_SCALE = 0.01

const FADE_SPEED = 6 // opacity lerp speed
const OCCLUDE_OPACITY = 0.08 // near-invisible when blocking

const raycaster = new THREE.Raycaster()
const playerWorldPos = new THREE.Vector3()

export function Room() {
  const half = ROOM_SIZE / 2
  const { camera } = useThree()

  const wallRefs = useRef<THREE.Mesh[]>([])
  const wallOpacities = useRef<number[]>([1, 1, 1, 1])

  const setWallRef = (index: number) => (mesh: THREE.Mesh | null) => {
    if (mesh) {
      wallRefs.current[index] = mesh

      // Make material support transparency
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.transparent = true
      mat.opacity = 1
    }
  }

  useFrame((_, delta) => {
    const state = useGameStore.getState()
    const myId = state.mySessionId
    if (!myId) return

    const me = state.players.get(myId)
    if (!me) return

    // Player world position
    playerWorldPos.set(me.x * WORLD_SCALE, 0.5, -me.y * WORLD_SCALE)

    // Direction from camera to player
    const dir = playerWorldPos.clone().sub(camera.position).normalize()
    raycaster.set(camera.position, dir)

    const distToPlayer = camera.position.distanceTo(playerWorldPos)

    // Test each wall
    const walls = wallRefs.current

    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i]
      if (!wall) continue

      const mat = wall.material as THREE.MeshStandardMaterial
      const intersects = raycaster.intersectObject(wall)

      // Wall is blocking if any intersection is between camera and player
      const isBlocking = intersects.some((hit) => hit.distance < distToPlayer)

      const targetOpacity = isBlocking ? OCCLUDE_OPACITY : 1
      const t = 1 - Math.exp(-FADE_SPEED * delta)

      wallOpacities.current[i] += (targetOpacity - wallOpacities.current[i]) * t
      mat.opacity = wallOpacities.current[i]
    }
  })

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[ROOM_SIZE, ROOM_SIZE]} />
        <meshStandardMaterial color={FLOOR_COLOR} />
      </mesh>

      {/* Grid overlay */}
      <Grid
        position={[0, 0, 0]}
        args={[ROOM_SIZE, ROOM_SIZE]}
        cellSize={1}
        cellThickness={0.3}
        cellColor="#e8c832"
        sectionSize={4}
        sectionThickness={0.8}
        sectionColor="#d4a020"
        fadeDistance={20}
      />

      {/* Back wall (-Z) */}
      <mesh ref={setWallRef(0)} position={[0, WALL_HEIGHT / 2, -half]}>
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <meshStandardMaterial color={WALL_COLOR} side={2} />
      </mesh>

      {/* Left wall (-X) */}
      <mesh
        ref={setWallRef(1)}
        position={[-half, WALL_HEIGHT / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <meshStandardMaterial color={WALL_COLOR} side={2} />
      </mesh>

      {/* Right wall (+X) */}
      <mesh
        ref={setWallRef(2)}
        position={[half, WALL_HEIGHT / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <meshStandardMaterial color={WALL_COLOR} side={2} />
      </mesh>

      {/* Front wall (+Z) */}
      <mesh ref={setWallRef(3)} position={[0, WALL_HEIGHT / 2, half]}>
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <meshStandardMaterial color={WALL_COLOR} side={2} />
      </mesh>

      {/* Ambient light */}
      <ambientLight intensity={1.0} />

      {/* Directional light */}
      <directionalLight position={[3, 8, 5]} intensity={0.6} />
    </group>
  )
}
