import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { getNetwork } from '../network/NetworkManager'
import { useGameStore, getPlayerPosition } from '../stores/gameStore'
import { useUIStore } from '../stores/uiStore'
import { TatamiFloorMaterial } from '../shaders/TatamiFloorMaterial'
import { StripedWallMaterial } from '../shaders/StripedWallMaterial'
import { OceanViewMaterial } from '../shaders/OceanViewMaterial'
import { NightSky } from '../shaders/NightSky'
import { InteractableObject } from './InteractableObject'
import { GLBModel } from './GLBModel'

// Preload GLB models to avoid pop-in
GLBModel.preload('/models/wooden-shelf.glb')
GLBModel.preload('/models/retro-computer.glb')
GLBModel.preload('/models/trophy.glb')
GLBModel.preload('/models/low-table-vase.glb')
GLBModel.preload('/models/zabuton.glb')
GLBModel.preload('/models/toy-car.glb')
GLBModel.preload('/models/shoji-door.glb')
GLBModel.preload('/models/low-computer-desk.glb')
GLBModel.preload('/models/futon.glb')
GLBModel.preload('/models/candle.glb')
GLBModel.preload('/models/floor-lamp.glb')
GLBModel.preload('/models/ceiling-lamp.glb')

interface JapaneseRoomProps {
  videoTexture?: THREE.VideoTexture | null
  slideshowTexture?: THREE.Texture | null
}

// ── Smaller cozy bedroom ──
const ROOM_W = 7 // width (X axis)
const ROOM_D = 6 // depth (Z axis)
const WALL_HEIGHT = 2.6
const WORLD_SCALE = 0.01
const HALF_W = ROOM_W / 2
const HALF_D = ROOM_D / 2

const FADE_SPEED = 6
const OCCLUDE_OPACITY = 0.08

const raycaster = new THREE.Raycaster()
const playerWorldPos = new THREE.Vector3()
const _scratchDir = new THREE.Vector3()

// Ocean view window — procedural shader with wood frame
function OceanWindow({
  position,
  size = [3.0, 1.4],
}: {
  position: [number, number, number]
  size?: [number, number]
}) {
  const [w, h] = size
  const borderWidth = 0.08

  return (
    <group position={position}>
      {/* Ocean view shader — render behind frame (recessed into wall) */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[w, h]} />
        <OceanViewMaterial />
      </mesh>

      {/* Light wood frame — flat border around the shader */}
      {/* Top bar */}
      <mesh position={[0, (h + borderWidth) / 2, 0.01]}>
        <boxGeometry args={[w + borderWidth * 2, borderWidth, 0.04]} />
        <meshStandardMaterial color="#d4c0a0" />
      </mesh>
      {/* Bottom bar */}
      <mesh position={[0, -(h + borderWidth) / 2, 0.01]}>
        <boxGeometry args={[w + borderWidth * 2, borderWidth, 0.04]} />
        <meshStandardMaterial color="#d4c0a0" />
      </mesh>
      {/* Left bar */}
      <mesh position={[-(w + borderWidth) / 2, 0, 0.01]}>
        <boxGeometry args={[borderWidth, h + borderWidth * 2, 0.04]} />
        <meshStandardMaterial color="#d4c0a0" />
      </mesh>
      {/* Right bar */}
      <mesh position={[(w + borderWidth) / 2, 0, 0.01]}>
        <boxGeometry args={[borderWidth, h + borderWidth * 2, 0.04]} />
        <meshStandardMaterial color="#d4c0a0" />
      </mesh>

      {/* Window pane dividers (cross shape) — in front of shader */}
      <mesh position={[0, 0, 0.015]}>
        <boxGeometry args={[w, 0.035, 0.02]} />
        <meshStandardMaterial color="#c0a880" />
      </mesh>
      <mesh position={[0, 0, 0.015]}>
        <boxGeometry args={[0.035, h, 0.02]} />
        <meshStandardMaterial color="#c0a880" />
      </mesh>
    </group>
  )
}

