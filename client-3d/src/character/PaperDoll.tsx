import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import type { LoadedCharacter, ManifestPart } from './CharacterLoader'
import { loadCharacterCached } from './CharacterLoader'
import { applyAnimation, resetBones } from './AnimationMixer'
import { createDistortMaterial, updateDistortUniforms, setDistortBounds } from './DistortMaterial'

const PX_SCALE = 0.01
const PLANE_SEGMENTS = 8 // subdivisions for smooth vertex distortion

// Target character height in pixels — all characters are normalized to this
const TARGET_HEIGHT_PX = 110

interface CharacterLayout {
  charScale: number
  groundOffsetY: number
  worldHeight: number
}

// Compute scale, ground offset (so feet sit at Y=0), and world height for a character
function computeCharacterLayout(parts: ManifestPart[], manifestScale: number): CharacterLayout {
  const byId = new Map<string, ManifestPart>()

  for (const p of parts) byId.set(p.id, p)

  // Compute absolute Y offset for each part (cumulative parent chain)
  function absY(part: ManifestPart): number {
    let y = part.offset[1]
    let cur = part.parent ? byId.get(part.parent) : undefined

    while (cur) {
      y += cur.offset[1]
      cur = cur.parent ? byId.get(cur.parent) : undefined
    }

    return y
  }

  let minY = Infinity
  let maxY = -Infinity
  let feetY = -Infinity // tracks the lowest world point: max(ay + pivot * h)

  for (const part of parts) {
    const ay = absY(part)
    const h = part.size[1]
    const pivotFrac = part.pivot[1]

    // Bounding box in manifest pixel space (Y down)
    const top = ay - pivotFrac * h
    const bottom = ay + (1 - pivotFrac) * h

    if (top < minY) minY = top
    if (bottom > maxY) maxY = bottom

    // In PartMesh, geometry bottom in local 3D = -(ay + pivot*h) * PX_SCALE
    // So the lowest world point corresponds to the largest (ay + pivot*h)
    const partFeet = ay + pivotFrac * h

    if (partFeet > feetY) feetY = partFeet
  }

  const totalHeight = maxY - minY

  if (totalHeight <= 0)
    return { charScale: manifestScale, groundOffsetY: 0, worldHeight: 1.1 * manifestScale }

  const baseScale = TARGET_HEIGHT_PX / totalHeight
  const charScale = baseScale * manifestScale

  // PartMesh places geometry bottom at -(ay + pivot*h) * PX_SCALE in local space.
  // After group scale, feet are at -feetY * PX_SCALE * charScale in parent space.
  // Shift up by that amount to place feet at Y=0.
  const groundOffsetY = feetY * PX_SCALE * charScale

  const worldHeight = TARGET_HEIGHT_PX * PX_SCALE * manifestScale

  return { charScale, groundOffsetY, worldHeight }
}

interface PaperDollProps {
  characterPath: string
  animationName?: string
  flipX?: boolean
  speed?: number // 0..1 normalized movement speed
  velocityX?: number // horizontal velocity direction
  billboardTwist?: number // angular velocity from billboard rotation
  onWorldHeight?: (height: number) => void
}

// A single part mesh within the bone hierarchy
function PartMesh({
  part,
  allParts,
  texture,
  textures,
  registerBone,
  onMaterialCreated,
}: {
  part: ManifestPart
  allParts: ManifestPart[]
  texture: THREE.Texture
  textures: Map<string, THREE.Texture>
  registerBone: (id: string, boneRole: string | null, group: THREE.Group | null) => void
  onMaterialCreated: (mat: THREE.MeshBasicMaterial) => void
}) {
  const groupRef = useRef<THREE.Group>(null)

  useEffect(() => {
    registerBone(part.id, part.boneRole, groupRef.current)
    return () => registerBone(part.id, part.boneRole, null)
  }, [part.id, part.boneRole, registerBone])

  const material = useMemo(() => {
    const mat = createDistortMaterial(texture)
    onMaterialCreated(mat)
    return mat
  }, [texture, onMaterialCreated])

  const geometry = useMemo(() => {
    const w = part.size[0] * PX_SCALE
    const h = part.size[1] * PX_SCALE
    const geo = new THREE.PlaneGeometry(w, h, PLANE_SEGMENTS, PLANE_SEGMENTS)

    // Shift geometry so pivot is at group origin
    const offsetX = (0.5 - part.pivot[0]) * w
    const offsetY = (0.5 - part.pivot[1]) * h
    geo.translate(offsetX, offsetY, 0)

    // Compute Y bounds for distortion height normalization
    geo.computeBoundingBox()
    const box = geo.boundingBox!
    setDistortBounds(material, box.min.y, box.max.y)

    return geo
  }, [part.size, part.pivot, material])

  const children = allParts.filter((p) => p.parent === part.id)

  return (
    <group
      ref={groupRef}
      position={[part.offset[0] * PX_SCALE, -part.offset[1] * PX_SCALE, part.offset[2] * PX_SCALE]}
      renderOrder={part.zIndex}
    >
      <mesh geometry={geometry} material={material} renderOrder={part.zIndex} />

      {children.map((child) => {
        const childTex = textures.get(child.id)
        if (!childTex) return null

        return (
          <PartMesh
            key={child.id}
            part={child}
            allParts={allParts}
            texture={childTex}
            textures={textures}
            registerBone={registerBone}
            onMaterialCreated={onMaterialCreated}
          />
        )
      })}
    </group>
  )
}

