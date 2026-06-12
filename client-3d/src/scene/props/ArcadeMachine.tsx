// ── Retro Arcade Machine ──
export function ArcadeMachine({ position, rotation = [0, 0, 0], theme = 'fighter' }: { position: [number, number, number], rotation?: [number, number, number], theme?: 'fighter' | 'racer' }) {
  const W = 0.6
  const H = 1.6
  const D = 0.7

  const colors = theme === 'fighter'
    ? { primary: '#aa2222', accent: '#eeaa11', screen: '#ff5533' }
    : { primary: '#2233aa', accent: '#33ffdd', screen: '#3388ff' }

  return (
    <group position={position} rotation={rotation}>
      {/* Base Cabinet */}
      <mesh position={[0, H * 0.25, 0]}>
        <boxGeometry args={[W, H * 0.5, D]} />
        <meshStandardMaterial color={colors.primary} roughness={0.8} />
      </mesh>
      {/* Control Panel */}
      <mesh position={[0, H * 0.55, 0.1]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[W + 0.02, 0.1, 0.4]} />
        <meshStandardMaterial color="#111" roughness={0.9} />
      </mesh>
      {/* Control stick/buttons */}
      <mesh position={[-0.15, H * 0.61, 0]} rotation={[-0.2, 0, 0]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color={colors.accent} roughness={0.4} />
      </mesh>
      <mesh position={[0.1, H * 0.61, 0.1]} rotation={[-0.2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.01]} />
        <meshStandardMaterial color={colors.accent} roughness={0.4} />
      </mesh>
      {/* Screen Area */}
      <mesh position={[0, H * 0.75, -0.1]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[W, 0.5, 0.4]} />
        <meshStandardMaterial color="#050505" roughness={0.5} />
      </mesh>
      {/* Screen Glow */}
      <mesh position={[0, H * 0.75, 0.11]} rotation={[0.2, 0, 0]}>
        <planeGeometry args={[W * 0.8, 0.4]} />
        <meshStandardMaterial color={colors.screen} emissive={colors.screen} emissiveIntensity={0.8} />
      </mesh>
      {/* Marquee (Top) */}
      <mesh position={[0, H * 0.95, -0.05]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[W, 0.2, 0.4]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[0, H * 0.95, 0.16]} rotation={[0.1, 0, 0]}>
        <planeGeometry args={[W * 0.9, 0.15]} />
        <meshStandardMaterial color="#fff" emissive={colors.accent} emissiveIntensity={0.9} />
      </mesh>
      {/* Side Panels */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 + 0.01), H * 0.5, 0]}>
          <boxGeometry args={[0.02, H, D]} />
          <meshStandardMaterial color={colors.primary} roughness={0.8} />
        </mesh>
      ))}
      {/* Coin slots */}
      <mesh position={[W * 0.2, H * 0.35, D / 2 + 0.01]}>
        <boxGeometry args={[0.02, 0.05, 0.02]} />
        <meshStandardMaterial color="#ccc" metalness={0.8} />
      </mesh>
      <mesh position={[W * 0.3, H * 0.35, D / 2 + 0.01]}>
        <boxGeometry args={[0.02, 0.05, 0.02]} />
        <meshStandardMaterial color="#ccc" metalness={0.8} />
      </mesh>
    </group>
  )
}
