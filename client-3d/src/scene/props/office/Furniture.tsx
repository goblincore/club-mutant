// Single laptop on the desk at a given X offset
export function Laptop({
  xOffset,
  screenColor = '#3344aa',
  bodyColor = '#222222',
}: {
  xOffset: number
  screenColor?: string
  bodyColor?: string
}) {
  const TABLE_Y = 0.38

  return (
    <group position={[xOffset, TABLE_Y + 0.01, -0.02]}>
      {/* Base / palmrest */}
      <mesh>
        <boxGeometry args={[0.36, 0.015, 0.25]} />
        <meshStandardMaterial color={bodyColor} metalness={0.3} roughness={0.6} />
      </mesh>

      {/* Keyboard inset */}
      <mesh position={[0, 0.009, -0.02]}>
        <boxGeometry args={[0.28, 0.002, 0.14]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* Screen lid — hinged at the rear edge, angled ~105° open */}
      <group position={[0, 0.008, 0.12]} rotation={[0.5, 0, 0]}>
        {/* Lid back */}
        <mesh position={[0, 0.11, 0]}>
          <boxGeometry args={[0.36, 0.22, 0.012]} />
          <meshStandardMaterial color={bodyColor} metalness={0.3} roughness={0.6} />
        </mesh>

        {/* Screen face */}
        <mesh position={[0, 0.11, -0.007]}>
          <planeGeometry args={[0.3, 0.18]} />
          <meshStandardMaterial
            color={screenColor}
            emissive={screenColor}
            emissiveIntensity={0.4}
          />
        </mesh>
      </group>
    </group>
  )
}

// Sofa — chunky couch with seat cushions, back rest, and arm rests
export function Sofa({
  position,
  rotation = [0, 0, 0],
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
}) {
  const SEAT_H = 0.38
  const SEAT_W = 1.8
  const SEAT_D = 0.7
  const BACK_H = 0.5
  const ARM_W = 0.15

  return (
    <group position={position} rotation={rotation}>
      {/* Seat base */}
      <mesh position={[0, SEAT_H / 2, 0]}>
        <boxGeometry args={[SEAT_W, SEAT_H, SEAT_D]} />
        <meshStandardMaterial color="#4a2040" />
      </mesh>

      {/* Seat cushions (two side-by-side) */}
      <mesh position={[-0.4, SEAT_H + 0.06, 0.02]}>
        <boxGeometry args={[0.75, 0.12, SEAT_D - 0.08]} />
        <meshStandardMaterial color="#5c2850" />
      </mesh>

      <mesh position={[0.4, SEAT_H + 0.06, 0.02]}>
        <boxGeometry args={[0.75, 0.12, SEAT_D - 0.08]} />
        <meshStandardMaterial color="#5c2850" />
      </mesh>

      {/* Back rest */}
      <mesh position={[0, SEAT_H + BACK_H / 2, -SEAT_D / 2 + 0.08]}>
        <boxGeometry args={[SEAT_W - 0.04, BACK_H, 0.18]} />
        <meshStandardMaterial color="#4a2040" />
      </mesh>

      {/* Back cushions */}
      <mesh position={[-0.4, SEAT_H + BACK_H / 2, -SEAT_D / 2 + 0.18]}>
        <boxGeometry args={[0.7, BACK_H - 0.1, 0.08]} />
        <meshStandardMaterial color="#5c2850" />
      </mesh>

      <mesh position={[0.4, SEAT_H + BACK_H / 2, -SEAT_D / 2 + 0.18]}>
        <boxGeometry args={[0.7, BACK_H - 0.1, 0.08]} />
        <meshStandardMaterial color="#5c2850" />
      </mesh>

      {/* Left arm rest */}
      <mesh position={[-SEAT_W / 2 + ARM_W / 2, SEAT_H + 0.15, 0]}>
        <boxGeometry args={[ARM_W, 0.3, SEAT_D]} />
        <meshStandardMaterial color="#3d1a35" />
      </mesh>

      {/* Right arm rest */}
      <mesh position={[SEAT_W / 2 - ARM_W / 2, SEAT_H + 0.15, 0]}>
        <boxGeometry args={[ARM_W, 0.3, SEAT_D]} />
        <meshStandardMaterial color="#3d1a35" />
      </mesh>

      {/* Stubby legs (4) */}
      {[
        [-SEAT_W / 2 + 0.1, -SEAT_D / 2 + 0.08],
        [SEAT_W / 2 - 0.1, -SEAT_D / 2 + 0.08],
        [-SEAT_W / 2 + 0.1, SEAT_D / 2 - 0.08],
        [SEAT_W / 2 - 0.1, SEAT_D / 2 - 0.08],
      ].map(([lx, lz], i) => (
        <mesh key={`sofa-leg-${i}`} position={[lx, 0.04, lz]}>
          <cylinderGeometry args={[0.03, 0.04, 0.08, 6]} />
          <meshStandardMaterial color="#1a0a15" />
        </mesh>
      ))}
    </group>
  )
}

