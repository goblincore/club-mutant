import { useRef, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import * as THREE from 'three'

import { useGameStore } from '../stores/gameStore'
import { TvStaticFloorMaterial } from '../shaders/TvStaticFloor'
import { TrippySky } from '../shaders/TrippySky'
import { BrickWallMaterial } from '../shaders/BrickWallMaterial'

interface RoomProps {
  videoTexture?: THREE.VideoTexture | null
  onBoothDoubleClick?: () => void
}

const ROOM_SIZE = 12
const WALL_HEIGHT = 3
const FLOOR_COLOR = '#f5d442'
const WORLD_SCALE = 0.01

// Booth position in world coords (exported for interaction logic)
const HALF = ROOM_SIZE / 2
export const BOOTH_WORLD_Z = -(HALF - 2.5)
export const BOOTH_WORLD_X = 0

const FADE_SPEED = 6 // opacity lerp speed
const OCCLUDE_OPACITY = 0.08 // near-invisible when blocking

const raycaster = new THREE.Raycaster()
const playerWorldPos = new THREE.Vector3()

// DJ booth — foldable table with laptop, mixer, and amp stacks
function DJBooth({
  position,
  onDoubleClick,
}: {
  position: [number, number, number]
  onDoubleClick?: () => void
}) {
  const TABLE_Y = 0.72
  const TABLE_W = 2.2
  const TABLE_D = 0.7

  return (
    <group position={position}>
      {/* Invisible click-capture box covering the whole booth */}
      <mesh position={[0, 0.75, 0]} onDoubleClick={onDoubleClick} visible={false}>
        <boxGeometry args={[4.5, 1.8, 1.4]} />
        <meshBasicMaterial />
      </mesh>

      {/* === Foldable table === */}
      {/* Table top — thin slab */}
      <mesh position={[0, TABLE_Y, 0]}>
        <boxGeometry args={[TABLE_W, 0.03, TABLE_D]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>

      {/* Table legs (4 thin cylinders, slightly angled inward) */}
      {[
        [-TABLE_W / 2 + 0.08, 0, -TABLE_D / 2 + 0.06],
        [TABLE_W / 2 - 0.08, 0, -TABLE_D / 2 + 0.06],
        [-TABLE_W / 2 + 0.08, 0, TABLE_D / 2 - 0.06],
        [TABLE_W / 2 - 0.08, 0, TABLE_D / 2 - 0.06],
      ].map(([lx, _, lz], i) => (
        <mesh key={`leg-${i}`} position={[lx, TABLE_Y / 2, lz]}>
          <cylinderGeometry args={[0.015, 0.02, TABLE_Y, 6]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}

      {/* Cross brace under table */}
      <mesh position={[0, TABLE_Y * 0.35, 0]}>
        <boxGeometry args={[TABLE_W - 0.3, 0.015, 0.015]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* === Laptop === */}
      {/* Laptop base */}
      <mesh position={[-0.35, TABLE_Y + 0.025, 0.05]}>
        <boxGeometry args={[0.5, 0.02, 0.35]} />
        <meshStandardMaterial color="#222222" metalness={0.3} roughness={0.6} />
      </mesh>

      {/* Laptop screen (angled back ~110 degrees) */}
      <group position={[-0.35, TABLE_Y + 0.025, -0.12]} rotation={[-0.35, 0, 0]}>
        {/* Screen bezel */}
        <mesh position={[0, 0.17, 0]}>
          <boxGeometry args={[0.48, 0.34, 0.015]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>

        {/* Screen display */}
        <mesh position={[0, 0.17, 0.009]}>
          <planeGeometry args={[0.42, 0.28]} />
          <meshStandardMaterial color="#3344aa" emissive="#2233aa" emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* Laptop keyboard area (subtle lighter keys) */}
      <mesh position={[-0.35, TABLE_Y + 0.036, 0.08]}>
        <planeGeometry args={[0.4, 0.2]} />
        <meshStandardMaterial color="#2d2d2d" />
      </mesh>

      {/* === Mixer === */}
      <mesh position={[0.3, TABLE_Y + 0.04, 0]}>
        <boxGeometry args={[0.4, 0.05, 0.3]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      {/* Mixer faders (3 thin strips) */}
      {[-0.08, 0, 0.08].map((fx, i) => (
        <mesh key={`fader-${i}`} position={[0.3 + fx, TABLE_Y + 0.068, 0]}>
          <boxGeometry args={[0.03, 0.008, 0.2]} />
          <meshStandardMaterial color="#444466" />
        </mesh>
      ))}

      {/* Mixer knobs (small cylinders) */}
      {[
        [0.3 - 0.12, 0.12],
        [0.3, 0.12],
        [0.3 + 0.12, 0.12],
        [0.3 - 0.12, -0.1],
        [0.3 + 0.12, -0.1],
      ].map(([kx, kz], i) => (
        <mesh
          key={`knob-${i}`}
          position={[kx, TABLE_Y + 0.075, kz]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.018, 0.018, 0.015, 8]} />
          <meshStandardMaterial color="#666688" metalness={0.5} roughness={0.3} />
        </mesh>
      ))}

      {/* === Headphones (draped on table edge) === */}
      {/* Headband arc */}
      <mesh position={[0.7, TABLE_Y + 0.06, 0.15]} rotation={[0, 0.3, Math.PI / 2]}>
        <torusGeometry args={[0.08, 0.012, 8, 12, Math.PI]} />
        <meshStandardMaterial color="#222222" />
      </mesh>

      {/* Left ear cup */}
      <mesh position={[0.7, TABLE_Y + 0.02, 0.07]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.025, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* Right ear cup */}
      <mesh position={[0.7, TABLE_Y + 0.02, 0.23]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.025, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* === Amp stacks (left) === */}
      {/* Bottom amp */}
      <mesh position={[-1.6, 0.4, -0.1]}>
        <boxGeometry args={[0.6, 0.8, 0.5]} />
        <meshStandardMaterial color="#0d0d1a" />
      </mesh>

      {/* Top amp */}
      <mesh position={[-1.6, 1.05, -0.1]}>
        <boxGeometry args={[0.6, 0.5, 0.5]} />
        <meshStandardMaterial color="#0d0d1a" />
      </mesh>

      {/* Left speaker cones */}
      <mesh position={[-1.6, 0.4, 0.16]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.04, 12]} />
        <meshStandardMaterial color="#222244" />
      </mesh>

      <mesh position={[-1.6, 1.05, 0.16]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 0.04, 12]} />
        <meshStandardMaterial color="#222244" />
      </mesh>

      {/* === Amp stacks (right) === */}
      {/* Bottom amp */}
      <mesh position={[1.6, 0.4, -0.1]}>
        <boxGeometry args={[0.6, 0.8, 0.5]} />
        <meshStandardMaterial color="#0d0d1a" />
      </mesh>

      {/* Top amp */}
      <mesh position={[1.6, 1.05, -0.1]}>
        <boxGeometry args={[0.6, 0.5, 0.5]} />
        <meshStandardMaterial color="#0d0d1a" />
      </mesh>

      {/* Right speaker cones */}
      <mesh position={[1.6, 0.4, 0.16]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.04, 12]} />
        <meshStandardMaterial color="#222244" />
      </mesh>

      <mesh position={[1.6, 1.05, 0.16]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 0.04, 12]} />
        <meshStandardMaterial color="#222244" />
      </mesh>
    </group>
  )
}

// Door — recessed rectangle with a frame and handle knob
function Door({ position }: { position: [number, number, number] }) {
  const doorWidth = 1.6
  const doorHeight = 2.4

  return (
    <group position={position}>
      {/* Door frame (slightly larger, dark wood color) */}
      <mesh position={[0, doorHeight / 2, 0]}>
        <planeGeometry args={[doorWidth + 0.15, doorHeight + 0.08]} />
        <meshStandardMaterial color="#1a0e08" />
      </mesh>

      {/* Door panel */}
      <mesh position={[0, doorHeight / 2, 0.01]}>
        <planeGeometry args={[doorWidth, doorHeight]} />
        <meshStandardMaterial color="#3d1f0e" />
      </mesh>

      {/* Upper door panel inset */}
      <mesh position={[0, doorHeight * 0.68, 0.02]}>
        <planeGeometry args={[doorWidth * 0.7, doorHeight * 0.28]} />
        <meshStandardMaterial color="#4a2814" />
      </mesh>

      {/* Lower door panel inset */}
      <mesh position={[0, doorHeight * 0.3, 0.02]}>
        <planeGeometry args={[doorWidth * 0.7, doorHeight * 0.32]} />
        <meshStandardMaterial color="#4a2814" />
      </mesh>

      {/* Door handle */}
      <mesh position={[doorWidth * 0.35, doorHeight * 0.45, 0.04]}>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshStandardMaterial color="#c4a44a" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  )
}

// Picture frame — wooden border with image texture (or gray placeholder)
function PictureFrame({
  position,
  rotation,
  size,
  imagePath,
}: {
  position: [number, number, number]
  rotation: [number, number, number]
  size: [number, number]
  imagePath: string
}) {
  const frameDepth = 0.06
  const borderWidth = 0.08
  const [w, h] = size

  // Try loading the image texture; fall back to null on error
  const texture = useRef<THREE.Texture | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loader = new THREE.TextureLoader()

    loader.load(
      imagePath,
      (tex) => {
        tex.minFilter = THREE.NearestFilter
        tex.magFilter = THREE.NearestFilter
        texture.current = tex
        setLoaded(true)
      },
      undefined,
      () => {
        // Image not found — use placeholder
        setLoaded(true)
      }
    )
  }, [imagePath])

  return (
    <group position={position} rotation={rotation}>
      {/* Frame border */}
      <mesh position={[0, 0, -frameDepth / 2]}>
        <boxGeometry args={[w + borderWidth * 2, h + borderWidth * 2, frameDepth]} />
        <meshStandardMaterial color="#2a1506" />
      </mesh>

      {/* Inner image or placeholder */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[w, h]} />
        {texture.current ? (
          <meshBasicMaterial map={texture.current} toneMapped={false} />
        ) : (
          <meshStandardMaterial color={loaded ? '#333' : '#222'} />
        )}
      </mesh>
    </group>
  )
}

