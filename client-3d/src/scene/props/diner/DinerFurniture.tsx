// ── Diner booth — red vinyl bench seats ──
export function DinerBooth({
  position,
  rotation = [0, 0, 0],
  width = 1.8,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  width?: number
}) {
  const SEAT_H = 0.42
  const SEAT_D = 0.55
  const BACK_H = 0.5
  const VINYL = '#c0151a'
  const FRAME = '#1a1a1a'

  return (
    <group position={position} rotation={rotation}>
      {/* Seat */}
      <mesh position={[0, SEAT_H, 0]}>
        <boxGeometry args={[width, 0.1, SEAT_D]} />
        <meshStandardMaterial color={VINYL} roughness={0.6} />
      </mesh>

      {/* Seat base */}
      <mesh position={[0, SEAT_H / 2, 0]}>
        <boxGeometry args={[width, SEAT_H, SEAT_D]} />
        <meshStandardMaterial color={FRAME} roughness={0.8} />
      </mesh>

      {/* Back rest */}
      <mesh position={[0, SEAT_H + BACK_H / 2 + 0.05, -(SEAT_D / 2) + 0.08]}>
        <boxGeometry args={[width, BACK_H, 0.1]} />
        <meshStandardMaterial color={VINYL} roughness={0.6} />
      </mesh>

      {/* Back rest frame */}
      <mesh position={[0, SEAT_H + BACK_H / 2, -(SEAT_D / 2) + 0.03]}>
        <boxGeometry args={[width + 0.02, BACK_H + 0.1, 0.06]} />
        <meshStandardMaterial color={FRAME} roughness={0.8} />
      </mesh>
    </group>
  )
}

// ── Diner table — chrome legs, formica top ──
export function DinerTable({
  position,
  rotation = [0, 0, 0],
  size = [1.1, 0.65] as [number, number],
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  size?: [number, number]
}) {
  const TABLE_H = 0.76
  const [tw, td] = size

  return (
    <group position={position} rotation={rotation}>
      {/* Tabletop — pale formica */}
      <mesh position={[0, TABLE_H, 0]}>
        <boxGeometry args={[tw, 0.04, td]} />
        <meshStandardMaterial color="#e8e2d4" roughness={0.4} metalness={0.05} />
      </mesh>

      {/* Chrome edge band */}
      <mesh position={[0, TABLE_H - 0.01, 0]}>
        <boxGeometry args={[tw + 0.01, 0.025, td + 0.01]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Single chrome pedestal leg */}
      <mesh position={[0, TABLE_H / 2, 0]}>
        <cylinderGeometry args={[0.025, 0.025, TABLE_H, 8]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Foot base */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.04, 12]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Salt & pepper shakers */}
      {[-0.12, 0.12].map((xOff, i) => (
        <mesh key={i} position={[xOff, TABLE_H + 0.055, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.07, 8]} />
          <meshStandardMaterial color={i === 0 ? '#f0f0f0' : '#222'} roughness={0.5} />
        </mesh>
      ))}

      {/* Ketchup bottle */}
      <mesh position={[0, TABLE_H + 0.07, 0.12]}>
        <cylinderGeometry args={[0.018, 0.022, 0.1, 8]} />
        <meshStandardMaterial color="#c0201a" roughness={0.6} />
      </mesh>
    </group>
  )
}

// ── Counter stool — chrome post + pastel pink vinyl seat ──
export function CounterStool({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Seat cushion — small pastel pink to match bar (H=0.38 bar → seat at ~0.28) */}
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.045, 8]} />
        <meshStandardMaterial color="#ffc1d3" emissive="#ffc1d3" emissiveIntensity={0.2} roughness={0.6} />
      </mesh>

      {/* Post — short to match low bar */}
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.28, 6]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.85} roughness={0.15} />
      </mesh>

      {/* Foot ring */}
      <mesh position={[0, 0.10, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.10, 0.010, 6, 12]} />
        <meshStandardMaterial color="#aaaaaa" metalness={0.7} roughness={0.2} />
      </mesh>

      {/* Base */}
      <mesh position={[0, 0.018, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.03, 8]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  )
}

// ── Milkshake / menu stand props for the counter ──
export function CounterProps({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Menu stand */}
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.12, 0.22, 0.015]} />
        <meshStandardMaterial color="#cc3322" roughness={0.7} />
      </mesh>

      {/* Milkshake glass */}
      <mesh position={[0.18, 0.1, 0]}>
        <cylinderGeometry args={[0.025, 0.02, 0.16, 8]} />
        <meshStandardMaterial color="#f0e8d0" transparent opacity={0.7} roughness={0.2} />
      </mesh>

      {/* Straw */}
      <mesh position={[0.185, 0.17, 0]} rotation={[0.2, 0, 0.15]}>
        <cylinderGeometry args={[0.004, 0.004, 0.12, 6]} />
        <meshStandardMaterial color="#ff6688" />
      </mesh>
    </group>
  )
}