// Potted plant — terracotta pot with leafy sphere
export function PottedPlant({
  position,
  scale = 1,
}: {
  position: [number, number, number]
  scale?: number
}) {
  return (
    <group position={position} scale={[scale, scale, scale]}>
      {/* Pot */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.15, 0.12, 0.3, 8]} />
        <meshStandardMaterial color="#b35c2a" />
      </mesh>

      {/* Pot rim */}
      <mesh position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.17, 0.15, 0.04, 8]} />
        <meshStandardMaterial color="#c46830" />
      </mesh>

      {/* Soil */}
      <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.13, 8]} />
        <meshStandardMaterial color="#2a1a0e" />
      </mesh>

      {/* Stem */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.015, 0.02, 0.3, 4]} />
        <meshStandardMaterial color="#2d5a1e" />
      </mesh>

      {/* Foliage — cluster of spheres */}
      <mesh position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.2, 8, 6]} />
        <meshStandardMaterial color="#2e6e1a" />
      </mesh>

      <mesh position={[0.12, 0.62, 0.08]}>
        <sphereGeometry args={[0.14, 6, 5]} />
        <meshStandardMaterial color="#3a7a22" />
      </mesh>

      <mesh position={[-0.1, 0.65, -0.06]}>
        <sphereGeometry args={[0.13, 6, 5]} />
        <meshStandardMaterial color="#267018" />
      </mesh>

      <mesh position={[0.04, 0.78, -0.04]}>
        <sphereGeometry args={[0.11, 6, 5]} />
        <meshStandardMaterial color="#3a8025" />
      </mesh>
    </group>
  )
}

// Water station — stand with a big water jug on top and a tap
export function WaterStation({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Base stand */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.35, 0.8, 0.35]} />
        <meshStandardMaterial color="#d8d8d8" />
      </mesh>

      {/* Drip tray */}
      <mesh position={[0, 0.02, 0.12]}>
        <boxGeometry args={[0.22, 0.04, 0.12]} />
        <meshStandardMaterial color="#888888" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Tap nozzle */}
      <mesh position={[0, 0.55, 0.18]}>
        <boxGeometry args={[0.06, 0.04, 0.06]} />
        <meshStandardMaterial color="#aaaaaa" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Water jug (inverted — wide top, narrow neck into stand) */}
      {/* Jug body */}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.6, 10]} />
        <meshStandardMaterial color="#c8e8ff" transparent opacity={0.5} />
      </mesh>

      {/* Jug cap */}
      <mesh position={[0, 1.42, 0]}>
        <sphereGeometry args={[0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#c0e0f8" transparent opacity={0.45} />
      </mesh>

      {/* Jug neck (narrow, going into stand) */}
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.08, 8]} />
        <meshStandardMaterial color="#b8d8f0" transparent opacity={0.4} />
      </mesh>

      {/* Water level inside */}
      <mesh position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.38, 10]} />
        <meshStandardMaterial color="#4488cc" transparent opacity={0.3} />
      </mesh>
    </group>
  )
}

