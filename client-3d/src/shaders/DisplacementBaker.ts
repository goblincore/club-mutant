// Bakes trampoline ripple displacement into a small Float32 texture each frame.
// All floor/grid vertex shaders sample this instead of running the per-vertex ripple loop.

import * as THREE from 'three'

import { getDisplacementAt, getRippleCount } from '../scene/TrampolineRipples'

const DISP_SIZE = 64
const DISP_ROOM_SIZE = 12 // matches ROOM_SIZE in Room.tsx

const data = new Float32Array(DISP_SIZE * DISP_SIZE)

const texture = new THREE.DataTexture(
  data,
  DISP_SIZE,
  DISP_SIZE,
  THREE.RedFormat,
  THREE.FloatType
)

texture.minFilter = THREE.LinearFilter
texture.magFilter = THREE.LinearFilter
texture.wrapS = THREE.ClampToEdgeWrapping
texture.wrapT = THREE.ClampToEdgeWrapping

let lastBakeMs = -1

// Call once per frame from any useFrame callback — deduplicates via timestamp.
export function bakeDisplacement() {
  const now = performance.now()

  // Skip if already baked within the last 2ms (same frame)
  if (now - lastBakeMs < 2) return

  lastBakeMs = now

  if (getRippleCount() === 0) {
    // No ripples — zero out if needed
    if (data[0] !== 0 || data[DISP_SIZE * DISP_SIZE - 1] !== 0) {
      data.fill(0)
      texture.needsUpdate = true
    }

    return
  }

  const halfSize = DISP_ROOM_SIZE / 2
  const step = DISP_ROOM_SIZE / (DISP_SIZE - 1)

  for (let j = 0; j < DISP_SIZE; j++) {
    const worldZ = j * step - halfSize

    for (let i = 0; i < DISP_SIZE; i++) {
      const worldX = i * step - halfSize
      data[j * DISP_SIZE + i] = getDisplacementAt(worldX, worldZ)
    }
  }

  texture.needsUpdate = true
}

export function getDisplacementTexture(): THREE.DataTexture {
  return texture
}

export { DISP_ROOM_SIZE }
