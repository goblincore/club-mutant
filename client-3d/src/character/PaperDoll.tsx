import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import type { LoadedCharacter, ManifestPart } from './CharacterLoader'
import { loadCharacterCached } from './CharacterLoader'
import { applyAnimation, resetBones } from './AnimationMixer'
import { createDistortMaterial, updateDistortUniforms, setDistortBounds } from './DistortMaterial'

const PX_SCALE = 0.01
const PLANE_SEGMENTS = 8 // subdivisions for smooth vertex distortion

interface PaperDollProps {
  characterPath: string
  animationName?: string
  flipX?: boolean
  speed?: number // 0..1 normalized movement speed
  velocityX?: number // horizontal velocity for lean direction
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
      updateDistortUniforms(mat, distortTimeRef.current, speed, velocityX)
    }
  })

  if (!loaded) return null

  const rootParts = loaded.manifest.parts.filter((p) => p.parent === null)

  return (
    <group scale={[flipX ? -1 : 1, 1, 1]}>
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
