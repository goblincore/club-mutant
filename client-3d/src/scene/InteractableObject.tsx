import { useRef, useState, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { useGameStore, getPlayerPosition } from '../stores/gameStore'

const WORLD_SCALE = 0.01
const HITBOX_PAD = 0.15
const GLOW_FADE_SPEED = 6
const PULSE_SPEED = 0.003

// Scratch vector — safe to share since useFrame callbacks run sequentially
const _worldCenter = new THREE.Vector3()

// ---------------------------------------------------------------------------
// Screen-space silhouette outline system.
//
// InteractableObject manages:
//   - Proximity detection + smooth intensity animation
//   - Toggling HIGHLIGHT_LAYER on child meshes when in range
//   - Cursor changes + click handling via an invisible hitbox
//
// PsxPostProcess reads HIGHLIGHT_LAYER + highlightIntensity to:
//   1. Render highlighted objects as a flat white mask to a separate RT
//   2. Dilate the mask in the VHS shader to produce a clean outer-glow outline
// ---------------------------------------------------------------------------

// Layer 2 = highlight mask (layer 0 = scene, layer 1 = UI)
export const HIGHLIGHT_LAYER = 2

// Global outline intensity — written by InteractableObject, read by PsxPostProcess
export let highlightIntensity = 0

interface InteractableObjectProps {
  children: React.ReactNode
  interactDistance: number
  onInteract?: () => void
}

export function InteractableObject({
  children,
  interactDistance,
  onInteract,
}: InteractableObjectProps) {
  const groupRef = useRef<THREE.Group>(null)

  const [hitboxData, setHitboxData] = useState<{
    size: [number, number, number]
    center: [number, number, number]
  } | null>(null)

  const inRange = useRef(false)
  const currentOpacity = useRef(0)
  const isHovered = useRef(false)
  const isHighlighted = useRef(false)

  // Compute hitbox after children mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!groupRef.current) return

      const box = new THREE.Box3().setFromObject(groupRef.current)
      if (box.isEmpty()) return

      const size = new THREE.Vector3()
      const center = new THREE.Vector3()
      box.getSize(size)
      box.getCenter(center)

      groupRef.current.worldToLocal(center)

      setHitboxData({
        size: [size.x + HITBOX_PAD * 2, size.y + HITBOX_PAD * 2, size.z + HITBOX_PAD * 2],
        center: [center.x, center.y, center.z],
      })
    }, 200)

    return () => clearTimeout(timer)
  }, [])

  // Cleanup on unmount: disable highlight layer + reset globals
  useEffect(() => {
    return () => {
      if (groupRef.current && isHighlighted.current) {
        groupRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) child.layers.disable(HIGHLIGHT_LAYER)
        })
      }

      highlightIntensity = 0

      if (isHovered.current) document.body.style.cursor = 'auto'
    }
  }, [])

  // Per-frame: proximity check, intensity animation, layer toggle, cursor
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)

    if (!groupRef.current || !hitboxData) return

    const state = useGameStore.getState()
    const myId = state.mySessionId
    if (!myId) return

    const pos = getPlayerPosition(myId)
    if (!pos) return

    const playerX = pos.x * WORLD_SCALE
    const playerZ = -pos.y * WORLD_SCALE

    _worldCenter.set(hitboxData.center[0], hitboxData.center[1], hitboxData.center[2])
    groupRef.current.localToWorld(_worldCenter)

    const dx = playerX - _worldCenter.x
    const dz = playerZ - _worldCenter.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    inRange.current = dist < interactDistance

    // Smooth exponential fade
    const target = inRange.current ? 1 : 0
    const t = 1 - Math.exp(-GLOW_FADE_SPEED * delta)
    currentOpacity.current += (target - currentOpacity.current) * t

    // Gentle pulse when in range
    const pulse = inRange.current ? 0.7 + 0.3 * Math.sin(performance.now() * PULSE_SPEED) : 1

    // Export intensity for PsxPostProcess to read
    highlightIntensity = currentOpacity.current * pulse

    // Toggle highlight layer on child meshes
    const shouldHighlight = currentOpacity.current > 0.01

    if (shouldHighlight !== isHighlighted.current) {
      groupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (shouldHighlight) child.layers.enable(HIGHLIGHT_LAYER)
          else child.layers.disable(HIGHLIGHT_LAYER)
        }
      })

      isHighlighted.current = shouldHighlight
    }

    // Cursor
    if (isHovered.current) {
      document.body.style.cursor = inRange.current ? 'pointer' : 'auto'
    }
  })

  const handlePointerOver = useCallback(() => {
    isHovered.current = true
    if (inRange.current) document.body.style.cursor = 'pointer'
  }, [])

  const handlePointerOut = useCallback(() => {
    isHovered.current = false
    document.body.style.cursor = 'auto'
  }, [])

  const handleClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      if (inRange.current && onInteract) {
        e.stopPropagation()
        onInteract()
      }
    },
    [onInteract]
  )

  return (
    <group ref={groupRef}>
      {children}

      {hitboxData && (
        <group position={hitboxData.center}>
          {/* Invisible hitbox for pointer events (follows DJ booth pattern) */}
          <mesh
            visible={false}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
          >
            <boxGeometry args={hitboxData.size} />
            <meshBasicMaterial />
          </mesh>
        </group>
      )}
    </group>
  )
}
