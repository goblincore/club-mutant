// ── Back shelf — bottles behind the bar against the right wall — 60s retro ──
// Rotation prop so it can be oriented flat against the wall
export function BackShelf({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  const SHELF_W = 3.2
  const SHELF_D = 0.25
  const BACK_COLOR = '#f0e6da'       // light cream backing
  const SHELF_WOOD = '#d4b896'       // warm light wood

  // Candy-bright bottle colors for 60s retro vibe
  const bottles = [
    { x: -1.2, h: 0.22, color: '#88ddaa' },
    { x: -0.9, h: 0.18, color: '#ee8899' },
    { x: -0.6, h: 0.24, color: '#ffcc66' },
    { x: -0.3, h: 0.16, color: '#aaccff' },
    { x: 0.0, h: 0.20, color: '#cc99ff' },
    { x: 0.3, h: 0.22, color: '#88ddaa' },
    { x: 0.6, h: 0.18, color: '#ee8899' },
    { x: 0.9, h: 0.24, color: '#ffcc66' },
    { x: 1.2, h: 0.16, color: '#aaccff' },
  ]

  return (
    <group position={position} rotation={rotation}>
      {/* Back board — light cream, emissive so it glows */}
      <mesh position={[0, 0.8, -SHELF_D / 2 - 0.02]}>
        <boxGeometry args={[SHELF_W + 0.1, 1.4, 0.04]} />
        <meshStandardMaterial color={BACK_COLOR} emissive={BACK_COLOR} emissiveIntensity={0.25} roughness={0.7} />
      </mesh>

      {/* Shelf 1 — lower */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[SHELF_W, 0.03, SHELF_D]} />
        <meshStandardMaterial color={SHELF_WOOD} emissive={SHELF_WOOD} emissiveIntensity={0.15} roughness={0.6} />
      </mesh>

      {/* Shelf 2 — upper */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[SHELF_W, 0.03, SHELF_D]} />
        <meshStandardMaterial color={SHELF_WOOD} emissive={SHELF_WOOD} emissiveIntensity={0.15} roughness={0.6} />
      </mesh>

      {/* Shelf 3 — top */}
      <mesh position={[0, 1.25, 0]}>
        <boxGeometry args={[SHELF_W, 0.03, SHELF_D]} />
        <meshStandardMaterial color={SHELF_WOOD} emissive={SHELF_WOOD} emissiveIntensity={0.15} roughness={0.6} />
      </mesh>

      {/* Bottles on lower shelf — candy bright, emissive for pop */}
      {bottles.map((b, i) => (
        <mesh key={`low-${i}`} position={[b.x, 0.45 + b.h / 2 + 0.02, 0]}>
          <cylinderGeometry args={[0.025, 0.03, b.h, 8]} />
          <meshStandardMaterial color={b.color} emissive={b.color} emissiveIntensity={0.3} roughness={0.3} transparent opacity={0.8} />
        </mesh>
      ))}

      {/* Bottles on upper shelf */}
      {bottles.slice(0, 7).map((b, i) => (
        <mesh key={`up-${i}`} position={[b.x + 0.15, 0.85 + b.h / 2 + 0.02, 0]}>
          <cylinderGeometry args={[0.022, 0.028, b.h * 0.85, 8]} />
          <meshStandardMaterial color={b.color} emissive={b.color} emissiveIntensity={0.3} roughness={0.3} transparent opacity={0.8} />
        </mesh>
      ))}

      {/* A couple glasses on top shelf */}
      {[-0.5, 0.1, 0.7].map((x, i) => (
        <mesh key={`glass-${i}`} position={[x, 1.25 + 0.06, 0]}>
          <cylinderGeometry args={[0.03, 0.025, 0.1, 8]} />
          <meshStandardMaterial color="#e0e0e0" roughness={0.15} transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  )
}
