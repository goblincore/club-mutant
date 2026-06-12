import { useCallback, useEffect, useRef } from 'react'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

const NAME_FONT_SIZE = 0.065
const NAME_PAD_X = 0.03
const NAME_PAD_Y = 0.018
const NAME_BG_RADIUS = 0.02
const nametagBgMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.5,
})

function makeNametagRect(w: number, h: number, r: number): THREE.ShapeGeometry {
  r = Math.min(r, w / 2, h / 2)
  const shape = new THREE.Shape()
  const hw = w / 2
  const hh = h / 2

  shape.moveTo(-hw + r, -hh)
  shape.lineTo(hw - r, -hh)
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r)
  shape.lineTo(hw, hh - r)
  shape.quadraticCurveTo(hw, hh, hw - r, hh)
  shape.lineTo(-hw + r, hh)
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r)
  shape.lineTo(-hw, -hh + r)
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh)

  return new THREE.ShapeGeometry(shape)
}

export function Nametag({ name }: { name: string }) {
  const bgRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    bgRef.current?.layers.set(1)
  }, [])

  const handleSync = useCallback((troika: THREE.Mesh) => {
    troika.layers.set(1)

    troika.geometry.computeBoundingBox()
    const bb = troika.geometry.boundingBox
    if (!bb || !bgRef.current) return

    const w = bb.max.x - bb.min.x + NAME_PAD_X * 2
    const h = bb.max.y - bb.min.y + NAME_PAD_Y * 2
    const cx = (bb.min.x + bb.max.x) / 2
    const cy = (bb.min.y + bb.max.y) / 2

    bgRef.current.geometry.dispose()
    bgRef.current.geometry = makeNametagRect(w, h, NAME_BG_RADIUS)
    bgRef.current.position.set(cx, cy, -0.001)
  }, [])

  return (
    <group position={[0, -0.15, 0]}>
      <Text
        fontSize={NAME_FONT_SIZE}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        font="/fonts/courier-prime.woff"
        onSync={handleSync}
      >
        {name}
      </Text>

      <mesh ref={bgRef} material={nametagBgMat}>
        <planeGeometry args={[0.1, 0.1]} />
      </mesh>
    </group>
  )
}
