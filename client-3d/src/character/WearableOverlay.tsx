import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { WearableSlot } from '@club-mutant/types/Wearables'

const WEARABLE_BASE_SIZE = 0.3 // base world-unit size of a wearable sprite

const _texLoader = new THREE.TextureLoader()
const _texCache = new Map<string, THREE.Texture>()

function loadWearableTexture(itemId: string): Promise<THREE.Texture> {
  const cached = _texCache.get(itemId)
  if (cached) return Promise.resolve(cached)

  return new Promise((resolve, reject) => {
    _texLoader.load(
      `/wearables/${itemId}.png`,
      (tex) => {
        tex.minFilter = THREE.NearestFilter
        tex.magFilter = THREE.NearestFilter
        tex.colorSpace = THREE.SRGBColorSpace
        _texCache.set(itemId, tex)
        resolve(tex)
      },
      undefined,
      reject
    )
  })
}

interface WearableOverlayProps {
  slot: WearableSlot
}

/**
 * Renders a single wearable sprite as a bone-attached child.
 * Rendered inside the bone's THREE.Group via PaperDoll boneChildren prop,
 * so it automatically inherits bone animation transforms (position, rotation, lean).
 * Offset values are small bone-local displacements from the bone pivot.
 */
export function WearableOverlay({ slot }: WearableOverlayProps) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const meshRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    loadWearableTexture(slot.itemId).then(setTexture).catch(() => {
      console.warn(`[WearableOverlay] Failed to load texture for ${slot.itemId}`)
    })
  }, [slot.itemId])

  const material = useMemo(() => {
    if (!texture) return null
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
  }, [texture])

  if (!texture || !material) return null

  const img = texture.image as HTMLImageElement | undefined
  const aspect = img ? img.width / img.height : 1
  const size = WEARABLE_BASE_SIZE * slot.scale
  const w = aspect >= 1 ? size : size * aspect
  const h = aspect >= 1 ? size / aspect : size

  // Position is bone-local: offset from bone pivot.
  // Parent bone group handles animation transforms, flip, and lean automatically.
  return (
    <mesh
      ref={meshRef}
      position={[slot.offsetX, slot.offsetY, 0.01 * Math.sign(slot.zIndex)]}
      renderOrder={slot.zIndex}
      material={material}
    >
      <planeGeometry args={[w, h]} />
    </mesh>
  )
}
