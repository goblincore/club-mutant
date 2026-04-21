import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { useGameStore, getPlayerPosition } from '../stores/gameStore'
import { useUIStore } from '../stores/uiStore'
import { getNetwork } from '../network/NetworkManager'
import { NightSky } from '../shaders/NightSky'
import { InteractableObject } from './InteractableObject'
import { CheckerFloor } from './props/diner/CheckerFloor'
import { DinerWallMaterial } from './props/diner/DinerWall'
import { DinerBooth } from './props/diner/DinerFurniture'
import { CounterStool, CounterProps } from './props/diner/DinerFurniture'
import { BarIsland } from './props/diner/BarIsland'
import { BackShelf } from './props/diner/BackShelf'
import { JukeboxMachine, JukeboxStatusBubble } from './props/JukeboxMachine'
import { HeavensNightSign } from './props/HeavensNightSign'
import { ArcadeMachine } from './props/ArcadeMachine'
import { Stage, STAGE_D } from './props/Stage'
import { VideoDisplay, WallRecord, DinerPoster } from './props/WallDecor'

interface JukeboxRoomProps {
  videoTexture?: THREE.VideoTexture | null
  slideshowTexture?: THREE.Texture | null
}

const ROOM_W = 9
const ROOM_D = 9
const WALL_HEIGHT = 3.0
const WORLD_SCALE = 0.01
const HALF_W = ROOM_W / 2
const HALF_D = ROOM_D / 2

// Stage world-space bounds (exported so PlayerEntity can do floor elevation)
export const JUKEBOX_STAGE_Z_MIN = HALF_D - 1.8 - 0.05   // back edge of stage
export const JUKEBOX_STAGE_Z_MAX = HALF_D - 0.05          // front edge
export const JUKEBOX_STAGE_X_MIN = -2.25
export const JUKEBOX_STAGE_X_MAX = 2.25
export const JUKEBOX_STAGE_HEIGHT = 0.3                    // world units

const FADE_SPEED = 6
const OCCLUDE_OPACITY = 0.08

const raycaster = new THREE.Raycaster()
const playerWorldPos = new THREE.Vector3()
const _scratchDir = new THREE.Vector3()

