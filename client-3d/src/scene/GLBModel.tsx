import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Load and render a GLB model from the public/models/ directory.
 *
 * Usage:
 *   <GLBModel src="/models/old-computer-desk.glb" position={[0, 0, 0]} />
 *
 * The model is cloned so multiple instances don't share state.
 * drei's useGLTF caches the file after first load — no duplicate fetches.
 *
 * Preload models to avoid pop-in:
 *   GLBModel.preload('/models/old-computer-desk.glb')
 */
export function GLBModel({
  src,
  colorOverride,
  emissiveOverride,
  emissiveIntensity = 0.4,
  ...groupProps
}: {
  src: string
  colorOverride?: string
  emissiveOverride?: string
  emissiveIntensity?: number
} & JSX.IntrinsicElements['group']) {
  const { scene } = useGLTF(src)

  const cloned = useMemo(() => {
    const clone = scene.clone(true)
    if (colorOverride || emissiveOverride) {
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = (child.material as THREE.MeshStandardMaterial).clone()
          if (colorOverride) mat.color.set(colorOverride)
          if (emissiveOverride) {
            mat.emissive.set(emissiveOverride)
            mat.emissiveIntensity = emissiveIntensity
          }
          child.material = mat
        }
      })
    }
    return clone
  }, [scene, colorOverride, emissiveOverride, emissiveIntensity])

  return <primitive object={cloned} {...groupProps} />
}

/** Eagerly fetch a GLB so it's cached before the component mounts. */
GLBModel.preload = (src: string) => useGLTF.preload(src)
