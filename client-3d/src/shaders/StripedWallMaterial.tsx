import { useMemo } from 'react'
import * as THREE from 'three'

// Procedural vertical red/white striped wallpaper — curtain/wallpaper look

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

uniform vec2 uRepeat;
uniform float uOpacity;

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
  vec2 uv = vUv * uRepeat;

  // Vertical stripes — alternating dark red and dark cream (nighttime)
  float stripe = step(0.5, fract(uv.x));

  // Muted dark red
  vec3 redColor = vec3(0.25, 0.04, 0.04);
  // Dark cream / warm gray
  vec3 whiteColor = vec3(0.28, 0.26, 0.24);

  vec3 baseColor = mix(redColor, whiteColor, stripe);

  // Subtle fabric noise — vertical grain
  float fabricNoise = noise(vec2(uv.x * 2.0, uv.y * 40.0)) * 0.02 - 0.01;
  baseColor += fabricNoise;

  // Very subtle vertical thread lines
  float threads = sin(uv.x * uRepeat.x * 3.14159 * 2.0) * 0.01;
  baseColor += threads;

  // Slight darkening at bottom for shadow/weight
  float bottomDarken = smoothstep(0.0, 0.3, vUv.y) * 0.1 + 0.9;
  baseColor *= bottomDarken;

  gl_FragColor = vec4(baseColor, uOpacity);
}
`

interface StripedWallMaterialProps {
  repeat?: [number, number]
}

export function StripedWallMaterial({ repeat = [12, 1] }: StripedWallMaterialProps) {
  const uniforms = useMemo(
    () => ({
      uRepeat: { value: new THREE.Vector2(repeat[0], repeat[1]) },
      uOpacity: { value: 1.0 },
    }),
    [repeat[0], repeat[1]]
  )

  return (
    <shaderMaterial
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
      transparent={true}
      depthWrite={false}
      side={THREE.DoubleSide}
    />
  )
}
