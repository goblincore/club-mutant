import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { useBoothStore } from '../stores/boothStore'
import { useUIStore } from '../stores/uiStore'
import { PsxPostProcess } from '../shaders/PsxPostProcess'

import { Room, BOOTH_WORLD_X, BOOTH_WORLD_Z } from './Room'
import { FollowCamera, wasCameraDrag } from './Camera'
import { PlayerEntity } from './PlayerEntity'
import { useGameStore } from '../stores/gameStore'
import { usePlayerInput, setClickTarget } from '../input/usePlayerInput'
import { useVideoBackground } from '../hooks/useVideoBackground'

const WORLD_SCALE = 0.01

// Invisible ground plane for click-to-move raycasting
function ClickPlane() {
  const { camera, raycaster, pointer } = useThree()
  const planeRef = useRef<THREE.Mesh>(null)

  const handleClick = useCallback(() => {
    // Skip click-to-move if the user was dragging the camera
    if (wasCameraDrag) return
    if (!planeRef.current) return

    raycaster.setFromCamera(pointer, camera)
    const intersects = raycaster.intersectObject(planeRef.current)

    if (intersects.length > 0) {
      const point = intersects[0]!.point
      setClickTarget(point.x / WORLD_SCALE, -point.z / WORLD_SCALE)
    }
  }, [camera, raycaster, pointer])

  return (
    <mesh
      ref={planeRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.001, 0]}
      onClick={handleClick}
      visible={false}
    >
      <planeGeometry args={[100, 100]} />
      <meshBasicMaterial />
    </mesh>
  )
}

// Map textureId → character path (must match LobbyScreen CHARACTERS entries)
const TEXTURE_ID_TO_CHARACTER: Record<number, string> = {
  0: '/characters/default',
  1: '/characters/default2',
  2: '/characters/default3',
  3: '/characters/default4',
}

function characterPathForTextureId(textureId: number): string {
  return TEXTURE_ID_TO_CHARACTER[textureId] ?? '/characters/default'
}

function Players() {
  const players = useGameStore((s) => s.players)
  const mySessionId = useGameStore((s) => s.mySessionId)
  const selectedCharacterPath = useGameStore((s) => s.selectedCharacterPath)

  return (
    <>
      {Array.from(players.entries()).map(([sessionId, player]) => (
        <PlayerEntity
          key={sessionId}
          player={player}
          isLocal={sessionId === mySessionId}
          characterPath={
            sessionId === mySessionId
              ? selectedCharacterPath
              : characterPathForTextureId(player.textureId)
          }
        />
      ))}
    </>
  )
}

// Ensure scene.background is null so the TrippySky sphere is visible.
// When iframe video mode is active the canvas needs to be transparent (alpha: true on gl),
// which already works with background = null.
function DynamicBackground() {
  const { scene } = useThree()

  scene.background = null

  return null
}

const BOOTH_INTERACT_DIST = 1.8 // world units — how close you need to be to interact

function SceneContent() {
  const videoTexture = useVideoBackground()

  const handleBoothDoubleClick = useCallback(() => {
    const booth = useBoothStore.getState()

    // Already connected — no need to prompt
    if (booth.isConnected) return

    // Check proximity in world coords
    const state = useGameStore.getState()
    const px = state.localX * WORLD_SCALE
    const pz = -state.localY * WORLD_SCALE
    const dx = px - BOOTH_WORLD_X
    const dz = pz - BOOTH_WORLD_Z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < BOOTH_INTERACT_DIST) {
      useUIStore.getState().setBoothPromptOpen(true)
    }
  }, [])

  return (
    <>
      <DynamicBackground />
      <Room videoTexture={videoTexture} onBoothDoubleClick={handleBoothDoubleClick} />
      <ClickPlane />
      <Players />
      <FollowCamera />
      <PsxPostProcess />
    </>
  )
}

const MAX_HEIGHT = 540

export function GameScene() {
  usePlayerInput()

  // Cap renderer at 540p — compute dpr so rendered height never exceeds MAX_HEIGHT
  const dpr = Math.min(1, MAX_HEIGHT / window.innerHeight)

  return (
    <Canvas
      camera={{ position: [0, 8, 8], fov: 50, near: 0.1, far: 100 }}
      gl={{ antialias: false, alpha: true }}
      dpr={dpr}
      style={{ width: '100%', height: '100%' }}
    >
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>
    </Canvas>
  )
}
