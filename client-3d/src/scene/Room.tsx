import { Grid } from '@react-three/drei'

// A simple room environment — flat ground + grid, to be expanded later
export function Room() {
  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      {/* Grid overlay */}
      <Grid
        position={[0, 0, 0]}
        args={[20, 20]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#2a2a4a"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#3a3a6a"
        fadeDistance={25}
        infiniteGrid
      />

      {/* Ambient light */}
      <ambientLight intensity={0.6} />

      {/* Directional light for subtle shadows */}
      <directionalLight position={[5, 10, 5]} intensity={0.4} />
    </group>
  )
}
