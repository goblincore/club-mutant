import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { useEditorStore } from '../store'
import type { CharacterPart, Keyframe } from '../types'
import { createPsxMaterial, createStandardMaterial } from '../shaders/PsxMaterial'

// Scale factor: how many world units per pixel
const PX_SCALE = 0.01

// Interpolate between keyframes
function sampleTrack(
  keys: Keyframe[],
  time: number,
  duration: number,
  interpolation: 'linear' | 'step'
): number {
  if (keys.length === 0) return 0

  const loopedTime = time % duration

  // Find surrounding keyframes
  let prev = keys[0]!
  let next = keys[0]!

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!

    if (k[0] <= loopedTime) {
      prev = k

      next = i + 1 < keys.length ? keys[i + 1]! : keys[0]!
    }
  }

  if (interpolation === 'step') {
    return prev[1]
  }

  // Linear interpolation
  const segDuration = next[0] > prev[0] ? next[0] - prev[0] : duration - prev[0] + next[0]

  if (segDuration === 0) return prev[1]

  const t = (loopedTime - prev[0]) / segDuration

  return prev[1] + (next[1] - prev[1]) * Math.max(0, Math.min(1, t))
}

export function CharacterRenderer() {
  const parts = useEditorStore((s) => s.parts)
  const psxEnabled = useEditorStore((s) => s.psxEnabled)
  const activeAnimationName = useEditorStore((s) => s.activeAnimationName)
  const animations = useEditorStore((s) => s.animations)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const setAnimationTime = useEditorStore((s) => s.setAnimationTime)

  const rootGroupRef = useRef<THREE.Group>(null)
  const boneRefs = useRef<Map<string, THREE.Group>>(new Map())
  const clockRef = useRef(0)

  const activeAnim = useMemo(
    () => animations.find((a) => a.name === activeAnimationName) ?? null,
    [animations, activeAnimationName]
  )

  // Animation loop
  useFrame((_, delta) => {
    if (!isPlaying || !activeAnim) return

    clockRef.current += delta
    setAnimationTime(clockRef.current)

    // Step through and apply each track
    for (const track of activeAnim.tracks) {
      const boneGroup = boneRefs.current.get(track.boneId)

      if (!boneGroup) continue

      const value = sampleTrack(
        track.keys,
        clockRef.current,
        activeAnim.duration,
        activeAnim.interpolation
      )

      switch (track.property) {
        case 'rotation.x':
          boneGroup.rotation.x = value
          break
        case 'rotation.y':
          boneGroup.rotation.y = value
          break
        case 'rotation.z':
          boneGroup.rotation.z = value
          break
        case 'position.x':
          // Store the base offset, add animation delta
          boneGroup.position.x = boneGroup.userData.baseX + value * PX_SCALE
          break
        case 'position.y':
          boneGroup.position.y = boneGroup.userData.baseY - value * PX_SCALE
          break
        case 'position.z':
          boneGroup.position.z = boneGroup.userData.baseZ + value * PX_SCALE
          break
      }
    }
  })

  // Reset animation clock when animation changes or stops
  useEffect(() => {
    clockRef.current = 0

    // Reset all bone transforms
    boneRefs.current.forEach((group) => {
      group.rotation.set(0, 0, 0)

      group.position.set(
        group.userData.baseX ?? group.position.x,
        group.userData.baseY ?? group.position.y,
        group.userData.baseZ ?? group.position.z
      )
    })
  }, [activeAnimationName, isPlaying])

  // Collect refs for bone groups via callback
  // Register by boneRole (for animation lookup) AND by part id
  const registerBone = (id: string, boneRole: string | null, group: THREE.Group | null) => {
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

  // Get root parts (no parent)
  const rootParts = parts.filter((p) => p.parentId === null)

  return (
    <group ref={rootGroupRef}>
      {rootParts.map((part) => (
        <PartMeshWithRef
          key={part.id}
          part={part}
          allParts={parts}
          psxEnabled={psxEnabled}
          registerBone={registerBone}
        />
      ))}
    </group>
  )
}

// Wrapper that passes ref registration down the tree
interface PartMeshWithRefProps {
  part: CharacterPart
  allParts: CharacterPart[]
  psxEnabled: boolean
  registerBone: (id: string, boneRole: string | null, group: THREE.Group | null) => void
}

function PartMeshWithRef({ part, allParts, psxEnabled, registerBone }: PartMeshWithRefProps) {
  const groupRef = useRef<THREE.Group>(null)

  const selectedPartId = useEditorStore((s) => s.selectedPartId)
  const selectPart = useEditorStore((s) => s.selectPart)
  const isSelected = selectedPartId === part.id

  useEffect(() => {
    registerBone(part.id, part.boneRole, groupRef.current)

    return () => registerBone(part.id, part.boneRole, null)
  }, [part.id, part.boneRole, registerBone])

  const texture = useMemo(() => {
    const tex = new THREE.TextureLoader().load(part.textureUrl)

    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter

    return tex
  }, [part.textureUrl])

  const material = useMemo(() => {
    if (psxEnabled) {
      return createPsxMaterial({ texture, gridSize: 160, dithering: true, colorReduction: true })
    }

    return createStandardMaterial(texture)
  }, [texture, psxEnabled])

  const geometry = useMemo(() => {
    const w = part.textureWidth * PX_SCALE
    const h = part.textureHeight * PX_SCALE

    const geo = new THREE.PlaneGeometry(w, h)

    // Shift geometry so the pivot point is at the origin of the group
    const offsetX = (0.5 - part.pivot[0]) * w
    const offsetY = (0.5 - part.pivot[1]) * h

    geo.translate(offsetX, offsetY, 0)

    return geo
  }, [part.textureWidth, part.textureHeight, part.pivot])

  const children = allParts.filter((p) => p.parentId === part.id)

  return (
    <group
      ref={groupRef}
      position={[part.offset[0] * PX_SCALE, -part.offset[1] * PX_SCALE, part.offset[2] * PX_SCALE]}
      renderOrder={part.zIndex}
    >
      <mesh
        geometry={geometry}
        material={material}
        renderOrder={part.zIndex}
        onClick={(e) => {
          e.stopPropagation()
          selectPart(part.id)
        }}
      />

      {/* Selection wireframe */}
      {isSelected && (
        <mesh geometry={geometry} renderOrder={part.zIndex + 100}>
          <meshBasicMaterial
            color="#00ff88"
            wireframe
            transparent
            opacity={0.6}
            depthTest={false}
          />
        </mesh>
      )}

      {/* Pivot dot */}
      {isSelected && (
        <mesh position={[0, 0, 0.01]} renderOrder={999}>
          <circleGeometry args={[0.03, 16]} />
          <meshBasicMaterial color="#ff3366" depthTest={false} />
        </mesh>
      )}

      {children.map((child) => (
        <PartMeshWithRef
          key={child.id}
          part={child}
          allParts={allParts}
          psxEnabled={psxEnabled}
          registerBone={registerBone}
        />
      ))}
    </group>
  )
}
