import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import {
  audioBass,
  audioMid,
  audioHigh,
  audioEnergy,
  audioAnalyserActive,
} from '../hooks/useAudioAnalyser'

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;

// Value noise (from TrippySky)
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;

  for (int i = 0; i < 5; i++) {
    val += amp * noise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }

  return val;
}

// RGB <-> HSV
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 uv = vUv;

  // Slow UV drift
  uv += vec2(sin(uTime * 0.1) * 0.1, cos(uTime * 0.07) * 0.1);

  // Audio-reactive warp
  uv.x += sin(uv.y * 3.0 + uTime * 0.3) * (0.02 + uBass * 0.04);
  uv.y += cos(uv.x * 3.0 + uTime * 0.2) * (0.02 + uBass * 0.04);

  // Layered noise at different scales + speeds
  float n1 = fbm(uv * 3.0 + uTime * 0.1);
  float n2 = fbm(uv * 5.0 - uTime * 0.15);
  float n3 = fbm(uv * 8.0 + uTime * 0.05);

  // Dream palette — slow cycling through purple/indigo/teal
  vec3 color1 = vec3(0.15, 0.05, 0.3);   // deep purple
  vec3 color2 = vec3(0.05, 0.2, 0.35);   // dark teal
  vec3 color3 = vec3(0.25, 0.1, 0.15);   // muted rose

  float cycle = fract(uTime * 0.02 + uMid * 0.5);
  vec3 palette = mix(
    mix(color1, color2, smoothstep(0.0, 0.5, cycle)),
    color3,
    smoothstep(0.5, 1.0, cycle)
  );

  vec3 color = palette + n1 * 0.3 + n2 * 0.15;

  // Energy brightness pulse
  color *= 0.7 + uEnergy * 0.5;

  // High-frequency grain
  color += n3 * uHigh * 0.1;

  // Vignette
  float vignette = 1.0 - smoothstep(0.3, 0.9, length(vUv - 0.5));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`

export function DreamGenerativeMaterial() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uEnergy: { value: 0 },
    }),
    []
  )

  useFrame(({ clock }) => {
    if (!matRef.current) return
    const u = matRef.current.uniforms

    u.uTime.value = clock.elapsedTime

    if (audioAnalyserActive) {
      u.uBass.value = audioBass
      u.uMid.value = audioMid
      u.uHigh.value = audioHigh
      u.uEnergy.value = audioEnergy
    } else {
      // Slow ambient pulse when no audio
      const t = clock.elapsedTime
      u.uBass.value = 0.15 + Math.sin(t * 0.3) * 0.1
      u.uMid.value = 0.1 + Math.sin(t * 0.2) * 0.05
      u.uHigh.value = 0.05
      u.uEnergy.value = 0.15 + Math.sin(t * 0.15) * 0.05
    }
  })

  return (
    <shaderMaterial
      ref={matRef}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
      toneMapped={false}
      depthWrite={false}
      depthTest={false}
    />
  )
}
