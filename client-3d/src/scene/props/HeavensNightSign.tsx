import { useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'

// Seeded noise helpers for flicker
function fract(x: number) { return x - Math.floor(x) }
function hash(n: number) { return fract(Math.sin(n) * 43758.5453) }

const MAX_SPARKS = 16
const _sparkMat = new THREE.Matrix4()
const _sparkPos = new THREE.Vector3()

export function HeavensNightSign({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  const texture = useLoader(THREE.TextureLoader, '/textures/heavens_night.png')

  const signMatRef  = useRef<THREE.MeshBasicMaterial>(null)
  const sparkRef    = useRef<THREE.InstancedMesh>(null)

  // Per-spark state: [x, y, z, vx, vy, vz, life, maxLife, size]
  const sparks      = useRef<Float32Array>(new Float32Array(MAX_SPARKS * 9).fill(0))
  const flickerT    = useRef(0)
  // Separate timer: fires a burst every 3–7s instead of constant drizzle
  const nextBurstAt = useRef(3 + Math.random() * 4)
  const _color      = useMemo(() => new THREE.Color(), [])

  useFrame((_, dt) => {
    flickerT.current += dt
    const t = flickerT.current

    // ── Flicker: layered fast buzz + occasional hard stutter ──
    const buzz    = hash(Math.floor(t * 38) * 1.1)
    const stutter = hash(Math.floor(t *  5) * 3.7)
    const flicker = buzz > 0.12 ? 1.0 : stutter > 0.3 ? 0.25 : 0.0
    const bright  = 0.75 + flicker * 0.85

    if (signMatRef.current) {
      _color.setRGB(bright, bright * 0.55, bright * 0.82)
      signMatRef.current.color.copy(_color)
    }

    // ── Sparks: intermittent burst every 3–7s, orange embers that drift to floor ──
    const sp = sparks.current
    if (t >= nextBurstAt.current) {
      nextBurstAt.current = t + 3 + Math.random() * 4
      const count = 2 + Math.floor(Math.random() * 3)
      let emitted = 0
      for (let i = 0; i < MAX_SPARKS && emitted < count; i++) {
        const b = i * 9
        if (sp[b + 6] <= 0) {
          sp[b + 0] = (Math.random() - 0.5) * 1.0    // x — across text width
          sp[b + 1] = (Math.random() - 0.5) * 0.5    // y — across text height
          sp[b + 2] = 0.05                            // z — just off sign face
          sp[b + 3] = (Math.random() - 0.5) * 0.25   // vx — slight sideways
          sp[b + 4] = Math.random() * 0.2 + 0.1      // vy — small upward pop
          sp[b + 5] = Math.random() * 0.5 + 0.3      // vz — outward into room
          sp[b + 6] = 1.8 + Math.random() * 1.2      // life — long enough to reach floor
          sp[b + 7] = sp[b + 6]                      // maxLife
          sp[b + 8] = 0.03 + Math.random() * 0.03    // size
          emitted++
        }
      }
    }

    if (!sparkRef.current) return
    let visible = 0
    for (let i = 0; i < MAX_SPARKS; i++) {
      const b = i * 9
      if (sp[b + 6] <= 0) continue
      sp[b + 6] -= dt
      sp[b + 0] += sp[b + 3] * dt
      sp[b + 1] += sp[b + 4] * dt
      sp[b + 2] += sp[b + 5] * dt
      sp[b + 4] -= 0.6 * dt   // gentle gravity so sparks drift slowly to floor
      const lifeRatio = sp[b + 6] / sp[b + 7]
      const s = sp[b + 8] * lifeRatio
      _sparkPos.set(sp[b + 0], sp[b + 1], sp[b + 2])
      _sparkMat.makeScale(s, s, s)
      _sparkMat.setPosition(_sparkPos)
      sparkRef.current.setMatrixAt(visible++, _sparkMat)
    }
    sparkRef.current.count = visible
    sparkRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group position={position} rotation={rotation}>
      {/* Sign — alpha PNG, NormalBlending */}
      <mesh>
        <planeGeometry args={[1.5, 1.5]} />
        <meshBasicMaterial
          ref={signMatRef}
          map={texture}
          transparent
          alphaTest={0.05}
          depthWrite={false}
        />
      </mesh>

      {/* Sparks — intermittent orange embers raining down from sign */}
      <instancedMesh ref={sparkRef} args={[undefined, undefined, MAX_SPARKS]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color="#ff8833"
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          transparent
        />
      </instancedMesh>
    </group>
  )
}
