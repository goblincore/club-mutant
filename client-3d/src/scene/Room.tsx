import { useRef, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { useGameStore, getPlayerPosition } from '../stores/gameStore'
import { useBoothStore } from '../stores/boothStore'
import { useUIStore } from '../stores/uiStore'
import { TvStaticFloorMaterial, FLOOR_SEGMENTS } from '../shaders/TvStaticFloor'
import { TrampolineGrid } from '../shaders/TrampolineGrid'
import { TrippySky } from '../shaders/TrippySky'
import { BrickWallMaterial } from '../shaders/BrickWallMaterial'
import { getDisplacementAt } from './TrampolineRipples'
import { InteractableObject } from './InteractableObject'
import { GLBModel } from './GLBModel'
import { MagazineRack } from './MagazineRack'
import './SpottedEggMaterial'
import { Sofa, PottedPlant, WaterStation } from './props/office/Furniture'
import { VideoDisplay, Door, PictureFrame } from './props/office/WallObjects'

// Preload GLB models to avoid pop-in
GLBModel.preload('/models/old-computer-desk.glb')
GLBModel.preload('/models/dj-booth.glb')
GLBModel.preload('/models/magazine-rack.glb')

interface RoomProps {
  videoTexture?: THREE.VideoTexture | null
  slideshowTexture?: THREE.Texture | null
}

const ROOM_SIZE = 12
const WALL_HEIGHT = 3
const WORLD_SCALE = 0.01

// Booth position in world coords (exported for interaction logic)
const HALF = ROOM_SIZE / 2
export const BOOTH_WORLD_Z = -(HALF - 2.5)
export const BOOTH_WORLD_X = 0

// 3 fixed DJ slot positions (world-X offsets from booth center)
// Slot 0 = right, Slot 1 = center, Slot 2 = left (from audience perspective)
export const DJ_SLOT_OFFSETS_X = [1.0, 0, -1.0] as const
export const MAX_DJ_SLOTS = 3

// Spot colors per egg (different color spots on each white egg)
const EGG_SPOT_COLORS = ['#22aa44', '#cc3388', '#3388dd'] as const

// Z offset behind booth for the orbs (-Z = toward back wall = behind the booth)
const ORB_BEHIND_Z = -0.8
const ORB_FLOAT_Y = 0.25

// Returns world-X offset for teleporting. Booth faces room directly — no rotation.
export function getDJSlotWorldX(slotIndex: number): number {
  return DJ_SLOT_OFFSETS_X[slotIndex] ?? 0
}

const FADE_SPEED = 6 // opacity lerp speed
const OCCLUDE_OPACITY = 0.08 // near-invisible when blocking

const raycaster = new THREE.Raycaster()
const playerWorldPos = new THREE.Vector3()
const _scratchDir = new THREE.Vector3()

// Spotted egg for a DJ slot — uses InteractableObject for highlight + click.
// Hidden entirely when a player occupies this slot.
function DJSlotOrb({
  slotIndex,
  xOffset,
  spotColor,
  occupied,
}: {
  slotIndex: number
  xOffset: number
  spotColor: string
  occupied: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const baseY = ORB_FLOAT_Y

  // Gentle bob + slow rotation
  useFrame((_, delta) => {
    if (!meshRef.current) return

    const t = performance.now() * 0.001
    meshRef.current.position.y = baseY + Math.sin(t * 1.5 + slotIndex * 2.1) * 0.03
    meshRef.current.rotation.y += delta * 0.3
  })

  const handleInteract = useCallback(() => {
    const booth = useBoothStore.getState()

    // Already connected / in queue
    if (booth.isConnected || booth.isInQueue) return

    // Queue full
    if (booth.djQueue.length >= MAX_DJ_SLOTS) return

    // Slot already taken
    if (booth.djQueue.some((e) => e.slotIndex === slotIndex)) return

    useUIStore.getState().setBoothPromptOpen(true, slotIndex)
  }, [slotIndex])

  // Hide egg when a player is sitting here
  if (occupied) return null

  return (
    <InteractableObject interactDistance={2.2} onInteract={handleInteract} hitboxPad={0.1}>
      <group position={[xOffset, 0, ORB_BEHIND_Z]}>
        <mesh ref={meshRef} position={[0, baseY, 0]}>
          <sphereGeometry args={[0.2, 20, 16]} />
          <spottedEggMaterial spotColor={spotColor} />
        </mesh>
      </group>
    </InteractableObject>
  )
}

// DJ booth — GLB static furniture + dynamic spotted egg slot orbs
function DJBooth({ position }: { position: [number, number, number] }) {
  const djQueue = useBoothStore((s) => s.djQueue)
  const occupiedSlots = new Set(djQueue.map((e) => e.slotIndex))

  return (
    <group position={position}>
      {/* Static furniture (table, legs, laptops, mixer, headphones, speakers) */}
      <GLBModel src="/models/dj-booth.glb" />

      {/* === Spotted egg DJ slot markers (behind booth) === */}
      {DJ_SLOT_OFFSETS_X.map((xOff, i) => (
        <DJSlotOrb
          key={`orb-${i}`}
          slotIndex={i}
          xOffset={xOff}
          spotColor={EGG_SPOT_COLORS[i]}
          occupied={occupiedSlots.has(i)}
        />
      ))}
    </group>
  )
}

// Wrapper that bobs its children with the trampoline ripple at (baseX, baseZ)
function BobbingGroup({
  baseX,
  baseZ,
  children,
}: {
  baseX: number
  baseZ: number
  children: React.ReactNode
}) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!groupRef.current) return

    const dy = getDisplacementAt(baseX, baseZ)
    groupRef.current.position.y = dy

    // Subtle tilt from slope (sample nearby points)
    const eps = 0.3
    const dxSlope = getDisplacementAt(baseX + eps, baseZ) - getDisplacementAt(baseX - eps, baseZ)
    const dzSlope = getDisplacementAt(baseX, baseZ + eps) - getDisplacementAt(baseX, baseZ - eps)

    groupRef.current.rotation.x = -dzSlope * 0.5
    groupRef.current.rotation.z = dxSlope * 0.5
  })

  return <group ref={groupRef}>{children}</group>
}

