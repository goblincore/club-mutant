import { Html } from '@react-three/drei'
import { useGameStore } from '../../stores/gameStore'
import { useJukeboxStore } from '../../stores/jukeboxStore'

// ── Pastel Kawaii Retro jukebox ──
export function JukeboxMachine({ position }: { position: [number, number, number] }) {
  const W = 0.82
  const H = 1.75
  const D = 0.5

  return (
    <group position={position}>
      {/* Main cabinet — Pastel Pink */}
      <mesh position={[0, H / 2, 0]}>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color="#ffb3d9" roughness={0.4} />
      </mesh>

      {/* Cat ears */}
      <mesh position={[-0.25, H + 0.35, 0]} rotation={[0, 0, 0.2]}>
        <coneGeometry args={[0.15, 0.25, 4]} />
        <meshStandardMaterial color="#ffb3d9" roughness={0.4} />
      </mesh>
      <mesh position={[0.25, H + 0.35, 0]} rotation={[0, 0, -0.2]}>
        <coneGeometry args={[0.15, 0.25, 4]} />
        <meshStandardMaterial color="#ffb3d9" roughness={0.4} />
      </mesh>

      {/* Inner Ear pink */}
      <mesh position={[-0.25, H + 0.36, 0.05]} rotation={[0, 0, 0.2]}>
        <coneGeometry args={[0.08, 0.15, 3]} />
        <meshStandardMaterial color="#ff3388" roughness={0.4} />
      </mesh>
      <mesh position={[0.25, H + 0.36, 0.05]} rotation={[0, 0, -0.2]}>
        <coneGeometry args={[0.08, 0.15, 3]} />
        <meshStandardMaterial color="#ff3388" roughness={0.4} />
      </mesh>

      {/* Rounded dome top */}
      <mesh position={[0, H + 0.12, 0]}>
        <sphereGeometry args={[W * 0.52, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#fca5ce" roughness={0.4} />
      </mesh>

      {/* Glowing display arch — soft pink */}
      <mesh position={[0, H * 0.78, D / 2 + 0.01]}>
        <planeGeometry args={[W * 0.78, H * 0.22]} />
        <meshStandardMaterial
          color="#ffccff"
          emissive="#ff99dd"
          emissiveIntensity={1.2}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Chrome trim — top arch */}
      <mesh position={[0, H * 0.9, D / 2 + 0.012]}>
        <boxGeometry args={[W * 0.82, 0.03, 0.01]} />
        <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Chrome trim — mid divider */}
      <mesh position={[0, H * 0.62, D / 2 + 0.012]}>
        <boxGeometry args={[W * 0.9, 0.025, 0.01]} />
        <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Side chrome fins */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 + 0.01), H * 0.76, 0]}>
          <boxGeometry args={[0.025, H * 0.5, D + 0.02]} />
          <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
        </mesh>
      ))}

      {/* Speaker grille — lower front (soft white/pink tone) */}
      <mesh position={[0, H * 0.28, D / 2 + 0.01]}>
        <planeGeometry args={[W * 0.72, H * 0.3]} />
        <meshStandardMaterial color="#ffeeff" roughness={0.95} />
      </mesh>

      {/* Grille bars */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[0, H * 0.17 + i * 0.055, D / 2 + 0.018]}>
          <boxGeometry args={[W * 0.62, 0.007, 0.003]} />
          <meshStandardMaterial color="#ffaadd" />
        </mesh>
      ))}

      {/* Selection buttons are now little stars/hearts (using rotated squares for simplicity) */}
      {[-0.18, -0.06, 0.06, 0.18].map((xOff, i) => (
        <mesh key={i} position={[xOff, H * 0.53, D / 2 + 0.015]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.03, 0.03, 0.01]} />
          <meshStandardMaterial
            color={['#ff88cc', '#aaddff', '#bcffbc', '#ffffaa'][i]}
            emissive={['#ff88cc', '#aaddff', '#bcffbc', '#ffffaa'][i]}
            emissiveIntensity={0.8}
          />
        </mesh>
      ))}

      {/* Coin slot */}
      <mesh position={[W * 0.28, H * 0.53, D / 2 + 0.015]}>
        <boxGeometry args={[0.055, 0.012, 0.008]} />
        <meshStandardMaterial color="#dddddd" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Vinyl record visible through top window */}
      <mesh position={[0, H * 0.78 + 0.01, D / 2 + 0.02]}>
        <circleGeometry args={[0.12, 16]} />
        <meshStandardMaterial color="#554466" roughness={0.3} />
      </mesh>
      <mesh position={[0, H * 0.78 + 0.022, D / 2 + 0.02]}>
        <circleGeometry args={[0.035, 12]} />
        <meshStandardMaterial color="#ff99cc" roughness={0.7} />
      </mesh>

      {/* Base */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[W + 0.06, 0.1, D + 0.06]} />
        <meshStandardMaterial color="#ff88bb" roughness={0.85} />
      </mesh>
    </group>
  )
}

// ── Jukebox occupant status — HTML speech bubble above jukebox ──
export function JukeboxStatusBubble({ position }: { position: [number, number, number] }) {
  const occupantName = useJukeboxStore((s) => s.occupantName)
  const occupantId = useJukeboxStore((s) => s.occupantId)
  const mySessionId = useGameStore((s) => s.mySessionId)

  if (!occupantId) return null

  const isMe = occupantId === mySessionId
  const label = isMe ? 'you are using the jukebox' : `${occupantName} is using the jukebox`

  return (
    <group position={position}>
      <Html center distanceFactor={4} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: '#fff',
          color: '#111',
          fontFamily: 'monospace',
          fontSize: '13px',
          fontWeight: 600,
          padding: '5px 12px',
          borderRadius: '14px',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          userSelect: 'none',
        }}>
          {label}
        </div>
      </Html>
    </group>
  )
}