export function Room({ videoTexture, onBoothDoubleClick }: RoomProps) {
  const half = ROOM_SIZE / 2
  const { camera } = useThree()

  const wallRefs = useRef<THREE.Mesh[]>([])
  const wallOpacities = useRef<number[]>([1, 1, 1, 1])

  const setWallRef = (index: number) => (mesh: THREE.Mesh | null) => {
    if (mesh) {
      wallRefs.current[index] = mesh
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

      const mat = wall.material as THREE.ShaderMaterial | THREE.MeshStandardMaterial
      const intersects = raycaster.intersectObject(wall)

      // Wall is blocking if any intersection is between camera and player
      const isBlocking = intersects.some((hit) => hit.distance < distToPlayer)

      const targetOpacity = isBlocking ? OCCLUDE_OPACITY : 1
      const t = 1 - Math.exp(-FADE_SPEED * delta)

      wallOpacities.current[i] += (targetOpacity - wallOpacities.current[i]) * t

      // Support both ShaderMaterial (uOpacity uniform) and MeshStandardMaterial (.opacity)
      if ('uniforms' in mat && mat.uniforms.uOpacity) {
        mat.uniforms.uOpacity.value = wallOpacities.current[i]
      } else {
        ;(mat as THREE.MeshStandardMaterial).opacity = wallOpacities.current[i]
      }
    }
  })

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[ROOM_SIZE, ROOM_SIZE]} />
        {videoTexture ? (
          <meshBasicMaterial map={videoTexture} toneMapped={false} />
        ) : (
          <TvStaticFloorMaterial />
        )}
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
        <BrickWallMaterial repeat={[8, 4]} />
      </mesh>

      {/* Left wall (-X) */}
      <mesh
        ref={setWallRef(1)}
        position={[-half, WALL_HEIGHT / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <BrickWallMaterial repeat={[8, 4]} />
      </mesh>

      {/* Right wall (+X) */}
      <mesh
        ref={setWallRef(2)}
        position={[half, WALL_HEIGHT / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <BrickWallMaterial repeat={[8, 4]} />
      </mesh>

      {/* Front wall (+Z) — has a door */}
      <mesh ref={setWallRef(3)} position={[0, WALL_HEIGHT / 2, half]}>
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <BrickWallMaterial repeat={[8, 4]} />
      </mesh>

      {/* Door on front wall */}
      <Door position={[0, 0, half - 0.01]} />

      {/* Picture frames */}
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
      <PictureFrame
        position={[half - 0.01, WALL_HEIGHT * 0.6, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        size={[1.5, 1.0]}
        imagePath="/textures/frames/frame3.png"
      />

      {/* DJ Booth — forward from back wall, rotated to face room */}
      <group position={[0, 0, -(half - 2.5)]} rotation={[0, Math.PI, 0]}>
        <DJBooth position={[0, 0, 0]} onDoubleClick={onBoothDoubleClick} />
      </group>

      {/* Skybox */}
      <TrippySky />

      {/* Ambient light */}
      <ambientLight intensity={1.0} />

      {/* Directional light */}
      <directionalLight position={[3, 8, 5]} intensity={0.6} />
    </group>
  )
}
