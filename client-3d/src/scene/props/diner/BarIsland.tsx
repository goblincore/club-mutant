// ── Bar island — L-shaped counter, cute 60s retro style ──
// Uses emissive to ensure pastel colors show through even in shadow
export function BarIsland({ position }: { position: [number, number, number] }) {
  const H = 0.38          // low counter — below waist height
  const D = 0.55
  const MAIN_LEN = 3.6    // main bar runs along Z
  const WING_LEN = 1.8    // short wing runs along X
  const TOP_COLOR = '#f5ead0'     // warm cream formica
  const FRONT_COLOR = '#ffc1d3'   // pastel pink (customer-facing)
  const BACK_COLOR = '#f0d6e0'    // light pink (bartender side)
  const CHROME_COLOR = '#d4cfc8'  // light silver
  const RAIL_COLOR = '#c0b8b0'    // warm silver

  // Single bar section helper — "front" = +Z side (chrome edge + foot rail)
  const BarSection = ({ len, rot, pos }: { len: number; rot: [number, number, number]; pos: [number, number, number] }) => (
    <group position={pos} rotation={rot}>
      {/* Counter top — warm cream formica */}
      <mesh position={[0, H, 0]}>
        <boxGeometry args={[len, 0.04, D]} />
        <meshStandardMaterial color={TOP_COLOR} emissive={TOP_COLOR} emissiveIntensity={0.3} roughness={0.4} metalness={0.02} />
      </mesh>

      {/* Chrome edge on counter top (front side) */}
      <mesh position={[0, H - 0.006, D / 2 - 0.01]}>
        <boxGeometry args={[len + 0.01, 0.024, 0.016]} />
        <meshStandardMaterial color={CHROME_COLOR} metalness={0.5} roughness={0.25} />
      </mesh>

      {/* Front face — pastel pink panel (customer-facing) */}
      <mesh position={[0, H / 2, D / 2]}>
        <boxGeometry args={[len, H, 0.05]} />
        <meshStandardMaterial color={FRONT_COLOR} emissive={FRONT_COLOR} emissiveIntensity={0.25} roughness={0.7} />
      </mesh>

      {/* Back panel — lighter pink */}
      <mesh position={[0, H / 2, -D / 2]}>
        <boxGeometry args={[len, H, 0.05]} />
        <meshStandardMaterial color={BACK_COLOR} emissive={BACK_COLOR} emissiveIntensity={0.2} roughness={0.75} />
      </mesh>

      {/* Chrome foot rail (front side) */}
      <mesh position={[0, 0.08, D / 2 + 0.04]}>
        <boxGeometry args={[len - 0.1, 0.020, 0.020]} />
        <meshStandardMaterial color={RAIL_COLOR} metalness={0.5} roughness={0.25} />
      </mesh>

      {/* Left end cap */}
      <mesh position={[-(len / 2), H / 2, 0]}>
        <boxGeometry args={[0.05, H, D]} />
        <meshStandardMaterial color={FRONT_COLOR} emissive={FRONT_COLOR} emissiveIntensity={0.22} roughness={0.7} />
      </mesh>

      {/* Right end cap */}
      <mesh position={[len / 2, H / 2, 0]}>
        <boxGeometry args={[0.05, H, D]} />
        <meshStandardMaterial color={FRONT_COLOR} emissive={FRONT_COLOR} emissiveIntensity={0.22} roughness={0.7} />
      </mesh>
    </group>
  )

  return (
    <group position={position}>
      {/* Main bar — runs along Z axis, front (chrome/rail) faces -X (room center) */}
      <BarSection len={MAIN_LEN} rot={[0, -Math.PI / 2, 0]} pos={[0, 0, 0]} />

      {/* Wing — extends from back end of main bar toward +X (right wall), closes off corridor */}
      <BarSection len={WING_LEN} rot={[0, Math.PI, 0]} pos={[(WING_LEN / 2) - D / 2, 0, (MAIN_LEN / 2) + D / 2 - 0.05]} />

      {/* Flower vases on counter top — cute 60s accent */}
      {([
        { pos: [-0.05,  -0.3] as [number, number], vaseColor: '#e8b4d0', flowerColor: '#ff88bb' },
        { pos: [-0.05, -1.4] as [number, number], vaseColor: '#b4d0e8', flowerColor: '#88ccff' },
        { pos: [-0.05,  0.6] as [number, number], vaseColor: '#d0e8b4', flowerColor: '#aaee66' },
      ]).map(({ pos: [px, pz], vaseColor, flowerColor }, i) => (
        <group key={i} position={[px, H + 0.02, pz]}>
          {/* Vase */}
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.03, 0.04, 0.10, 8]} />
            <meshStandardMaterial color={vaseColor} emissive={vaseColor} emissiveIntensity={0.3} roughness={0.5} />
          </mesh>
          {/* Flower head */}
          <mesh position={[0, 0.13, 0]}>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshStandardMaterial color={flowerColor} emissive={flowerColor} emissiveIntensity={0.35} roughness={0.6} />
          </mesh>
          {/* Stem */}
          <mesh position={[0, 0.09, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.06, 4]} />
            <meshStandardMaterial color="#66aa66" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
