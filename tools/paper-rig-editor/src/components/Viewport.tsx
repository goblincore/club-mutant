import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'

import { CharacterRenderer } from './CharacterRenderer'
import { useEditorStore } from '../store'

export function Viewport() {
  const psxEnabled = useEditorStore((s) => s.psxEnabled)

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: [0, 0, 3], fov: 45, near: 0.01, far: 100 }}
        gl={{
          antialias: !psxEnabled,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        style={{ background: '#1a1a2e' }}
        onPointerMissed={() => {
          useEditorStore.getState().selectPart(null)
        }}
        onCreated={({ gl }) => {
          // Ensure transparent objects respect renderOrder
          gl.sortObjects = true
        }}
      >
        <ambientLight intensity={1} />

        <CharacterRenderer />

        <Grid
          args={[10, 10]}
          cellSize={0.1}
          cellColor="#333355"
          sectionSize={1}
          sectionColor="#444477"
          fadeDistance={10}
          position={[0, -1.5, 0]}
          rotation={[0, 0, 0]}
        />

        <OrbitControls
          makeDefault
          enablePan
          enableZoom
          enableRotate
          minDistance={0.5}
          maxDistance={10}
          target={[0, 0, 0]}
        />
      </Canvas>

      {/* PSX resolution overlay label */}
      {psxEnabled && (
        <div className="absolute bottom-2 right-2 text-xs text-green-400 font-mono opacity-60">
          PSX MODE
        </div>
      )}
    </div>
  )
}
