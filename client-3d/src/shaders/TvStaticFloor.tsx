import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { getRippleVec4s, getRippleCount, getTime, TRAMPOLINE } from '../scene/TrampolineRipples'

// Animated TV static floor material — ported from 2D client's TvStaticPostFxPipeline
// Renders per-pixel noise with frame jitter and subtle color tinting

const vertexShader = `
varying vec2 vUv;

#define MAX_RIPPLES 16

uniform vec4 uRipples[MAX_RIPPLES]; // xy = world xz position, z = birthTime, w = amplitude
uniform int uRippleCount;
uniform float uTime;

const float WAVE_SPEED = ${TRAMPOLINE.WAVE_SPEED};
const float WAVE_FREQ = ${TRAMPOLINE.WAVE_FREQ};
const float DECAY_TIME = ${TRAMPOLINE.DECAY_TIME};
const float DIST_DECAY = ${TRAMPOLINE.DIST_DECAY};
const float LIFETIME = ${TRAMPOLINE.LIFETIME};

float getDisplacement(vec2 worldXZ) {
  float totalDisp = 0.0;

  for (int i = 0; i < MAX_RIPPLES; i++) {
    if (i >= uRippleCount) break;

    vec2 center = uRipples[i].xy;
    float birthTime = uRipples[i].z;
    float amplitude = uRipples[i].w;

    float age = uTime - birthTime;
    if (age < 0.0 || age > LIFETIME) continue;

    float dist = distance(worldXZ, center);
    float decay = exp(-age * DECAY_TIME) * exp(-dist * DIST_DECAY);
    float phase = dist * WAVE_FREQ - age * WAVE_SPEED * WAVE_FREQ;

    totalDisp += sin(phase) * amplitude * decay;
  }

  return totalDisp;
}

void main() {
  vUv = uv;

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vec2 worldXZ = worldPos.xz;

  vec3 displaced = position;
  displaced.z += getDisplacement(worldXZ);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`

const fragmentShader = `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec2 uScale;

// High quality hash — matches 2D client
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  // Pixel-ish coords (scale UV to get visible grain)
  vec2 pixCoord = vUv * uScale;

  // Frame counter — mod to prevent precision loss
  float frame = mod(floor(uTime * 24.0), 3727.0);

  // Per-frame jitter so static animates
  vec2 frameJitter = vec2(
    hash(vec2(frame, 0.5)),
    hash(vec2(0.5, frame))
  );

  vec2 seed = pixCoord + frameJitter * 1000.0;
  float noise = hash(seed);

  // Flicker — subtle per-frame brightness variation
  float flicker = hash(vec2(frame, 0.0)) * 0.1 - 0.05;
  noise = clamp(noise + flicker, 0.0, 1.0);

  // Tint the static with a dark purple/teal vibe
  vec3 tintA = vec3(0.15, 0.05, 0.25); // dark purple
  vec3 tintB = vec3(0.05, 0.15, 0.2);  // dark teal

  // Slowly shift tint over time
  float tintMix = sin(uTime * 0.3) * 0.5 + 0.5;
  vec3 tint = mix(tintA, tintB, tintMix);

  // Mix noise with tint — mostly dark with bright speckles
  vec3 color = tint + vec3(noise) * 0.45;

  // Horizontal scan bands (subtle)
  float scanline = sin(pixCoord.y * 3.14159 * 2.0) * 0.03;
  color += scanline;

  gl_FragColor = vec4(color, 1.0);
}
`

export const FLOOR_SEGMENTS = 96

// Shared ripple displacement GLSL block (reused by grid shader too)
export const RIPPLE_DISPLACEMENT_GLSL = `
#define MAX_RIPPLES 16

uniform vec4 uRipples[MAX_RIPPLES];
uniform int uRippleCount;
uniform float uTime;

const float WAVE_SPEED = ${TRAMPOLINE.WAVE_SPEED};
const float WAVE_FREQ = ${TRAMPOLINE.WAVE_FREQ};
const float DECAY_TIME = ${TRAMPOLINE.DECAY_TIME};
const float DIST_DECAY = ${TRAMPOLINE.DIST_DECAY};
const float LIFETIME = ${TRAMPOLINE.LIFETIME};

float getDisplacement(vec2 worldXZ) {
  float totalDisp = 0.0;

  for (int i = 0; i < MAX_RIPPLES; i++) {
    if (i >= uRippleCount) break;

    vec2 center = uRipples[i].xy;
    float birthTime = uRipples[i].z;
    float amplitude = uRipples[i].w;

    float age = uTime - birthTime;
    if (age < 0.0 || age > LIFETIME) continue;

    float dist = distance(worldXZ, center);
    float decay = exp(-age * DECAY_TIME) * exp(-dist * DIST_DECAY);
    float phase = dist * WAVE_FREQ - age * WAVE_SPEED * WAVE_FREQ;

    totalDisp += sin(phase) * amplitude * decay;
  }

  return totalDisp;
}
`

// Video texture vertex shader — same displacement, passes UV for texture sampling
const videoVertexShader = `
varying vec2 vUv;

${RIPPLE_DISPLACEMENT_GLSL}

void main() {
  vUv = uv;

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vec2 worldXZ = worldPos.xz;

  vec3 displaced = position;
  displaced.z += getDisplacement(worldXZ);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`

const videoFragmentShader = `
precision highp float;

varying vec2 vUv;
uniform sampler2D uVideoMap;

void main() {
  gl_FragColor = texture2D(uVideoMap, vUv);
}
`

// Build initial ripple uniform array (vec4 x 16)
function makeRippleUniforms(): THREE.Vector4[] {
  return Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0))
}

// Helper to update ripple uniforms on a shader material ref.
// Uses getTime() from TrampolineRipples so uTime matches ripple birthTimes exactly.
function updateRippleUniforms(mat: THREE.ShaderMaterial) {
  const t = getTime()

  mat.uniforms.uTime.value = t
  mat.uniforms.uRippleCount.value = getRippleCount()

  const vecs = getRippleVec4s()
  const uRipples = mat.uniforms.uRipples.value as THREE.Vector4[]

  for (let i = 0; i < 16; i++) {
    uRipples[i].copy(vecs[i])
  }
}

// Video texture material with ripple displacement
export function TrampolineVideoMaterial({ videoTexture }: { videoTexture: THREE.VideoTexture }) {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uVideoMap: { value: videoTexture },
      uRipples: { value: makeRippleUniforms() },
      uRippleCount: { value: 0 },
    }),
    [videoTexture]
  )

  useFrame(() => {
    if (!matRef.current) return
    updateRippleUniforms(matRef.current)
  })

  return (
    <shaderMaterial
      ref={matRef}
      vertexShader={videoVertexShader}
      fragmentShader={videoFragmentShader}
      uniforms={uniforms}
    />
  )
}

export function TvStaticFloorMaterial() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScale: { value: new THREE.Vector2(120, 120) },
      uRipples: { value: makeRippleUniforms() },
      uRippleCount: { value: 0 },
    }),
    []
  )

  useFrame(() => {
    if (!matRef.current) return
    updateRippleUniforms(matRef.current)
  })

  return (
    <shaderMaterial
      ref={matRef}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
    />
  )
}
