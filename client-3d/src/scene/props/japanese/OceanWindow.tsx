import { OceanViewMaterial } from '../../../shaders/OceanViewMaterial'

// Ocean view window — procedural shader with wood frame
export function OceanWindow({
  position,
  size = [3.0, 1.4],
}: {
  position: [number, number, number]
  size?: [number, number]
}) {
  const [w, h] = size
  const borderWidth = 0.08

  return (
    <group position={position}>
      {/* Ocean view shader — render behind frame (recessed into wall) */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[w, h]} />
        <OceanViewMaterial />
      </mesh>

      {/* Light wood frame — flat border around the shader */}
      {/* Top bar */}
      <mesh position={[0, (h + borderWidth) / 2, 0.01]}>
        <boxGeometry args={[w + borderWidth * 2, borderWidth, 0.04]} />
        <meshStandardMaterial color="#d4c0a0" />
      </mesh>
      {/* Bottom bar */}
      <mesh position={[0, -(h + borderWidth) / 2, 0.01]}>
        <boxGeometry args={[w + borderWidth * 2, borderWidth, 0.04]} />
        <meshStandardMaterial color="#d4c0a0" />
      </mesh>
      {/* Left bar */}
      <mesh position={[-(w + borderWidth) / 2, 0, 0.01]}>
        <boxGeometry args={[borderWidth, h + borderWidth * 2, 0.04]} />
        <meshStandardMaterial color="#d4c0a0" />
      </mesh>
      {/* Right bar */}
      <mesh position={[(w + borderWidth) / 2, 0, 0.01]}>
        <boxGeometry args={[borderWidth, h + borderWidth * 2, 0.04]} />
        <meshStandardMaterial color="#d4c0a0" />
      </mesh>

      {/* Window pane dividers (cross shape) — in front of shader */}
      <mesh position={[0, 0, 0.015]}>
        <boxGeometry args={[w, 0.035, 0.02]} />
        <meshStandardMaterial color="#c0a880" />
      </mesh>
      <mesh position={[0, 0, 0.015]}>
        <boxGeometry args={[0.035, h, 0.02]} />
        <meshStandardMaterial color="#c0a880" />
      </mesh>
    </group>
  )
}
