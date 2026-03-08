/**
 * acsWalkShader — Custom ShaderMaterial for ACS character walk distortion.
 *
 * ACS characters have no walk animations (they were desktop assistants).
 * Since all ACS NPCs are bipedal, we fake walking by distorting the mesh
 * when the character is moving. Uses a subdivided PlaneGeometry.
 *
 * Combines pendulum sway + bounce + squash-stretch (Options 1+3 from plan).
 * Smooth intensity lerp prevents abrupt start/stop transitions.
 */

import * as THREE from 'three'

export const acsVertexShader = /* glsl */ `
  uniform float u_walkTime;       // advances only when moving
  uniform float u_walkSpeed;      // cycle frequency
  uniform float u_swayAmp;        // horizontal sway strength
  uniform float u_bounceAmp;      // vertical hop strength
  uniform float u_squashAmp;      // squash-stretch intensity
  uniform float u_walkIntensity;  // 0..1 smooth blend (0 = idle, 1 = full walk)

  varying vec2 vUv;

  void main() {
    vUv = uv;

    // Bottom 70% of the character sways (feet move more than head)
    float walkWeight = smoothstep(0.3, 1.0, 1.0 - uv.y);
    float cycle = sin(u_walkTime * u_walkSpeed);
    float intensity = u_walkIntensity;

    vec3 pos = position;

    // Sway: feet swing left-right (pendulum)
    pos.x += cycle * walkWeight * u_swayAmp * intensity;

    // Bounce: slight hop each step (double frequency)
    float bounce = abs(sin(u_walkTime * u_walkSpeed * 2.0));
    pos.y += bounce * u_bounceAmp * intensity;

    // Squash-stretch at bounce peak
    float squash = bounce * u_squashAmp * intensity;
    pos.x *= 1.0 + squash;
    pos.y *= 1.0 - squash * 0.5;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

export const acsFragmentShader = /* glsl */ `
  uniform sampler2D u_texture;
  uniform float u_alphaTest;

  varying vec2 vUv;

  void main() {
    vec4 texColor = texture2D(u_texture, vUv);
    if (texColor.a < u_alphaTest) discard;
    gl_FragColor = texColor;
  }
`

export interface AcsWalkUniforms {
  u_texture: { value: THREE.Texture | null }
  u_alphaTest: { value: number }
  u_walkTime: { value: number }
  u_walkSpeed: { value: number }
  u_swayAmp: { value: number }
  u_bounceAmp: { value: number }
  u_squashAmp: { value: number }
  u_walkIntensity: { value: number }
}

/** Default uniform values. Tuned for Bonzi-sized characters. */
export function createAcsWalkUniforms(texture?: THREE.Texture): AcsWalkUniforms {
  return {
    u_texture: { value: texture ?? null },
    u_alphaTest: { value: 0.5 },
    u_walkTime: { value: 0 },
    u_walkSpeed: { value: 8.0 },      // cycle frequency (radians/sec)
    u_swayAmp: { value: 0.03 },       // horizontal sway in world units
    u_bounceAmp: { value: 0.015 },    // vertical bounce in world units
    u_squashAmp: { value: 0.04 },     // squash-stretch intensity
    u_walkIntensity: { value: 0 },    // starts at rest
  }
}

/** Create the walk distortion ShaderMaterial. */
export function createAcsWalkMaterial(texture?: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: acsVertexShader,
    fragmentShader: acsFragmentShader,
    uniforms: createAcsWalkUniforms(texture) as unknown as Record<string, THREE.IUniform>,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
  })
}

/** Smooth lerp rate for walk intensity transitions. */
const WALK_INTENSITY_LERP_UP = 6.0   // ramp up quickly (~0.17s to full)
const WALK_INTENSITY_LERP_DOWN = 3.0  // ramp down more slowly (~0.33s to zero)

/**
 * Update walk uniforms each frame.
 * Smoothly blends walk intensity on/off. walkTime advances proportional to speed.
 */
export function updateAcsWalkUniforms(
  uniforms: AcsWalkUniforms,
  deltaMs: number,
  speed: number,
  isMoving: boolean,
): void {
  const dt = deltaMs * 0.001 // seconds

  // Smooth intensity transition
  const target = isMoving && speed > 0.01 ? 1.0 : 0.0
  const current = uniforms.u_walkIntensity.value
  const lerpRate = target > current ? WALK_INTENSITY_LERP_UP : WALK_INTENSITY_LERP_DOWN
  uniforms.u_walkIntensity.value += (target - current) * Math.min(lerpRate * dt, 1.0)

  // Clamp to avoid float drift
  if (uniforms.u_walkIntensity.value < 0.001) uniforms.u_walkIntensity.value = 0
  if (uniforms.u_walkIntensity.value > 0.999) uniforms.u_walkIntensity.value = 1

  // Advance walk time when intensity > 0 (keeps cycle running during decay)
  if (uniforms.u_walkIntensity.value > 0) {
    uniforms.u_walkTime.value += dt * Math.max(speed, 0.5)
  }
}
