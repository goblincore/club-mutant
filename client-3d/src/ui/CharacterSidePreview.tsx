import { useEffect, useCallback, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'

import { PaperDoll } from '../character/PaperDoll'
import type { CharacterEntry } from '../character/characterRegistry'

interface CharacterSidePreviewProps {
  characters: CharacterEntry[]
  selectedIndex: number
  onSelect: (index: number) => void
  playerName: string
  onBack?: () => void
}

/** Inner scene: camera setup + single PaperDoll. Must be inside <Canvas>. */
function PreviewScene({ characterPath }: { characterPath: string }) {
  const { camera } = useThree()
  const targetY = useRef(0.5)

  const handleLayout = useCallback(
    (layout: { worldHeight: number; headTopY: number; visualTopY: number }) => {
      // Center camera on the vertical midpoint of the character
      targetY.current = layout.visualTopY / 2
    },
    []
  )

  useFrame(() => {
    // Smoothly lerp camera to center on the character
    const cy = camera.position.y
    const ty = targetY.current
    if (Math.abs(cy - ty) > 0.001) {
      const newY = cy + (ty - cy) * 0.15
      camera.position.y = newY
      camera.lookAt(0, newY, 0)
      camera.updateProjectionMatrix()
    }
  })

  useEffect(() => {
    camera.position.set(0, 0.5, 5)
    camera.lookAt(0, 0.5, 0)
    camera.updateProjectionMatrix()
  }, [camera])

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[2, 5, 3]} intensity={0.5} />
      <PaperDoll
        characterPath={characterPath}
        animationName="idle"
        onLayout={handleLayout}
      />
    </>
  )
}

export function CharacterSidePreview({
  characters,
  selectedIndex,
  onSelect,
  playerName,
  onBack,
}: CharacterSidePreviewProps) {
  const N = characters.length
  const current = characters[selectedIndex]
  if (!current || N === 0) return null

  const handlePrev = () => onSelect((selectedIndex - 1 + N) % N)
  const handleNext = () => onSelect((selectedIndex + 1) % N)

  return (
    <div
      className="shrink-0 flex flex-col rounded-xl overflow-hidden w-full sm:w-[220px] mx-auto sm:mx-0"
      style={{
        maxWidth: 280,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(57, 255, 20, 0.4)',
        boxShadow: '0 0 30px rgba(57, 255, 20, 0.15)',
      }}
    >
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="self-start px-3 pt-2.5 pb-0 text-sm font-mono cursor-pointer
                     transition-colors"
          style={{ color: '#39ff14', textShadow: '0 0 6px rgba(57, 255, 20, 0.4)' }}
        >
          ← back
        </button>
      )}

      {/* Canvas area with arrow overlays */}
      <div className="relative" style={{ height: 280 }}>
        <Canvas
          orthographic
          camera={{ position: [0, 0.5, 5], zoom: 110, near: 0.1, far: 100 }}
          dpr={1}
          gl={{ alpha: true, antialias: false }}
          style={{ background: 'transparent' }}
          onCreated={({ gl }) => { gl.setClearColor(0x000000, 0) }}
        >
          <PreviewScene characterPath={current.path} />
        </Canvas>

        {/* Left arrow */}
        <button
          onClick={handlePrev}
          className="absolute left-2 top-1/2 -translate-y-1/2
                     w-7 h-7 rounded-full flex items-center justify-center
                     text-white/70 hover:text-white text-sm font-bold
                     transition-all duration-200 hover:scale-110 cursor-pointer"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(57, 255, 20, 0.5)',
          }}
        >
          &lsaquo;
        </button>

        {/* Right arrow */}
        <button
          onClick={handleNext}
          className="absolute right-2 top-1/2 -translate-y-1/2
                     w-7 h-7 rounded-full flex items-center justify-center
                     text-white/70 hover:text-white text-sm font-bold
                     transition-all duration-200 hover:scale-110 cursor-pointer"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(57, 255, 20, 0.5)',
          }}
        >
          &rsaquo;
        </button>
      </div>

      {/* Player name */}
      <div className="px-3 py-2.5 text-center font-mono">
        <p
          className="text-sm font-bold truncate"
          style={{ color: '#39ff14', textShadow: '0 0 8px rgba(57, 255, 20, 0.5)' }}
        >
          {playerName}
        </p>
      </div>
    </div>
  )
}
