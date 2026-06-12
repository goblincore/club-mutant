import * as THREE from 'three'

// ── Raised stage platform with mic stand and spotlight ──
export const STAGE_W = 4.5
export const STAGE_D = 1.8
export const STAGE_H = 0.3

function MicStand({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Main pole */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 1.1, 8]} />
        <meshStandardMaterial color="#aaaaaa" metalness={0.85} roughness={0.2} />
      </mesh>
      {/* Mic capsule directly on top of head */}
      <mesh position={[0, 1.13, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.018, 0.07, 10]} />
        <meshStandardMaterial color="#333" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Mic head grille */}
      <mesh position={[0, 1.17, 0]}>
        <sphereGeometry args={[0.025, 10, 8]} />
        <meshStandardMaterial color="#555" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Base tripod — 3 legs */}
      {[0, 1, 2].map((i) => {
        const angle = (i / 3) * Math.PI * 2
        return (
          <mesh
            key={i}
            position={[Math.sin(angle) * 0.16, 0.05, Math.cos(angle) * 0.16]}
            rotation={[0, 0, (angle > Math.PI ? -1 : 1) * 0.35]}
          >
            <cylinderGeometry args={[0.008, 0.008, 0.36, 6]} />
            <meshStandardMaterial color="#888" metalness={0.7} roughness={0.3} />
          </mesh>
        )
      })}
    </group>
  )
}

export function Stage() {
  const WOOD = '#5a3318'
  const WOOD_EDGE = '#3d2010'
  const APRON = '#2a1208'

  return (
    <group>
      {/* Apron — front, back, left, right side faces only (no top/bottom faces needed) */}
      {/* Front face */}
      <mesh position={[0, STAGE_H / 2, STAGE_D / 2]}>
        <planeGeometry args={[STAGE_W, STAGE_H]} />
        <meshStandardMaterial color={APRON} roughness={0.9} side={THREE.FrontSide} />
      </mesh>
      {/* Back face */}
      <mesh position={[0, STAGE_H / 2, -STAGE_D / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[STAGE_W, STAGE_H]} />
        <meshStandardMaterial color={APRON} roughness={0.9} side={THREE.FrontSide} />
      </mesh>
      {/* Left face */}
      <mesh position={[-STAGE_W / 2, STAGE_H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[STAGE_D, STAGE_H]} />
        <meshStandardMaterial color={APRON} roughness={0.9} side={THREE.FrontSide} />
      </mesh>
      {/* Right face */}
      <mesh position={[STAGE_W / 2, STAGE_H / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[STAGE_D, STAGE_H]} />
        <meshStandardMaterial color={APRON} roughness={0.9} side={THREE.FrontSide} />
      </mesh>

      {/* Wood plank top surface — depthWrite off so characters standing on it aren't clipped */}
      <mesh position={[0, STAGE_H + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[STAGE_W, STAGE_D]} />
        <meshStandardMaterial color={WOOD} roughness={0.75} depthWrite={false} />
      </mesh>

      {/* Front edge trim */}
      <mesh position={[0, STAGE_H - 0.025, STAGE_D / 2]}>
        <boxGeometry args={[STAGE_W + 0.02, 0.05, 0.04]} />
        <meshStandardMaterial color={WOOD_EDGE} roughness={0.7} metalness={0.05} />
      </mesh>

      {/* Side edge trims */}
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * (STAGE_W / 2 + 0.01), STAGE_H - 0.025, 0]}>
          <boxGeometry args={[0.04, 0.05, STAGE_D]} />
          <meshStandardMaterial color={WOOD_EDGE} roughness={0.7} />
        </mesh>
      ))}

      {/* Steps — front-center */}
      <mesh position={[0, 0.075, STAGE_D / 2 + 0.2]}>
        <boxGeometry args={[0.8, 0.15, 0.28]} />
        <meshStandardMaterial color={WOOD_EDGE} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.16, STAGE_D / 2 + 0.07]}>
        <boxGeometry args={[0.8, 0.02, 0.28]} />
        <meshStandardMaterial color={WOOD} roughness={0.75} />
      </mesh>

      {/* Mic stand on stage */}
      <MicStand position={[0.3, STAGE_H, 0.1]} />
    </group>
  )
}
