import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useRef, useCallback, useEffect, useState } from 'react'
import * as THREE from 'three'
import { useUIStore } from '../stores/uiStore'
import { PsxPostProcess } from '../shaders/PsxPostProcess'
import { FpsCounter } from '../ui/FpsCounter'

import { Room } from './Room'
import { JapaneseRoom } from './JapaneseRoom'
import { JukeboxRoom } from './JukeboxRoom'
import { useDreamStore } from '../dream/dreamStore'
import { FollowCamera, wasCameraDrag } from './Camera'
import { PlayerEntity } from './PlayerEntity'
import { useGameStore } from '../stores/gameStore'
import { usePlayerInput, setClickTarget } from '../input/usePlayerInput'
import { useVideoBackground } from '../hooks/useVideoBackground'
import { useSlideshowTexture } from '../hooks/useSlideshowTexture'
import { characterPathForTextureId } from '../character/characterRegistry'

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

function Players() {
  const players = useGameStore((s) => s.players)
  const mySessionId = useGameStore((s) => s.mySessionId)
  const selectedCharacterPath = useGameStore((s) => s.selectedCharacterPath)

  return (
    <>
      {Array.from(players.entries()).map(([sessionId, player]) => {
        let characterPath: string
        if (sessionId === mySessionId) {
          characterPath = selectedCharacterPath
        } else if (player.isNpc && player.npcCharacterPath) {
          characterPath = player.npcCharacterPath
        } else {
          characterPath = characterPathForTextureId(player.textureId)
        }

        return (
          <PlayerEntity
            key={sessionId}
            player={player}
            isLocal={sessionId === mySessionId}
            characterPath={characterPath}
          />
        )
      })}
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

function SceneContent() {
  const videoTexture = useVideoBackground()
  const slideshowTexture = useSlideshowTexture(!videoTexture)
  const roomType = useGameStore((s) => s.roomType)
  const musicMode = useGameStore((s) => s.musicMode)
  const isDreaming = useDreamStore((s) => s.isDreaming)

  // Custom rooms with jukebox musicMode also use the JukeboxRoom scene
  const useJukeboxScene = roomType === 'jukebox' || (roomType === 'custom' && musicMode === 'jukebox')

  // Dream mode is now handled by a fullscreen iframe overlay (DreamIframe.tsx)
  // The 3D scene stays mounted underneath but is hidden by the iframe
  if (isDreaming) {
    return null
  }

  return (
    <>
      <DynamicBackground />
      {roomType === 'myroom' ? (
        <JapaneseRoom videoTexture={videoTexture} slideshowTexture={slideshowTexture} />
      ) : useJukeboxScene ? (
        <JukeboxRoom videoTexture={videoTexture} slideshowTexture={slideshowTexture} />
      ) : (
        <Room videoTexture={videoTexture} slideshowTexture={slideshowTexture} />
      )}
      <ClickPlane />
      <Players />
      <FollowCamera />
      <PsxPostProcess />
    </>
  )
}

const MAX_HEIGHT = 540

// Debug keyboard shortcuts for FPS and render quality
function useDebugKeys() {
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === '`') {
        useUIStore.getState().toggleFps()
      }

      if (e.key === '-' || e.key === '=') {
        useUIStore.getState().cycleRenderScale()
        const scale = useUIStore.getState().renderScale
        setToast(`render ${Math.round(scale * 100)}%`)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Auto-clear toast
  useEffect(() => {
    if (!toast) return

    const id = setTimeout(() => setToast(null), 1500)
    return () => clearTimeout(id)
  }, [toast])

  return toast
}

export function GameScene() {
  usePlayerInput()
  const toast = useDebugKeys()

  const showFps = useUIStore((s) => s.showFps)

  // Cap renderer at 540p — compute dpr so rendered height never exceeds MAX_HEIGHT
  const dpr = Math.min(1, MAX_HEIGHT / window.innerHeight)

  return (
    <>
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

      {showFps && <FpsCounter />}

      {toast && (
        <div
          className="fixed top-2 left-1/2 -translate-x-1/2 font-mono text-[12px] px-3 py-1.5 rounded bg-black/80 border border-white/15 text-yellow-300 pointer-events-none select-none"
          style={{ zIndex: 9999 }}
        >
          {toast}
        </div>
      )}
    </>
  )
}
