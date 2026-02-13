import { useRef, useEffect, useCallback } from 'react'
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
  const childrenGroupRef = useRef<THREE.Group>(null)
  const hitboxRef = useRef<THREE.Mesh>(null)
  const hitboxGroupRef = useRef<THREE.Group>(null)

  const hitboxReady = useRef(false)
  const inRange = useRef(false)
  const currentOpacity = useRef(0)
  const isHovered = useRef(false)
  const isHighlighted = useRef(false)

  // Cleanup on unmount: disable highlight layer + reset globals
  useEffect(() => {
    return () => {
      if (childrenGroupRef.current && isHighlighted.current) {
        childrenGroupRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) child.layers.disable(HIGHLIGHT_LAYER)
        })
      }

      highlightIntensity = 0

      if (isHovered.current) document.body.style.cursor = 'auto'
    }
  }, [])

  // Per-frame: hitbox computation (retries until ready), proximity check,
  // intensity animation, layer toggle, cursor
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)

    if (!childrenGroupRef.current) return

    // Lazy hitbox computation — keeps trying each frame until geometry is available.
    // Measures ONLY the children group (not the hitbox mesh) to get the correct bounds.
    if (!hitboxReady.current) {
      // Ensure the full ancestor chain has up-to-date world matrices before
      // measuring. Without this, objects inside rotated/positioned parents
      // (like DJ eggs inside the 180°-rotated booth) get a stale matrixWorld.
      childrenGroupRef.current.updateWorldMatrix(true, true)

      const box = new THREE.Box3().setFromObject(childrenGroupRef.current)
      if (box.isEmpty()) return

      const size = new THREE.Vector3()
      const center = new THREE.Vector3()
      box.getSize(size)
      box.getCenter(center)

      // Convert world-space center to the parent group's local space
      if (groupRef.current) {
        groupRef.current.updateWorldMatrix(true, false)
        groupRef.current.worldToLocal(center)
      }

      // Update the hitbox mesh geometry and position directly (no React re-render)
      if (hitboxRef.current && hitboxGroupRef.current) {
        hitboxRef.current.geometry.dispose()
        hitboxRef.current.geometry = new THREE.BoxGeometry(
          size.x + HITBOX_PAD * 2,
          size.y + HITBOX_PAD * 2,
          size.z + HITBOX_PAD * 2
        )
        hitboxGroupRef.current.position.set(center.x, center.y, center.z)
        hitboxReady.current = true
      }

      return
    }

    const state = useGameStore.getState()
    const myId = state.mySessionId
    if (!myId) return

    const pos = getPlayerPosition(myId)
    if (!pos) return

    const playerX = pos.x * WORLD_SCALE
    const playerZ = -pos.y * WORLD_SCALE

    const hgp = hitboxGroupRef.current
    if (!hgp || !groupRef.current) return

    _worldCenter.set(hgp.position.x, hgp.position.y, hgp.position.z)
    groupRef.current.localToWorld(_worldCenter)

    const dx = playerX - _worldCenter.x
    const dz = playerZ - _worldCenter.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    inRange.current = dist < interactDistance

    // Highlight triggers on hover, not proximity
    const hoverTarget = isHovered.current ? 1 : 0
    const t = 1 - Math.exp(-GLOW_FADE_SPEED * delta)
    currentOpacity.current += (hoverTarget - currentOpacity.current) * t

    // Gentle pulse when hovered
    const pulse = isHovered.current ? 0.7 + 0.3 * Math.sin(performance.now() * PULSE_SPEED) : 1

    // Export intensity for PsxPostProcess to read
    highlightIntensity = currentOpacity.current * pulse

    // Toggle highlight layer on child meshes only (not the hitbox)
    const shouldHighlight = currentOpacity.current > 0.01

    if (shouldHighlight !== isHighlighted.current) {
      childrenGroupRef.current.traverse((child) => {
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
      {/* Children in a separate group so Box3 measures only actual content */}
      <group ref={childrenGroupRef}>{children}</group>

      {/* Hitbox is always rendered — geometry + position set imperatively in useFrame
          once children have geometry. This avoids the fragile useEffect+setTimeout. */}
      <group ref={hitboxGroupRef}>
        <mesh
          ref={hitboxRef}
          visible={false}
          onClick={handleClick}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        >
          <boxGeometry args={[0.01, 0.01, 0.01]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  )
}