// Old beige Dell tower + CRT monitor on a desk
export function OldComputerDesk({
  position,
  rotation = [0, 0, 0],
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
}) {
  const DESK_H = 0.7
  const DESK_W = 1.0
  const DESK_D = 0.55

  return (
    <group position={position} rotation={rotation}>
      {/* === Desk === */}
      {/* Desk top */}
      <mesh position={[0, DESK_H, 0]}>
        <boxGeometry args={[DESK_W, 0.03, DESK_D]} />
        <meshStandardMaterial color="#c8b898" />
      </mesh>

      {/* Desk legs (4) */}
      {[
        [-DESK_W / 2 + 0.04, -DESK_D / 2 + 0.04],
        [DESK_W / 2 - 0.04, -DESK_D / 2 + 0.04],
        [-DESK_W / 2 + 0.04, DESK_D / 2 - 0.04],
        [DESK_W / 2 - 0.04, DESK_D / 2 - 0.04],
      ].map(([lx, lz], i) => (
        <mesh key={`desk-leg-${i}`} position={[lx, DESK_H / 2, lz]}>
          <boxGeometry args={[0.04, DESK_H, 0.04]} />
          <meshStandardMaterial color="#a89878" />
        </mesh>
      ))}

      {/* === Dell Tower (beige, on the floor beside desk) === */}
      <mesh position={[DESK_W / 2 + 0.2, 0.28, 0]}>
        <boxGeometry args={[0.2, 0.56, 0.45]} />
        <meshStandardMaterial color="#d4c8a8" />
      </mesh>

      {/* Tower front panel detail */}
      <mesh position={[DESK_W / 2 + 0.2, 0.35, 0.226]}>
        <planeGeometry args={[0.16, 0.3]} />
        <meshStandardMaterial color="#c8bc98" />
      </mesh>

      {/* Floppy drive slot */}
      <mesh position={[DESK_W / 2 + 0.2, 0.48, 0.227]}>
        <planeGeometry args={[0.12, 0.015]} />
        <meshStandardMaterial color="#888880" />
      </mesh>

      {/* CD drive slot */}
      <mesh position={[DESK_W / 2 + 0.2, 0.42, 0.227]}>
        <planeGeometry args={[0.12, 0.02]} />
        <meshStandardMaterial color="#a09888" />
      </mesh>

      {/* Power button */}
      <mesh position={[DESK_W / 2 + 0.2, 0.52, 0.228]}>
        <circleGeometry args={[0.015, 8]} />
        <meshStandardMaterial color="#606060" />
      </mesh>

      {/* Power LED */}
      <mesh position={[DESK_W / 2 + 0.2, 0.5, 0.228]}>
        <circleGeometry args={[0.006, 6]} />
        <meshStandardMaterial color="#44cc44" emissive="#22aa22" emissiveIntensity={0.8} />
      </mesh>

      {/* === CRT Monitor === */}
      {/* Monitor body (deep, boxy) */}
      <mesh position={[0, DESK_H + 0.2, -0.05]}>
        <boxGeometry args={[0.45, 0.38, 0.38]} />
        <meshStandardMaterial color="#d0c4a4" />
      </mesh>

      {/* Screen bezel */}
      <mesh position={[0, DESK_H + 0.22, 0.14]}>
        <boxGeometry args={[0.42, 0.34, 0.02]} />
        <meshStandardMaterial color="#b8ac90" />
      </mesh>

      {/* Screen display (slightly recessed, glowing) */}
      <mesh position={[0, DESK_H + 0.22, 0.151]}>
        <planeGeometry args={[0.34, 0.26]} />
        <meshStandardMaterial color="#1a3322" emissive="#0a2210" emissiveIntensity={0.6} />
      </mesh>

      {/* CRT hump (the bulge at the back) */}
      <mesh position={[0, DESK_H + 0.2, -0.28]}>
        <sphereGeometry args={[0.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#c8bc9c" />
      </mesh>

      {/* Monitor stand/base */}
      <mesh position={[0, DESK_H + 0.015, 0]}>
        <boxGeometry args={[0.28, 0.03, 0.25]} />
        <meshStandardMaterial color="#c0b498" />
      </mesh>

      {/* === Keyboard === */}
      <mesh position={[0, DESK_H + 0.02, 0.2]}>
        <boxGeometry args={[0.38, 0.02, 0.12]} />
        <meshStandardMaterial color="#d4c8a8" />
      </mesh>

      {/* Key area */}
      <mesh position={[0, DESK_H + 0.031, 0.2]}>
        <planeGeometry args={[0.34, 0.09]} />
        <meshStandardMaterial color="#c0b498" />
      </mesh>

      {/* === Mouse === */}
      <mesh position={[0.28, DESK_H + 0.015, 0.2]}>
        <boxGeometry args={[0.05, 0.02, 0.08]} />
        <meshStandardMaterial color="#d4c8a8" />
      </mesh>

      {/* Mouse button line */}
      <mesh position={[0.28, DESK_H + 0.026, 0.18]}>
        <planeGeometry args={[0.04, 0.002]} />
        <meshStandardMaterial color="#b8ac90" />
      </mesh>

      {/* === Office chair === */}
      {/* Seat */}
      <mesh position={[0, 0.42, 0.45]}>
        <boxGeometry args={[0.4, 0.06, 0.38]} />
        <meshStandardMaterial color="#222222" />
      </mesh>

      {/* Back */}
      <mesh position={[0, 0.7, 0.62]}>
        <boxGeometry args={[0.38, 0.5, 0.04]} />
        <meshStandardMaterial color="#222222" />
      </mesh>

      {/* Chair post */}
      <mesh position={[0, 0.24, 0.45]}>
        <cylinderGeometry args={[0.025, 0.025, 0.36, 6]} />
        <meshStandardMaterial color="#444444" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Chair base star (5 legs) */}
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i * Math.PI * 2) / 5
        return (
          <mesh
            key={`chair-leg-${i}`}
            position={[Math.sin(angle) * 0.18, 0.04, 0.45 + Math.cos(angle) * 0.18]}
          >
            <boxGeometry args={[0.03, 0.03, 0.2]} />
            <meshStandardMaterial color="#444444" metalness={0.5} roughness={0.4} />
          </mesh>
        )
      })}

      {/* Casters (5 small spheres) */}
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i * Math.PI * 2) / 5
        return (
          <mesh
            key={`caster-${i}`}
            position={[Math.sin(angle) * 0.22, 0.015, 0.45 + Math.cos(angle) * 0.22]}
          >
            <sphereGeometry args={[0.02, 6, 4]} />
            <meshStandardMaterial color="#333333" />
          </mesh>
        )
      })}
    </group>
  )
}
