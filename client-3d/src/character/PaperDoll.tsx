import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import type { LoadedCharacter, ManifestPart } from './CharacterLoader'
import { loadCharacterCached } from './CharacterLoader'
import { applyAnimation, resetBones } from './AnimationMixer'

const PX_SCALE = 0.01

interface PaperDollProps {
  characterPath: string
  animationName?: string
  flipX?: boolean
}

// A single part mesh within the bone hierarchy
function PartMesh({
  part,
  allParts,
  texture,
  textures,
  registerBone,
}: {
  part: ManifestPart
  allParts: ManifestPart[]
  texture: THREE.Texture
  textures: Map<string, THREE.Texture>
  registerBone: (id: string, boneRole: string | null, group: THREE.Group | null) => void
}) {
  const groupRef = useRef<THREE.Group>(null)

  useEffect(() => {
    registerBone(part.id, part.boneRole, groupRef.current)
    return () => registerBone(part.id, part.boneRole, null)
  }, [part.id, part.boneRole, registerBone])

  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide,
      depthWrite: true,
    })
  }, [texture])

  const geometry = useMemo(() => {
    const w = part.size[0] * PX_SCALE
    const h = part.size[1] * PX_SCALE
    const geo = new THREE.PlaneGeometry(w, h)

    // Shift geometry so pivot is at group origin
    const offsetX = (0.5 - part.pivot[0]) * w
    const offsetY = (0.5 - part.pivot[1]) * h
    geo.translate(offsetX, offsetY, 0)

    return geo
  }, [part.size, part.pivot])

  const children = allParts.filter((p) => p.parent === part.id)

  return (
    <group
      ref={groupRef}
      position={[
        part.offset[0] * PX_SCALE,
        -part.offset[1] * PX_SCALE,
        part.offset[2] * PX_SCALE,
      ]}
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
          />
        )
      })}
    </group>
  )
}

export function PaperDoll({ characterPath, animationName = 'idle', flipX = false }: PaperDollProps) {
  const [loaded, setLoaded] = useState<LoadedCharacter | null>(null)
  const boneRefs = useRef<Map<string, THREE.Group>>(new Map())
  const clockRef = useRef(0)

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

  // Animate
  useFrame((_, delta) => {
    if (!activeAnim) return

    clockRef.current += delta
    applyAnimation(activeAnim, boneRefs.current, clockRef.current, PX_SCALE)
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
          />
        )
      })}
    </group>
  )
}
