import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Animated TV static floor material — ported from 2D client's TvStaticPostFxPipeline
// Renders per-pixel noise with frame jitter and subtle color tinting

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

export function TvStaticFloorMaterial() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.getElapsedTime()
    }
  })

  return (
    <shaderMaterial
      ref={matRef}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={{
        uTime: { value: 0 },
        uScale: { value: new THREE.Vector2(120, 120) },
      }}
    />
  )
}