export function Room({ videoTexture, slideshowTexture }: RoomProps) {
  const half = ROOM_SIZE / 2
  const { camera } = useThree()

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

    // Player world position
    const pos = getPlayerPosition(myId)
    if (!pos) return
    playerWorldPos.set(pos.x * WORLD_SCALE, 0.5, -pos.y * WORLD_SCALE)

    // Direction from camera to player
    const dir = _scratchDir.copy(playerWorldPos).sub(camera.position).normalize()
    raycaster.set(camera.position, dir)

    const distToPlayer = camera.position.distanceTo(playerWorldPos)

    // Test each wall
    const walls = wallRefs.current

    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i]
      if (!wall) continue

      const mat = wall.material as THREE.ShaderMaterial | THREE.MeshStandardMaterial
      const intersects = raycaster.intersectObject(wall)

      // Wall is blocking if any intersection is between camera and player
      const isBlocking = intersects.some((hit) => hit.distance < distToPlayer)

      const targetOpacity = isBlocking ? OCCLUDE_OPACITY : 1
      const t = 1 - Math.exp(-FADE_SPEED * delta)

      wallOpacities.current[i] += (targetOpacity - wallOpacities.current[i]) * t

      const opacity = wallOpacities.current[i]
      const faded = opacity < 0.99

      // Support both ShaderMaterial (uOpacity uniform) and MeshStandardMaterial (.opacity)
      // Also toggle depthWrite on the wall itself — faded walls still block depth otherwise.
      if ('uniforms' in mat && mat.uniforms.uOpacity) {
        mat.uniforms.uOpacity.value = opacity
        mat.depthWrite = !faded
      } else {
        const msm = mat as THREE.MeshStandardMaterial
        msm.opacity = opacity
        msm.depthWrite = !faded
      }

      // Fade wall-mounted objects (TV, picture frames, door) to match.
      // Disable depthWrite when faded so characters behind them remain visible.
      // Switch to DoubleSide when faded so FrontSide planes are visible from behind.
      const attachments = wallAttachmentRefs.current[i]
      if (attachments) {
        attachments.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const m = child.material as any
            // Handle ShaderMaterial (AudioReactiveVideoMaterial) via uOpacity uniform
            if (m.uniforms?.uOpacity) {
              m.uniforms.uOpacity.value = opacity
              m.depthWrite = !faded
              m.side = faded ? THREE.DoubleSide : THREE.FrontSide
              return
            }
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
      {/* Floor — subdivided for trampoline ripple vertex displacement */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[ROOM_SIZE, ROOM_SIZE, FLOOR_SEGMENTS, FLOOR_SEGMENTS]} />
        <TvStaticFloorMaterial />
      </mesh>

      {/* Grid overlay — custom deforming grid that rides the ripples */}
      <TrampolineGrid roomSize={ROOM_SIZE} />

      {/* Back wall (-Z) */}
      <mesh ref={setWallRef(0)} position={[0, WALL_HEIGHT / 2, -half]}>
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <BrickWallMaterial repeat={[8, 4]} />
      </mesh>

      {/* Wall-mounted objects on back wall */}
      <group ref={setWallAttachmentRef(0)}>
        <VideoDisplay
          position={[0, WALL_HEIGHT * 0.55, -half + 0.02]}
          videoTexture={videoTexture}
          slideshowTexture={slideshowTexture}
        />
      </group>

      {/* Left wall (-X) */}
      <mesh
        ref={setWallRef(1)}
        position={[-half, WALL_HEIGHT / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <BrickWallMaterial repeat={[8, 4]} />
      </mesh>

      {/* Wall-mounted objects on left wall */}
      <group ref={setWallAttachmentRef(1)}>
        <PictureFrame
          position={[-half + 0.01, WALL_HEIGHT * 0.6, -2]}
          rotation={[0, Math.PI / 2, 0]}
          size={[1.2, 0.9]}
          imagePath="/textures/frames/frame1.png"
        />
        <PictureFrame
          position={[-half + 0.01, WALL_HEIGHT * 0.6, 2]}
          rotation={[0, Math.PI / 2, 0]}
          size={[1.2, 0.9]}
          imagePath="/textures/frames/frame2.png"
        />
      </group>

      {/* Right wall (+X) */}
      <mesh
        ref={setWallRef(2)}
        position={[half, WALL_HEIGHT / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <BrickWallMaterial repeat={[8, 4]} />
      </mesh>

      {/* Wall-mounted objects on right wall */}
      <group ref={setWallAttachmentRef(2)}>
        <PictureFrame
          position={[half - 0.01, WALL_HEIGHT * 0.6, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          size={[1.5, 1.0]}
          imagePath="/textures/frames/frame3.png"
        />
      </group>

      {/* Front wall (+Z) — has a door */}
      <mesh ref={setWallRef(3)} position={[0, WALL_HEIGHT / 2, half]}>
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <BrickWallMaterial repeat={[8, 4]} />
      </mesh>

      {/* Wall-mounted objects on front wall */}
      <group ref={setWallAttachmentRef(3)}>
        <Door position={[0, 0, half - 0.01]} />
      </group>

      {/* DJ Booth — forward from back wall, facing room directly (no rotation) */}
      <BobbingGroup baseX={0} baseZ={-(half - 2.5)}>
        <DJBooth position={[0, 0, -(half - 2.5)]} />
      </BobbingGroup>

      {/* Sofa — along right wall, facing inward */}
      <BobbingGroup baseX={half - 0.8} baseZ={1}>
        <Sofa position={[half - 0.8, 0, 1]} rotation={[0, -Math.PI / 2, 0]} />
      </BobbingGroup>

      {/* Potted plants */}
      <BobbingGroup baseX={-half + 0.5} baseZ={half - 0.5}>
        <PottedPlant position={[-half + 0.5, 0, half - 0.5]} scale={1.1} />
      </BobbingGroup>
      <BobbingGroup baseX={half - 0.5} baseZ={-(half - 0.5)}>
        <PottedPlant position={[half - 0.5, 0, -(half - 0.5)]} scale={0.9} />
      </BobbingGroup>
      <BobbingGroup baseX={-half + 0.5} baseZ={-1.5}>
        <PottedPlant position={[-half + 0.5, 0, -1.5]} scale={0.75} />
      </BobbingGroup>

      {/* Water station — left wall, toward front */}
      <BobbingGroup baseX={-half + 0.5} baseZ={2.5}>
        <WaterStation position={[-half + 0.5, 0, 2.5]} />
      </BobbingGroup>

      {/* Magazine rack — right wall, facing inward */}
      <BobbingGroup baseX={half - 0.6} baseZ={-1.5}>
        <InteractableObject
          interactDistance={2.5}
          onInteract={() => useUIStore.getState().setMagazineReaderOpen(true)}
          occludeHighlight
        >
          <MagazineRack position={[half - 0.6, 0, -1.5]} rotation={[0, -Math.PI / 2, 0]} />
        </InteractableObject>
      </BobbingGroup>

      {/* Old Dell computer desk — back-left corner, facing into room */}
      <BobbingGroup baseX={-(half - 1.2)} baseZ={-(half - 0.8)}>
        <InteractableObject
          interactDistance={2.5}
          onInteract={() => useUIStore.getState().setOsActive(true)}
          occludeHighlight
        >
          <GLBModel
            src="/models/old-computer-desk.glb"
            position={[-(half - 1.2), 0, -(half - 0.8)]}
            rotation={[0, Math.PI / 4, 0]}
          />
        </InteractableObject>
      </BobbingGroup>

      {/* Skybox */}
      <TrippySky />

      {/* Ambient light */}
      <ambientLight intensity={1.0} />

      {/* Directional light */}
      <directionalLight position={[3, 8, 5]} intensity={0.6} />
    </group>
  )
}
