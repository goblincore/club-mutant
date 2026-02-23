import { useRef, useMemo, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import type { LoadedCharacter, ManifestPart } from './CharacterLoader'
import { loadCharacterCached } from './CharacterLoader'
import { applyAnimation, resetBones } from './AnimationMixer'
import {
  createDistortMaterial,
  updateDistortUniforms,
  setDistortBounds,
  setVertexFisheye,
  setCharacterSpaceBounds,
  setDistortScale,
} from './DistortMaterial'
import { useUIStore } from '../stores/uiStore'

const PX_SCALE = 0.01
const PLANE_SEGMENTS = 8 // subdivisions for smooth vertex distortion

// Target character height in pixels — all characters are normalized to this
const TARGET_HEIGHT_PX = 110

interface CharacterLayout {
  charScale: number
  groundOffsetY: number
  worldHeight: number
  headTopY: number
  visualTopY: number
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
    return {
      charScale: manifestScale,
      groundOffsetY: 0,
      worldHeight: 1.1 * manifestScale,
      headTopY: 1.1 * manifestScale,
      visualTopY: 1.1 * manifestScale,
    }

  const baseScale = TARGET_HEIGHT_PX / totalHeight
  const charScale = baseScale * manifestScale

  // PartMesh places geometry bottom at -(ay + pivot*h) * PX_SCALE in local space.
  // After group scale, feet are at -feetY * PX_SCALE * charScale in parent space.
  // Shift up by that amount to place feet at Y=0.
  const groundOffsetY = feetY * PX_SCALE * charScale

  const worldHeight = TARGET_HEIGHT_PX * PX_SCALE * manifestScale

  // Compute the actual visual top Y in dollGroup space by matching how PartMesh
  // positions geometry: top3D = -absY*PX_SCALE + (1-pivot)*h*PX_SCALE
  let highest3D = -Infinity

  for (const part of parts) {
    const ay = absY(part)
    const h = part.size[1] * PX_SCALE
    const pivot = part.pivot[1]
    const top3D = -ay * PX_SCALE + (1 - pivot) * h

    if (top3D > highest3D) highest3D = top3D
  }

  const visualTopY = highest3D * charScale + groundOffsetY

  // Find head part and compute its top Y in dollGroup space
  const headPart = parts.find((p) => p.boneRole === 'head')
  let headTopY = visualTopY // fallback to visual top if no head part

  if (headPart) {
    const headAbsY = absY(headPart)
    const headH = headPart.size[1] * PX_SCALE
    const headPivot = headPart.pivot[1]
    const headTop3D = -headAbsY * PX_SCALE + (1 - headPivot) * headH
    headTopY = headTop3D * charScale + groundOffsetY
  }

  return { charScale, groundOffsetY, worldHeight, headTopY, visualTopY }
}

// Per-part distortion info computed from the bone hierarchy
interface PartDistortInfo {
  hCharBottom: number
  hCharTop: number
  hCharAtBone: number // character-space h at this part's bone pivot (for group-level lean)
  leanFactor: number // incremental lean factor (subtracts inherited parent lean)
  distortScale: number
}

// Compute character-space height bounds for each part, propagating through the bone chain.
// This ensures joint continuity: a child part's bottom hChar matches the parent's hChar at the
// attachment point, eliminating visual gaps between head and torso during distortion.
function computePartDistortInfo(
  parts: ManifestPart[],
  globalDistortion: number,
  distortionOverrides: Record<string, number>
): Map<string, PartDistortInfo> {
  const byId = new Map<string, ManifestPart>()
  for (const p of parts) byId.set(p.id, p)

  function absY(part: ManifestPart): number {
    let y = part.offset[1]
    let cur = part.parent ? byId.get(part.parent) : undefined
    while (cur) {
      y += cur.offset[1]
      cur = cur.parent ? byId.get(cur.parent) : undefined
    }
    return y
  }

  // Find character bounding box in Y-down manifest space
  let charMinY = Infinity
  let charMaxY = -Infinity
  for (const part of parts) {
    const ay = absY(part)
    const h = part.size[1]
    const pivot = part.pivot[1]
    const top = ay - pivot * h
    const bottom = ay + (1 - pivot) * h
    if (top < charMinY) charMinY = top
    if (bottom > charMaxY) charMaxY = bottom
  }
  const charHeight = charMaxY - charMinY

  if (charHeight <= 0) {
    const result = new Map<string, PartDistortInfo>()
    for (const part of parts) {
      const boneOverride = part.boneRole ? (distortionOverrides[part.boneRole] ?? 1) : 1
      result.set(part.id, { hCharBottom: 0, hCharTop: 1, hCharAtBone: 0.5, leanFactor: 0.5, distortScale: globalDistortion * boneOverride })
    }
    return result
  }

  // Process parts parent-first (topological order) to propagate hChar through bone chain
  const partInfo = new Map<string, { hCharBottom: number; hCharTop: number; hCharAtBone: number }>()
  const processed = new Set<string>()
  const queue = parts.filter((p) => p.parent === null)

  while (queue.length > 0) {
    const part = queue.shift()!
    const pivot = part.pivot[1]
    const partHeightFrac = part.size[1] / charHeight

    if (part.parent === null) {
      // Root part: compute from character bounding box
      const ay = absY(part)
      const partTop = ay - pivot * part.size[1]
      const partBottom = ay + (1 - pivot) * part.size[1]
      // hChar: 0 = feet (charMaxY), 1 = head (charMinY)
      const hBottom = (charMaxY - partBottom) / charHeight
      const hTop = (charMaxY - partTop) / charHeight
      const hAtBone = hBottom + pivot * (hTop - hBottom)
      partInfo.set(part.id, { hCharBottom: hBottom, hCharTop: hTop, hCharAtBone: hAtBone })
    } else {
      // Child part: inherit from parent's bone position for joint continuity
      const parentInfo = partInfo.get(part.parent)!
      const hAtPivot = parentInfo.hCharAtBone
      // Child's pivot connects to parent's bone; geometry extends in both directions from pivot
      const hBottom = hAtPivot - pivot * partHeightFrac
      const hTop = hAtPivot + (1 - pivot) * partHeightFrac
      const hAtBone = hBottom + pivot * (hTop - hBottom)
      partInfo.set(part.id, { hCharBottom: hBottom, hCharTop: hTop, hCharAtBone: hAtBone })
    }

    processed.add(part.id)
    for (const child of parts) {
      if (child.parent === part.id && !processed.has(child.id)) {
        queue.push(child)
      }
    }
  }

  // Helper: smoothstep for lean curve
  function smoothstep01(x: number): number {
    const c = Math.max(0, Math.min(1, x))
    return c * c * (3 - 2 * c)
  }

  const result = new Map<string, PartDistortInfo>()
  for (const part of parts) {
    const info = partInfo.get(part.id)
    const boneOverride = part.boneRole ? (distortionOverrides[part.boneRole] ?? 1) : 1
    const hAtBone = info?.hCharAtBone ?? 0.5

    // Incremental lean factor: total lean at this bone minus inherited parent lean.
    // Children in the scene graph inherit parent group transforms, so we only apply
    // the difference. For a head attached at the same hChar as the torso bone,
    // the incremental lean is zero — the head rides on the torso's lean.
    let leanFactor = smoothstep01(hAtBone)
    if (part.parent) {
      const parentInfo = partInfo.get(part.parent)
      if (parentInfo) {
        leanFactor -= smoothstep01(parentInfo.hCharAtBone)
      }
    }

    result.set(part.id, {
      hCharBottom: info?.hCharBottom ?? 0,
      hCharTop: info?.hCharTop ?? 1,
      hCharAtBone: hAtBone,
      leanFactor,
      distortScale: globalDistortion * boneOverride,
    })
  }

  return result
}

interface PaperDollProps {
  characterPath: string
  animationName?: string
  flipX?: boolean
  speed?: number // 0..1 normalized movement speed
  velocityX?: number // horizontal velocity direction
  billboardTwist?: number // angular velocity from billboard rotation
  onLayout?: (layout: { worldHeight: number; headTopY: number; visualTopY: number }) => void
}

// A single part mesh within the bone hierarchy
function PartMesh({
  part,
  childrenByParent,
  texture,
  textures,
  registerBone,
  onMaterialCreated,
  partDistortMap,
}: {
  part: ManifestPart
  childrenByParent: Map<string | null, ManifestPart[]>
  texture: THREE.Texture
  textures: Map<string, THREE.Texture>
  registerBone: (id: string, boneRole: string | null, group: THREE.Group | null) => void
  onMaterialCreated: (mat: THREE.MeshBasicMaterial) => void
  partDistortMap: Map<string, PartDistortInfo>
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

    // Apply character-space height bounds for joint-continuous distortion
    const distInfo = partDistortMap.get(part.id)
    if (distInfo) {
      setCharacterSpaceBounds(material, distInfo.hCharBottom, distInfo.hCharTop)
      setDistortScale(material, distInfo.distortScale)
    }

    return geo
  }, [part.size, part.pivot, material, partDistortMap, part.id])

  const children = childrenByParent.get(part.id) ?? []

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
            childrenByParent={childrenByParent}
            texture={childTex}
            textures={textures}
            registerBone={registerBone}
            onMaterialCreated={onMaterialCreated}
            partDistortMap={partDistortMap}
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
  onLayout,
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

  // partDistortMapRef is populated after partDistortMap useMemo below
  const partDistortMapRef = useRef<Map<string, PartDistortInfo>>(new Map())

  // Animate + update distortion
  useFrame((_, delta) => {
    if (!activeAnim) return

    // 1. Undo previous frame's lean and run bone animation
    const pdMap = partDistortMapRef.current
    const bones = boneRefs.current
    for (const [id] of pdMap) {
      const group = bones.get(id)
      if (group && group.userData.leanOffset) {
        group.position.x -= group.userData.leanOffset
        group.userData.leanOffset = 0
      }
    }

    clockRef.current += delta
    applyAnimation(activeAnim, bones, clockRef.current, PX_SCALE)

    // Skip distortion when not moving (e.g. lobby carousel)
    if (speed === 0 && velocityX === 0 && billboardTwist === 0) return

    // 2. Update vertex shader distortion uniforms
    distortTimeRef.current += delta
    const vFisheye = useUIStore.getState().vertexFisheye
    for (const mat of materialsRef.current) {
      updateDistortUniforms(mat, distortTimeRef.current, speed, billboardTwist)
      setVertexFisheye(mat, vFisheye)
    }

    // 3. Apply group-level lean (only when there's lateral velocity)
    if (velocityX !== 0) {
      const vx015 = velocityX * 0.15
      for (const [id, info] of pdMap) {
        if (info.leanFactor === 0) continue // skip children with zero incremental lean
        const group = bones.get(id)
        if (!group) continue
        const leanOffset = info.leanFactor * vx015
        group.position.x += leanOffset
        group.userData.leanOffset = leanOffset
      }
    }
  })

  // Compute per-part character-space distortion info from bone hierarchy
  const partDistortMap = useMemo(() => {
    if (!loaded) return new Map<string, PartDistortInfo>()
    return computePartDistortInfo(
      loaded.manifest.parts,
      loaded.manifest.distortion ?? 1,
      loaded.manifest.distortionOverrides ?? {}
    )
  }, [loaded])

  // Sync partDistortMap to ref so useFrame can read it without closure deps
  useEffect(() => {
    partDistortMapRef.current = partDistortMap
  }, [partDistortMap])

  // Build children lookup map once (O(N) instead of O(N²) filter per PartMesh render)
  const childrenByParent = useMemo(() => {
    if (!loaded) return new Map<string | null, ManifestPart[]>()
    const map = new Map<string | null, ManifestPart[]>()
    for (const p of loaded.manifest.parts) {
      const list = map.get(p.parent) ?? []
      list.push(p)
      map.set(p.parent, list)
    }
    return map
  }, [loaded])

  // Compute layout metrics: scale, ground offset, world height
  const layout = useMemo(() => {
    if (!loaded)
      return { charScale: 1, groundOffsetY: 0, worldHeight: 1.1, headTopY: 1.1, visualTopY: 1.1 }
    return computeCharacterLayout(loaded.manifest.parts, loaded.manifest.scale ?? 1)
  }, [loaded])

  // Report layout metrics to parent for nametag/chat positioning
  useEffect(() => {
    if (loaded && onLayout) {
      onLayout({
        worldHeight: layout.worldHeight,
        headTopY: layout.headTopY,
        visualTopY: layout.visualTopY,
      })
    }
  }, [loaded, layout.worldHeight, layout.headTopY, layout.visualTopY, onLayout])

  // Subtle placeholder while character assets are loading
  if (!loaded) {
    return (
      <group position={[0, 0.55, 0]}>
        <mesh>
          <capsuleGeometry args={[0.18, 0.5, 4, 8]} />
          <meshBasicMaterial color="#888" transparent opacity={0.25} />
        </mesh>
      </group>
    )
  }

  const rootParts = childrenByParent.get(null) ?? []

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
            childrenByParent={childrenByParent}
            texture={tex}
            textures={loaded.textures}
            registerBone={registerBone}
            onMaterialCreated={onMaterialCreated}
            partDistortMap={partDistortMap}
          />
        )
      })}
    </group>
  )
}