export function PaperDoll({
  characterPath,
  animationName = 'idle',
  flipX = false,
  speed = 0,
  velocityX = 0,
  billboardTwist = 0,
  onWorldHeight,
}: PaperDollProps) {
  const [loaded, setLoaded] = useState<LoadedCharacter | null>(null)
  const boneRefs = useRef<Map<string, THREE.Group>>(new Map())
  const clockRef = useRef(0)
  const materialsRef = useRef<THREE.MeshBasicMaterial[]>([])
  const distortTimeRef = useRef(0)

  // Load character on mount
  useEffect(() => {
    loadCharacterCached(characterPath).then(setLoaded).catch(console.error)
  }, [characterPath])

  const activeAnim = useMemo(() => {
    if (!loaded) return null
    return loaded.manifest.animations.find((a) => a.name === animationName) ?? null
  }, [loaded, animationName])

  // Register bones by both part id and bone role
  const registerBone = useMemo(() => {
    return (id: string, boneRole: string | null, group: THREE.Group | null) => {
      if (group) {
        group.userData.baseX = group.position.x
        group.userData.baseY = group.position.y
        group.userData.baseZ = group.position.z

        boneRefs.current.set(id, group)

        if (boneRole) {
          boneRefs.current.set(boneRole, group)
        }
      } else {
        boneRefs.current.delete(id)

        if (boneRole) {
          boneRefs.current.delete(boneRole)
        }
      }
    }
  }, [])

  // Reset when animation changes
  useEffect(() => {
    clockRef.current = 0
    resetBones(boneRefs.current)
  }, [animationName])

  // Track all distort materials for per-frame uniform updates
  const onMaterialCreated = useMemo(() => {
    return (mat: THREE.MeshBasicMaterial) => {
      if (!materialsRef.current.includes(mat)) {
        materialsRef.current.push(mat)
      }
    }
  }, [])

  // Animate + update distortion
  useFrame((_, delta) => {
    if (!activeAnim) return

    clockRef.current += delta
    applyAnimation(activeAnim, boneRefs.current, clockRef.current, PX_SCALE)

    // Update distortion uniforms on all part materials
    distortTimeRef.current += delta

    for (const mat of materialsRef.current) {
      updateDistortUniforms(mat, distortTimeRef.current, speed, velocityX, billboardTwist)
    }
  })

  // Compute layout metrics: scale, ground offset, world height
  const layout = useMemo(() => {
    if (!loaded) return { charScale: 1, groundOffsetY: 0, worldHeight: 1.1 }
    return computeCharacterLayout(loaded.manifest.parts, loaded.manifest.scale ?? 1)
  }, [loaded])

  // Report world height to parent for nametag/chat positioning
  useEffect(() => {
    if (loaded && onWorldHeight) {
      onWorldHeight(layout.worldHeight)
    }
  }, [loaded, layout.worldHeight, onWorldHeight])

  if (!loaded) return null

  const rootParts = loaded.manifest.parts.filter((p) => p.parent === null)

  return (
    <group
      position={[0, layout.groundOffsetY, 0]}
      scale={[flipX ? -layout.charScale : layout.charScale, layout.charScale, layout.charScale]}
    >
      {rootParts.map((part) => {
        const tex = loaded.textures.get(part.id)
        if (!tex) return null

        return (
          <PartMesh
            key={part.id}
            part={part}
            allParts={loaded.manifest.parts}
            texture={tex}
            textures={loaded.textures}
            registerBone={registerBone}
            onMaterialCreated={onMaterialCreated}
          />
        )
      })}
    </group>
  )
}