export function JukeboxRoom({ videoTexture, slideshowTexture }: JukeboxRoomProps) {
  const { camera } = useThree()

  const wallRefs = useRef<THREE.Mesh[]>([])
  const wallOpacities = useRef<number[]>([1, 1, 1, 1])
  const wallAttachmentRefs = useRef<(THREE.Group | null)[]>([null, null, null, null])

  const setWallRef = (index: number) => (mesh: THREE.Mesh | null) => {
    if (mesh) wallRefs.current[index] = mesh
  }
  const setWallAttachmentRef = (index: number) => (group: THREE.Group | null) => {
    wallAttachmentRefs.current[index] = group
  }

  useFrame((_, delta) => {
    const state = useGameStore.getState()
    const myId = state.mySessionId
    if (!myId) return
    const pos = getPlayerPosition(myId)
    if (!pos) return
    playerWorldPos.set(pos.x * WORLD_SCALE, 0.5, -pos.y * WORLD_SCALE)

    const dir = _scratchDir.copy(playerWorldPos).sub(camera.position).normalize()
    raycaster.set(camera.position, dir)
    const distToPlayer = camera.position.distanceTo(playerWorldPos)

    for (let i = 0; i < wallRefs.current.length; i++) {
      const wall = wallRefs.current[i]
      if (!wall) continue

      const mat = wall.material as THREE.ShaderMaterial | THREE.MeshStandardMaterial
      // Temporarily use DoubleSide for raycasting so backface hits (camera outside room) register
      const prevSide = (mat as THREE.Material).side
      ;(mat as THREE.Material).side = THREE.DoubleSide
      const isBlocking = raycaster
        .intersectObject(wall)
        .some((hit) => hit.distance < distToPlayer)
      ;(mat as THREE.Material).side = prevSide

      const targetOpacity = isBlocking ? OCCLUDE_OPACITY : 1
      const t = 1 - Math.exp(-FADE_SPEED * delta)
      wallOpacities.current[i] += (targetOpacity - wallOpacities.current[i]) * t

      const opacity = wallOpacities.current[i]
      const faded = opacity < 0.99

      // Update wall material opacity + depthWrite
      if ('uniforms' in mat) {
        const sm = mat as THREE.ShaderMaterial
        if (sm.uniforms?.uOpacity) sm.uniforms.uOpacity.value = opacity
        sm.depthWrite = !faded
      } else {
        const msm = mat as THREE.MeshStandardMaterial
        msm.opacity = opacity
        msm.depthWrite = !faded
      }

      // Update wall attachment opacity + depthWrite + side + emissive scaling
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
            if (!m.transparent) {
              m.transparent = true
              m.needsUpdate = true
            }
            m.opacity = opacity
            m.depthWrite = !faded
            m.side = faded ? THREE.DoubleSide : THREE.FrontSide
            // Scale down emissive glow so neon signs etc. fade with the wall
            if (typeof m.emissiveIntensity === 'number') {
              if (m.userData._baseEmissive === undefined) {
                m.userData._baseEmissive = m.emissiveIntensity
              }
              m.emissiveIntensity = m.userData._baseEmissive * opacity
            }
          }
        })
      }
    }
  })

  return (
    <group>
      {/* ── Sky — night / dusk ── */}
      <NightSky />

      {/* ── Checkerboard floor ── */}
      <CheckerFloor size={[ROOM_W, ROOM_D]} />

      {/* ── Ceiling — dark warm tin ceiling ── */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_HEIGHT, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color="#1c1008" roughness={0.9} />
      </mesh>

      {/* ── Back wall (-Z) — teal + cream diner ── */}
      <mesh ref={setWallRef(0)} position={[0, WALL_HEIGHT / 2, -HALF_D]}>
        <planeGeometry args={[ROOM_W, WALL_HEIGHT]} />
        <DinerWallMaterial />
      </mesh>

      {/* Back wall attachments: posters + vinyl records */}
      <group ref={setWallAttachmentRef(0)}>

        {/* Posters — left cluster */}
        <DinerPoster
          position={[-3.4, WALL_HEIGHT * 0.68, -HALF_D + 0.02]}
          rotation={[0, 0, 0]}
          bgColor="#0a0a18"
          accentColor="#2244cc"
          width={0.34}
          height={0.48}
        />
        <DinerPoster
          position={[-2.85, WALL_HEIGHT * 0.62, -HALF_D + 0.02]}
          rotation={[0, 0, -0.05]}
          bgColor="#0d0808"
          accentColor="#aa2211"
          width={0.30}
          height={0.42}
        />

        {/* Vinyl records on back wall upper area */}
        <WallRecord
          position={[-3.85, WALL_HEIGHT * 0.55, -HALF_D + 0.02]}
          rotation={[Math.PI / 2, 0, 0.3]}
          labelColor="#ffcc00"
        />
        <WallRecord
          position={[0.4, WALL_HEIGHT * 0.78, -HALF_D + 0.02]}
          rotation={[Math.PI / 2, 0, -0.2]}
          labelColor="#33aa55"
        />
      </group>

      {/* ── Left wall (-X) ── */}
      <mesh
        ref={setWallRef(1)}
        position={[-HALF_W, WALL_HEIGHT / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_D, WALL_HEIGHT]} />
        <DinerWallMaterial />
      </mesh>

      {/* Left wall attachments: posters + records */}
      <group ref={setWallAttachmentRef(1)}>
        {/* Tall poster above booth */}
        <DinerPoster
          position={[-HALF_W + 0.02, WALL_HEIGHT * 0.67, -2.2]}
          rotation={[0, Math.PI / 2, 0]}
          bgColor="#0a0d08"
          accentColor="#336611"
          width={0.40}
          height={0.56}
        />
        {/* Poster above second booth */}
        <DinerPoster
          position={[-HALF_W + 0.02, WALL_HEIGHT * 0.67, 0.4]}
          rotation={[0, Math.PI / 2, 0]}
          bgColor="#12080a"
          accentColor="#cc1133"
          width={0.38}
          height={0.52}
        />
        {/* Records between posters */}
        <WallRecord
          position={[-HALF_W + 0.02, WALL_HEIGHT * 0.73, -0.9]}
          rotation={[0, Math.PI / 2, 0.25]}
          labelColor="#ff4488"
        />
        <WallRecord
          position={[-HALF_W + 0.02, WALL_HEIGHT * 0.56, -1.4]}
          rotation={[0, Math.PI / 2, -0.3]}
          labelColor="#44ddff"
        />
        <WallRecord
          position={[-HALF_W + 0.02, WALL_HEIGHT * 0.58, 1.2]}
          rotation={[0, Math.PI / 2, 0.6]}
          labelColor="#ffcc00"
        />
      </group>

      {/* ── Right wall (+X) ── */}
      <mesh
        ref={setWallRef(2)}
        position={[HALF_W, WALL_HEIGHT / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_D, WALL_HEIGHT]} />
        <DinerWallMaterial />
      </mesh>

      {/* Right wall attachments: neon sign above shelf + posters */}
      <group ref={setWallAttachmentRef(2)}>
        {/* Heaven's Night neon sign — centered above the back shelf */}
        <HeavensNightSign
          position={[HALF_W - 0.04, WALL_HEIGHT * 0.72, -1.5]}
          rotation={[0, -Math.PI / 2, 0]}
        />

        <DinerPoster
          position={[HALF_W - 0.02, WALL_HEIGHT * 0.72, -2.8]}
          rotation={[0, -Math.PI / 2, 0]}
          bgColor="#0a0808"
          accentColor="#cc5511"
          width={0.36}
          height={0.50}
        />
        <DinerPoster
          position={[HALF_W - 0.02, WALL_HEIGHT * 0.68, -1.2]}
          rotation={[0, -Math.PI / 2, 0.04]}
          bgColor="#080a12"
          accentColor="#2255bb"
          width={0.32}
          height={0.46}
        />
        <WallRecord
          position={[HALF_W - 0.02, WALL_HEIGHT * 0.60, 0.8]}
          rotation={[0, -Math.PI / 2, 0.35]}
          labelColor="#cc3322"
        />
        <WallRecord
          position={[HALF_W - 0.02, WALL_HEIGHT * 0.74, 1.6]}
          rotation={[0, -Math.PI / 2, -0.2]}
          labelColor="#33aaff"
        />
      </group>

      {/* ── Front wall (+Z) — rotated to face inward (-Z) ── */}
      <mesh ref={setWallRef(3)} position={[0, WALL_HEIGHT / 2, HALF_D]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[ROOM_W, WALL_HEIGHT]} />
        <DinerWallMaterial />
      </mesh>

      {/* Front wall attachments: video screen above stage + posters flanking */}
      <group ref={setWallAttachmentRef(3)}>
        {/* Video screen — centered above the stage, facing into the room */}
        <VideoDisplay
          position={[0, WALL_HEIGHT * 0.72, HALF_D - 0.06]}
          rotation={[0, Math.PI, 0]}
          videoTexture={videoTexture}
          slideshowTexture={slideshowTexture}
        />

        <DinerPoster
          position={[-3.0, WALL_HEIGHT * 0.68, HALF_D - 0.02]}
          rotation={[0, Math.PI, 0]}
          bgColor="#080a14"
          accentColor="#1144cc"
          width={0.40}
          height={0.56}
        />
        <DinerPoster
          position={[3.0, WALL_HEIGHT * 0.68, HALF_D - 0.02]}
          rotation={[0, Math.PI, 0.04]}
          bgColor="#0e0808"
          accentColor="#cc2211"
          width={0.38}
          height={0.52}
        />
        <WallRecord
          position={[-2.3, WALL_HEIGHT * 0.72, HALF_D - 0.02]}
          rotation={[Math.PI / 2, 0, 0.4]}
          labelColor="#ffcc00"
        />
        <WallRecord
          position={[2.3, WALL_HEIGHT * 0.60, HALF_D - 0.02]}
          rotation={[Math.PI / 2, 0, -0.3]}
          labelColor="#44ddff"
        />
      </group>

      {/* ── Island bar — L-shaped, front faces room center (-X), bartender space behind (+X toward wall) ── */}
      <BarIsland position={[2.5, 0, -1.5]} />

      {/* ── Back shelf with bottles — flat against right wall, rotated 90° so shelves run along Z ── */}
      <BackShelf position={[HALF_W - 0.15, 0, -1.5]} rotation={[0, -Math.PI / 2, 0]} />

      {/* ── Counter stools — in front of the island bar (on -X side facing room center) ── */}
      <CounterStool position={[1.5, 0, -2.8]} />
      <CounterStool position={[1.5, 0, -1.5]} />
      <CounterStool position={[1.5, 0, -0.2]} />

      {/* Counter props on bar top — lowered to match H=0.38 */}
      <CounterProps position={[2.5, 0.38, -0.5]} />
      <CounterProps position={[2.5, 0.38, -2.2]} />

      {/* ── Arcade Machines ── */}
      <InteractableObject onInteract={() => useUIStore.getState().setOsActive(true)} occludeHighlight={false} interactDistance={2.5}>
        <ArcadeMachine position={[-HALF_W + 0.6, 0.05, 2.5]} rotation={[0, Math.PI / 5, 0]} theme="fighter" />
      </InteractableObject>
      <InteractableObject onInteract={() => useUIStore.getState().setOsActive(true)} occludeHighlight={false} interactDistance={2.5}>
        <ArcadeMachine position={[-HALF_W + 0.6, 0.05, 1.5]} rotation={[0, Math.PI / 4, 0]} theme="racer" />
      </InteractableObject>

      {/* ── Booth seating — along left wall (no tables, open floor) ── */}
      <DinerBooth
        position={[-HALF_W + 0.35, 0, -2.2]}
        rotation={[0, Math.PI / 2, 0]}
        width={1.6}
      />
      <DinerBooth
        position={[-HALF_W + 0.35, 0, 0.0]}
        rotation={[0, Math.PI / 2, 0]}
        width={1.6}
      />

      {/* ── Stage — along front wall (+Z), facing into room ── */}
      <group position={[0, 0, HALF_D - STAGE_D / 2 - 0.05]}>
        <Stage />
      </group>

      {/* ── Jukebox — back-center wall, slightly left ── */}
      <InteractableObject
        interactDistance={2.5}
        onInteract={() => {
          // Send connect request — if accepted, the schema callback auto-opens the panel.
          // If someone else is using it, server sends jukebox_busy toast.
          getNetwork().jukeboxConnect()
        }}
      >
        <JukeboxMachine position={[-0.6, 0, -(HALF_D - 0.3)]} />
      </InteractableObject>

      {/* Jukebox occupant status bubble */}
      <JukeboxStatusBubble position={[-0.6, 2.25, -(HALF_D - 0.3)]} />

      {/* ── Lighting ── bright cheerful 60s diner ── */}

      {/* Ambient — warmer and brighter for retro feel */}
      <ambientLight intensity={0.35} color="#ffeecc" />

      {/* Main ceiling light — centre of room */}
      <pointLight position={[0, WALL_HEIGHT - 0.2, 0]} intensity={1.0} color="#ffddbb" distance={9} decay={2} />

      {/* Bar island area — warm bright overhead */}
      <pointLight position={[2.5, WALL_HEIGHT - 0.2, -1.5]} intensity={1.3} color="#ffddaa" distance={5} decay={2} />


      {/* Stage wash — single warm overhead fill at stage center */}
      <pointLight
        position={[0.3, WALL_HEIGHT - 0.2, HALF_D - STAGE_D / 2 - 0.05]}
        intensity={2.5}
        color="#fff4cc"
        distance={4.0}
        decay={2}
      />

      {/* Jukebox glow — warm amber + pink */}
      <pointLight position={[-0.6, 1.2, -(HALF_D - 0.8)]} intensity={1.8} color="#ffaa22" distance={4} decay={2} />
      <pointLight position={[-0.6, 0.6, -(HALF_D - 0.6)]} intensity={0.8} color="#ff44aa" distance={2.5} decay={2} />

      {/* Neon sign glow — pink spill from right wall above shelf */}
      <pointLight position={[HALF_W - 0.6, WALL_HEIGHT * 0.72, -1.5]} intensity={2.0} color="#ff3388" distance={4.5} decay={2} />

      {/* Screen glow — blue-white */}
      <pointLight position={[1.8, WALL_HEIGHT * 0.68, -(HALF_D - 0.5)]} intensity={0.4} color="#88aaff" distance={3} decay={2} />
    </group>
  )
}
