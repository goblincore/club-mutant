import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Procedural animated ocean/mountain window view — nighttime moonlit scene, PSX-style

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

// Simple hash
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

void main() {
  vec2 uv = vUv;

  // === Nighttime Sky (top portion, above y=0.55) ===
  vec3 skyTop = vec3(0.02, 0.02, 0.08);     // near-black
  vec3 skyHorizon = vec3(0.06, 0.04, 0.12);  // dark purple horizon
  float skyGrad = smoothstep(0.55, 1.0, uv.y);
  vec3 skyColor = mix(skyHorizon, skyTop, skyGrad);

  // Faint stars in the sky
  float starHash = hash(floor(uv * 60.0));
  float star = step(0.98, starHash) * (sin(uTime * 1.2 + starHash * 80.0) * 0.3 + 0.7);
  skyColor += vec3(0.6, 0.65, 0.8) * star * 0.3 * smoothstep(0.6, 0.9, uv.y);

  // Moon (small bright circle in upper right)
  float moonDist = length(uv - vec2(0.75, 0.85));
  float moonMask = 1.0 - smoothstep(0.03, 0.04, moonDist);
  skyColor += vec3(0.7, 0.7, 0.6) * moonMask;

  // === Mountains (y ~ 0.45 to 0.60) — dark silhouettes ===
  float mountainBase = 0.50;
  float ridge1 = mountainBase + sin(uv.x * 6.0 + 1.0) * 0.04 + sin(uv.x * 12.0) * 0.02;
  float ridge2 = mountainBase - 0.03 + sin(uv.x * 8.0 + 3.0) * 0.03 + sin(uv.x * 15.0) * 0.015;

  // Distant mountain (very dark blue-gray)
  vec3 mountainFar = vec3(0.08, 0.08, 0.14);
  float isMountainFar = 1.0 - step(ridge1 + 0.04, uv.y);
  float aboveOcean = step(0.38, uv.y);

  // Near mountain (nearly black)
  vec3 mountainNear = vec3(0.04, 0.05, 0.06);
  float isMountainNear = 1.0 - step(ridge2, uv.y);

  // === Ocean (y ~ 0.08 to 0.45) — dark moonlit water ===
  vec3 oceanDeep = vec3(0.02, 0.06, 0.12);
  vec3 oceanShallow = vec3(0.04, 0.10, 0.16);
  float oceanGrad = smoothstep(0.08, 0.45, uv.y);
  vec3 oceanColor = mix(oceanDeep, oceanShallow, oceanGrad);

  // Moonlight reflection on water — silvery shimmer
  float wave1 = sin(uv.x * 20.0 + uTime * 1.5 + uv.y * 10.0) * 0.5 + 0.5;
  float wave2 = sin(uv.x * 14.0 - uTime * 1.0 + uv.y * 8.0 + 2.0) * 0.5 + 0.5;
  float waveCombined = wave1 * wave2;
  float waveHighlight = smoothstep(0.6, 0.8, waveCombined) * 0.06;
  oceanColor += vec3(0.15, 0.15, 0.2) * waveHighlight;

  // Moon reflection path on water (vertical streak under moon)
  float moonReflX = abs(uv.x - 0.75);
  float moonRefl = exp(-moonReflX * 15.0) * smoothstep(0.08, 0.4, uv.y) * (1.0 - smoothstep(0.4, 0.45, uv.y));
  float reflShimmer = sin(uv.y * 40.0 + uTime * 2.0) * 0.3 + 0.7;
  oceanColor += vec3(0.12, 0.12, 0.15) * moonRefl * reflShimmer * 0.5;

  // Gentle sparkle (very faint)
  float sparkle = noise(vec2(uv.x * 30.0 + uTime * 0.5, uv.y * 20.0));
  sparkle = smoothstep(0.8, 0.9, sparkle) * 0.04;
  oceanColor += sparkle;

  // === Road/shore (y ~ 0.0 to 0.12) — dark ===
  vec3 shoreColor = vec3(0.08, 0.07, 0.06);
  float roadLine = smoothstep(0.04, 0.06, uv.y) * (1.0 - smoothstep(0.06, 0.08, uv.y));
  vec3 roadColor = vec3(0.05, 0.05, 0.05);

  // === Compose layers (bottom to top) ===
  vec3 color = shoreColor;

  // Road stripe
  color = mix(color, roadColor, roadLine * 0.5);

  // Ocean above shore
  float isOcean = smoothstep(0.08, 0.10, uv.y) * (1.0 - smoothstep(0.43, 0.45, uv.y));
  color = mix(color, oceanColor, isOcean);

  // Mountains
  color = mix(color, mountainFar, isMountainFar * aboveOcean);
  color = mix(color, mountainNear, isMountainNear * aboveOcean);

  // Sky above everything
  float isSky = smoothstep(0.53, 0.55, uv.y);
  color = mix(color, skyColor, isSky);

  // PSX color quantization
  color = floor(color * 24.0 + 0.5) / 24.0;

  // Slight brightness from moonlight through window (very subtle)
  color *= 0.85;

  gl_FragColor = vec4(color, 1.0);
}
`

export function OceanViewMaterial() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    []
  )

  useFrame((_, delta) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value += delta
    }
  })

  return (
    <shaderMaterial
      ref={matRef}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
      side={THREE.FrontSide}
    />
  )
}