export function JapaneseRoom({ videoTexture: _vt, slideshowTexture: _st }: JapaneseRoomProps) {
  const { camera } = useThree()

  // ── Wall occlusion system ──
  const wallRefs = useRef<THREE.Mesh[]>([])
  const wallOpacities = useRef<number[]>([1, 1, 1, 1])
  const wallAttachmentRefs = useRef<(THREE.Group | null)[]>([null, null, null, null])

  const setWallRef = (index: number) => (mesh: THREE.Mesh | null) => {
    if (mesh) {
      wallRefs.current[index] = mesh
    }
  }

  const setWallAttachmentRef = (index: number) => (group: THREE.Group | null) => {
    wallAttachmentRefs.current[index] = group
  }

  useFrame((_, delta) => {
    const state = useGameStore.getState()
    const myId = state.mySessionId
    if (!myId) return

    const me = state.players.get(myId)
    if (!me) return

    const pos = getPlayerPosition(myId)
    if (!pos) return
    playerWorldPos.set(pos.x * WORLD_SCALE, 0.5, -pos.y * WORLD_SCALE)

    const dir = _scratchDir.copy(playerWorldPos).sub(camera.position).normalize()
    raycaster.set(camera.position, dir)

    const distToPlayer = camera.position.distanceTo(playerWorldPos)

    const walls = wallRefs.current

    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i]
      if (!wall) continue

      const mat = wall.material as THREE.ShaderMaterial | THREE.MeshStandardMaterial
      const intersects = raycaster.intersectObject(wall)

      const isBlocking = intersects.some((hit) => hit.distance < distToPlayer)

      const targetOpacity = isBlocking ? OCCLUDE_OPACITY : 1
      const t = 1 - Math.exp(-FADE_SPEED * delta)

      wallOpacities.current[i] += (targetOpacity - wallOpacities.current[i]) * t

      const opacity = wallOpacities.current[i]
      const faded = opacity < 0.99

      // Toggle depthWrite on the wall itself — faded walls still block depth otherwise.
      if ('uniforms' in mat && mat.uniforms.uOpacity) {
        mat.uniforms.uOpacity.value = opacity
        mat.depthWrite = !faded
      } else {
        const msm = mat as THREE.MeshStandardMaterial
        msm.opacity = opacity
        msm.depthWrite = !faded
      }

      const attachments = wallAttachmentRefs.current[i]
      if (attachments) {
        attachments.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const m = child.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial
            m.transparent = true
            m.opacity = opacity
            m.depthWrite = !faded
            m.side = faded ? THREE.DoubleSide : THREE.FrontSide
          }
        })
      }
    }
  })

  return (
    <group>
      {/* ── Floor — tatami mats ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <TatamiFloorMaterial />
      </mesh>

      {/* ── Back wall (-Z) — red/white stripes ── */}
      <mesh ref={setWallRef(0)} position={[0, WALL_HEIGHT / 2, -HALF_D]}>
        <planeGeometry args={[ROOM_W, WALL_HEIGHT]} />
        <StripedWallMaterial repeat={[8, 1]} />
      </mesh>

      {/* Back wall attachments: ocean window */}
      <group ref={setWallAttachmentRef(0)}>
        {/* Ocean view window — left of center on back wall */}
        <OceanWindow position={[-1.0, WALL_HEIGHT * 0.6, -HALF_D + 0.03]} size={[3.0, 1.4]} />
      </group>

      {/* ── Left wall (-X) — red/white stripes ── */}
      <mesh
        ref={setWallRef(1)}
        position={[-HALF_W, WALL_HEIGHT / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_D, WALL_HEIGHT]} />
        <StripedWallMaterial repeat={[7, 1]} />
      </mesh>

      {/* Left wall attachments: metal shelf + trophies */}
      <group ref={setWallAttachmentRef(1)}>
        <GLBModel
          src="/models/wooden-shelf.glb"
          position={[-(HALF_W - 0.25), 0, 0]}
          rotation={[0, Math.PI / 2, 0]}
          colorOverride="#7a7a7a"
          emissiveOverride="#888888"
          emissiveIntensity={0.15}
        />
        <GLBModel
          src="/models/trophy.glb"
          position={[-(HALF_W - 0.25), 0.57, -0.3]}
        />
        <GLBModel
          src="/models/trophy.glb"
          position={[-(HALF_W - 0.25), 0.57, 0]}
        />
        <GLBModel
          src="/models/trophy.glb"
          position={[-(HALF_W - 0.25), 0.57, 0.3]}
        />
      </group>

      {/* ── Right wall (+X) — red/white stripes ── */}
      <mesh
        ref={setWallRef(2)}
        position={[HALF_W, WALL_HEIGHT / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_D, WALL_HEIGHT]} />
        <StripedWallMaterial repeat={[7, 1]} />
      </mesh>

      {/* Right wall attachments (empty for now) */}
      <group ref={setWallAttachmentRef(2)} />

      {/* ── Front wall (+Z) — red/white stripes with shoji door ── */}
      <mesh ref={setWallRef(3)} position={[0, WALL_HEIGHT / 2, HALF_D]}>
        <planeGeometry args={[ROOM_W, WALL_HEIGHT]} />
        <StripedWallMaterial repeat={[8, 1]} />
      </mesh>

      {/* Front wall attachments: blue exit door */}
      <group ref={setWallAttachmentRef(3)}>
        <InteractableObject
          interactDistance={2.0}
          onInteract={() => useUIStore.getState().setLeaveRoomPromptOpen(true)}
        >
          <group position={[0, 0, HALF_D - 0.02]}>
            {/* Door frame — stone/cream surround */}
            {/* Top */}
            <mesh position={[0, 1.55, 0.01]}>
              <boxGeometry args={[0.95, 0.1, 0.06]} />
              <meshStandardMaterial color="#c8bfa8" />
            </mesh>
            {/* Left */}
            <mesh position={[-0.425, 0.75, 0.01]}>
              <boxGeometry args={[0.1, 1.5, 0.06]} />
              <meshStandardMaterial color="#c8bfa8" />
            </mesh>
            {/* Right */}
            <mesh position={[0.425, 0.75, 0.01]}>
              <boxGeometry args={[0.1, 1.5, 0.06]} />
              <meshStandardMaterial color="#c8bfa8" />
            </mesh>
            {/* Door panel — deep navy blue */}
            <mesh position={[0, 0.75, 0]}>
              <boxGeometry args={[0.75, 1.5, 0.05]} />
              <meshStandardMaterial color="#1a1a5e" emissive="#1a1a5e" emissiveIntensity={0.08} />
            </mesh>
            {/* Upper panels (recessed details) */}
            <mesh position={[-0.15, 1.25, 0.027]}>
              <boxGeometry args={[0.22, 0.22, 0.008]} />
              <meshStandardMaterial color="#222270" emissive="#222270" emissiveIntensity={0.05} />
            </mesh>
            <mesh position={[0.15, 1.25, 0.027]}>
              <boxGeometry args={[0.22, 0.22, 0.008]} />
              <meshStandardMaterial color="#222270" emissive="#222270" emissiveIntensity={0.05} />
            </mesh>
            {/* Middle panels */}
            <mesh position={[-0.15, 0.8, 0.027]}>
              <boxGeometry args={[0.22, 0.35, 0.008]} />
              <meshStandardMaterial color="#222270" emissive="#222270" emissiveIntensity={0.05} />
            </mesh>
            <mesh position={[0.15, 0.8, 0.027]}>
              <boxGeometry args={[0.22, 0.35, 0.008]} />
              <meshStandardMaterial color="#222270" emissive="#222270" emissiveIntensity={0.05} />
            </mesh>
            {/* Lower panels */}
            <mesh position={[-0.15, 0.3, 0.027]}>
              <boxGeometry args={[0.22, 0.3, 0.008]} />
              <meshStandardMaterial color="#222270" emissive="#222270" emissiveIntensity={0.05} />
            </mesh>
            <mesh position={[0.15, 0.3, 0.027]}>
              <boxGeometry args={[0.22, 0.3, 0.008]} />
              <meshStandardMaterial color="#222270" emissive="#222270" emissiveIntensity={0.05} />
            </mesh>
            {/* Door handle — brass */}
            <mesh position={[0.28, 0.75, 0.04]}>
              <boxGeometry args={[0.02, 0.12, 0.03]} />
              <meshStandardMaterial color="#c4a44a" metalness={0.8} roughness={0.3} />
            </mesh>
            {/* Mail slot — brass */}
            <mesh position={[0, 0.45, 0.03]}>
              <boxGeometry args={[0.2, 0.03, 0.02]} />
              <meshStandardMaterial color="#c4a44a" metalness={0.8} roughness={0.3} />
            </mesh>
          </group>
        </InteractableObject>
      </group>

      {/* ── Furniture ── */}

      {/* Futon along the right wall — interactable (sleep → dream mode) */}
      <InteractableObject
        interactDistance={2.0}
        onInteract={() => useUIStore.getState().setSleepPromptOpen(true)}
      >
        <GLBModel
          src="/models/futon.glb"
          position={[HALF_W - 0.7, 0, -0.2]}
          rotation={[0, -Math.PI / 2, 0]}
        />
      </InteractableObject>

      {/* Computer desk centered in front of the window */}
      <GLBModel
        src="/models/low-computer-desk.glb"
        position={[0, 0, -(HALF_D - 1.0)]}
      />

      {/* Egg computer on the desk — interactable */}
      <InteractableObject
        interactDistance={2.0}
        onInteract={() => useUIStore.getState().setComputerIframeOpen(true)}
        occludeHighlight
      >
        <GLBModel
          src="/models/retro-computer.glb"
          position={[0, 0.36, -(HALF_D - 1.0)]}
        />
      </InteractableObject>

      {/* Zabuton in front of the computer desk */}
      <GLBModel
        src="/models/zabuton.glb"
        position={[0, 0, -(HALF_D - 2.2)]}
      />

      {/* Low table with flower vase — center of the room */}
      <GLBModel src="/models/low-table-vase.glb" position={[0.5, 0, 0.5]} />

      {/* Zabuton near the table */}
      <GLBModel
        src="/models/zabuton.glb"
        position={[0.5, 0, 1.3]}
        rotation={[0, 0.2, 0]}
      />

      {/* Boombox on the low table — interactable, opens playlist panel */}
      <InteractableObject
        interactDistance={2.0}
        onInteract={() => {
          getNetwork().jukeboxConnect()
          useUIStore.getState().setDjQueueOpen(true)
        }}
      >
        <group position={[1.0, 0.21, 0.5]} rotation={[0, -0.3, 0]}>
          {/* Placeholder boombox (will be replaced by GLB model) */}
          {/* Main body */}
          <mesh>
            <boxGeometry args={[0.5, 0.25, 0.2]} />
            <meshStandardMaterial color="#333333" />
          </mesh>
          {/* Left speaker grille */}
          <mesh position={[-0.16, 0, 0.01]}>
            <cylinderGeometry args={[0.06, 0.06, 0.02, 12]} />
            <meshStandardMaterial color="#555555" metalness={0.3} roughness={0.7} />
          </mesh>
          {/* Right speaker grille */}
          <mesh position={[0.16, 0, 0.01]}>
            <cylinderGeometry args={[0.06, 0.06, 0.02, 12]} />
            <meshStandardMaterial color="#555555" metalness={0.3} roughness={0.7} />
          </mesh>
          {/* Antenna */}
          <mesh position={[0.15, 0.2, -0.05]} rotation={[0, 0, 0.15]}>
            <cylinderGeometry args={[0.005, 0.005, 0.2, 4]} />
            <meshStandardMaterial color="#888888" metalness={0.5} />
          </mesh>
          {/* CD slot */}
          <mesh position={[0, 0.04, 0.101]}>
            <boxGeometry args={[0.12, 0.01, 0.01]} />
            <meshStandardMaterial color="#222222" />
          </mesh>
          {/* Glowing display */}
          <mesh position={[0, 0.06, 0.101]}>
            <boxGeometry args={[0.12, 0.04, 0.005]} />
            <meshStandardMaterial color="#44ff88" emissive="#44ff88" emissiveIntensity={0.5} />
          </mesh>
        </group>
      </InteractableObject>

      {/* Red toy car — casually placed on the floor near the futon */}
      <GLBModel
        src="/models/toy-car.glb"
        position={[1.5, 0, 1.5]}
        rotation={[0, -0.6, 0]}
      />

      {/* ── Hanging ceiling lamp — center of room, floating (no ceiling) ── */}
      <GLBModel
        src="/models/ceiling-lamp.glb"
        position={[0.3, WALL_HEIGHT, 0.3]}
      />

      {/* ── Candles — scattered for warm glow ── */}
      {/* Candle on the low table */}
      <GLBModel
        src="/models/candle.glb"
        position={[-0.1, 0.205, 0.45]}
      />
      {/* Candle near the futon */}
      <GLBModel
        src="/models/candle.glb"
        position={[HALF_W - 1.5, 0, 0.8]}
      />
      {/* Candle near the left wall */}
      <GLBModel
        src="/models/candle.glb"
        position={[-(HALF_W - 0.5), 0, -0.5]}
      />

      {/* ── Skybox — nighttime ── */}
      <NightSky />

      {/* ── Lighting — cozy dark nighttime ── */}
      {/* Very dim ambient — just enough so nothing is pure black */}
      <ambientLight intensity={0.08} color="#332244" />

      {/* Hanging ceiling lamp — main warm light, shining downward */}
      <pointLight position={[0.3, WALL_HEIGHT - 0.75, 0.3]} intensity={1.2} color="#ffcc88" distance={6} decay={2} />

      {/* Candle on table — warm glow */}
      <pointLight position={[-0.1, 0.5, 0.45]} intensity={0.6} color="#ff9944" distance={3} decay={2} />

      {/* Candle near futon */}
      <pointLight position={[HALF_W - 1.5, 0.2, 0.8]} intensity={0.4} color="#ff8833" distance={3} decay={2} />

      {/* Candle near left wall */}
      <pointLight position={[-(HALF_W - 0.5), 0.2, -0.5]} intensity={0.4} color="#ff8833" distance={3} decay={2} />

      {/* Computer screen glow — purple-pink spill */}
      <pointLight position={[0, 0.6, -(HALF_D - 1.0)]} intensity={0.3} color="#cc88ff" distance={2.5} decay={2} />

      {/* Moonlight from the window — faint cool accent */}
      <pointLight position={[-1.0, 1.5, -(HALF_D - 0.3)]} intensity={0.15} color="#8899cc" distance={4} decay={2} />
    </group>
  )
}
