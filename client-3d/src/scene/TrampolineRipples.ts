// Trampoline floor ripple state manager
// Manages an array of active ripple sources and provides both GPU-side uniform data
// and CPU-side displacement evaluation for player/furniture Y offsets.
//
// Uses its own performance.now()-based clock so addRipple() works correctly
// regardless of useFrame execution order or being called from network handlers.

import * as THREE from 'three'

export interface Ripple {
  x: number
  z: number
  birthTime: number
  amplitude: number
}

// Self-contained time source — no dependency on r3f clock or useFrame ordering.
// All ripple timestamps use this. The shader uniform uTime must also use getTime().
const EPOCH = performance.now()

export function getTime(): number {
  return (performance.now() - EPOCH) / 1000
}

// Physics constants — tuned for slow "waterbed" feel
const MAX_RIPPLES = 16
const WAVE_SPEED = 2.5
const WAVE_FREQ = 5.0 // original setting
const DECAY_TIME = 1.2 // exponential time decay rate
const DIST_DECAY = 0.2 // exponential distance decay rate
const LIFETIME = 4.0 // seconds before a ripple is pruned

const ripples: Ripple[] = []

// Kept for backward compat — callers that still call setGlobalTime are harmless no-ops.
export function setGlobalTime(_t: number) {}

export function addRipple(x: number, z: number, amplitude: number) {
  const now = getTime()

  pruneExpired(now)

  if (ripples.length >= MAX_RIPPLES) {
    ripples.shift()
  }

  ripples.push({ x, z, birthTime: now, amplitude })
}

export function getRippleCount(): number {
  return ripples.length
}

function pruneExpired(now: number) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    if (now - ripples[i].birthTime > LIFETIME) {
      ripples.splice(i, 1)
    }
  }
}

// CPU-side displacement evaluation (for player/furniture Y offset)
export function getDisplacementAt(worldX: number, worldZ: number): number {
  const now = getTime()
  let total = 0

  for (let i = 0; i < ripples.length; i++) {
    const r = ripples[i]
    const age = now - r.birthTime

    if (age < 0 || age > LIFETIME) continue

    const dx = worldX - r.x
    const dz = worldZ - r.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    const decay = Math.exp(-age * DECAY_TIME) * Math.exp(-dist * DIST_DECAY)
    const phase = dist * WAVE_FREQ - age * WAVE_SPEED * WAVE_FREQ

    total += Math.sin(phase) * r.amplitude * decay
  }

  return total
}

// Pre-built vec4 array for shader uniforms
const rippleVec4s: THREE.Vector4[] = Array.from(
  { length: MAX_RIPPLES },
  () => new THREE.Vector4(0, 0, 0, 0)
)

export function getRippleVec4s(): THREE.Vector4[] {
  for (let i = 0; i < MAX_RIPPLES; i++) {
    if (i < ripples.length) {
      const r = ripples[i]
      rippleVec4s[i].set(r.x, r.z, r.birthTime, r.amplitude)
    } else {
      rippleVec4s[i].set(0, 0, 0, 0)
    }
  }

  return rippleVec4s
}

// Ensure a number formats as a valid GLSL float literal (always includes a decimal point).
// JS drops trailing zeros: (5.0).toString() → "5", which is invalid for `const float x = 5;` in GLSL ES 1.0.
function glf(n: number): string {
  const s = String(n)
  return s.includes('.') ? s : s + '.0'
}

// Exported constants for use in shaders and other modules.
// Float values are pre-formatted as GLSL-safe strings (always include decimal point).
export const TRAMPOLINE = {
  MAX_RIPPLES,
  WAVE_SPEED: glf(WAVE_SPEED),
  WAVE_FREQ: glf(WAVE_FREQ),
  DECAY_TIME: glf(DECAY_TIME),
  DIST_DECAY: glf(DIST_DECAY),
  LIFETIME: glf(LIFETIME),
} as const
