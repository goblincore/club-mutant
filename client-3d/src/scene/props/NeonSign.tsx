// ── Neon sign on the wall ──
export function NeonSign({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Backing board */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[1.1, 0.38, 0.04]} />
        <meshStandardMaterial color="#111" roughness={0.9} />
      </mesh>

      {/* "DINER" text glow — emissive plane */}
      <mesh position={[0, 0.06, 0.01]}>
        <planeGeometry args={[0.96, 0.14]} />
        <meshStandardMaterial
          color="#ff4488"
          emissive="#ff2266"
          emissiveIntensity={2.5}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Bottom tagline glow */}
      <mesh position={[0, -0.1, 0.01]}>
        <planeGeometry args={[0.7, 0.07]} />
        <meshStandardMaterial
          color="#44ddff"
          emissive="#22bbff"
          emissiveIntensity={2.0}
          transparent
          opacity={0.85}
        />
      </mesh>
    </group>
  )
}
