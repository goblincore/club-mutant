import { useEffect, useCallback, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'

import { PaperDoll } from '../character/PaperDoll'
import type { CharacterEntry } from '../character/characterRegistry'

/** Inner scene: camera setup + single PaperDoll. Must be inside <Canvas>. */
function PreviewScene({ characterPath }: { characterPath: string }) {
  const { camera } = useThree()
  // Characters have feet at y=0, head at ~0.5–1.1 wu depending on scale.
  // Start camera centered at 0.55 (midpoint of tallest chars) so there's
  // no ugly jump before handleLayout fires.
  const targetY = useRef(0.55)

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
    camera.position.set(0, 0.55, 5)
    camera.lookAt(0, 0.55, 0)
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

interface CharacterSidePreviewProps {
  characters: CharacterEntry[]
  selectedIndex: number
  onSelect: (index: number) => void
  playerName: string
  onPlayerNameChange?: (name: string) => void
  onBack?: () => void
}

export function CharacterSidePreview({
  characters,
  selectedIndex,
  onSelect,
  playerName,
  onPlayerNameChange,
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
      {/* Header row: name input (left) + close button (right) */}
      <div className="flex items-center gap-1.5 px-2.5 pt-2.5 pb-0">
        {onPlayerNameChange ? (
          <input
            type="text"
            value={playerName}
            onChange={(e) => onPlayerNameChange(e.target.value)}
            maxLength={20}
            placeholder="your name"
            className="flex-1 min-w-0 bg-transparent border-b border-toxic-green/50
                       text-sm font-mono font-bold text-center py-0.5
                       placeholder-white/30 focus:outline-none focus:border-toxic-green
                       transition-colors"
            style={{ color: '#39ff14', textShadow: '0 0 8px rgba(57, 255, 20, 0.5)' }}
          />
        ) : (
          <p
            className="flex-1 text-sm font-mono font-bold text-center truncate"
            style={{ color: '#39ff14', textShadow: '0 0 8px rgba(57, 255, 20, 0.5)' }}
          >
            {playerName}
          </p>
        )}

        {/* × close / back button */}
        {onBack && (
          <button
            onClick={onBack}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded
                       text-white/50 hover:text-white transition-colors cursor-pointer text-base leading-none"
            style={{ fontFamily: 'monospace' }}
          >
            ×
          </button>
        )}
      </div>

      {/* Canvas area — full width, no side arrow constraints */}
      <div className="relative" style={{ height: 300 }}>
        <Canvas
          orthographic
          camera={{ position: [0, 0.55, 5], zoom: 170, near: 0.1, far: 100 }}
          dpr={1}
          gl={{ alpha: true, antialias: false }}
          style={{ background: 'transparent' }}
          onCreated={({ gl }) => { gl.setClearColor(0x000000, 0) }}
        >
          <PreviewScene characterPath={current.path} />
        </Canvas>
      </div>

      {/* Bottom nav row: ‹  counter  › */}
      <div className="flex items-center justify-between px-3 pb-3 pt-1">
        <button
          onClick={handlePrev}
          className="w-8 h-8 rounded-full flex items-center justify-center
                     text-white/70 hover:text-white text-lg font-bold
                     transition-all duration-200 hover:scale-110 cursor-pointer"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(57, 255, 20, 0.5)',
          }}
        >
          ‹
        </button>

        <span
          className="text-xs font-mono"
          style={{ color: 'rgba(57, 255, 20, 0.6)' }}
        >
          {selectedIndex + 1} / {N}
        </span>

        <button
          onClick={handleNext}
          className="w-8 h-8 rounded-full flex items-center justify-center
                     text-white/70 hover:text-white text-lg font-bold
                     transition-all duration-200 hover:scale-110 cursor-pointer"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(57, 255, 20, 0.5)',
          }}
        >
          ›
        </button>
      </div>
    </div>
  )
}
