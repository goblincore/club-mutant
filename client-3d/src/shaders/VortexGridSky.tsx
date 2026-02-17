import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Spinning polar grid vortex on a dark cloudy/swirly background

const vertexShader = `
varying vec3 vWorldPos;

void main() {
  vWorldPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = `
precision highp float;

varying vec3 vWorldPos;

uniform float uTime;

#define PI 3.14159265359
#define TAU 6.28318530718

// --- value noise ---
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

// --- fractal brownian motion ---
float fbm(vec2 p) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;

  for (int i = 0; i < 4; i++) {
    val += amp * noise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }

  return val;
}

// --- polar grid with vortex tunnel effect ---
float vortexGrid(vec2 uv, float time) {
  // Polar coordinates from center
  vec2 centered = uv - 0.5;
  float radius = length(centered);
  float angle = atan(centered.y, centered.x);

  // Vortex twist — angle offset increases toward center
  float twist = 1.5 / (radius + 0.1);
  angle += twist * 0.3 + time * 0.4;

  // Tunnel depth — compress rings toward center for depth illusion
  float depth = 1.0 / (radius + 0.05);

  // Concentric rings
  float rings = abs(fract(depth * 0.15 - time * 0.1) - 0.5) * 2.0;
  rings = smoothstep(0.42, 0.5, rings);

  // Radial spokes
  float spokeCount = 16.0;
  float spokes = abs(fract(angle * spokeCount / TAU) - 0.5) * 2.0;
  spokes = smoothstep(0.42, 0.5, spokes);

  // Combine into grid lines
  float grid = max(rings, spokes);

  // Fade grid intensity toward edges (outer area dimmer)
  float edgeFade = smoothstep(0.6, 0.1, radius);
  grid *= edgeFade;

  return grid;
}

void main() {
  vec3 dir = normalize(vWorldPos);

  // Spherical coords — map to a 2D UV for the vortex
  float u = atan(dir.x, dir.z) / TAU + 0.5;
  float v = dir.y * 0.5 + 0.5;
  vec2 uv = vec2(u, v);

  // --- dark swirly cloud background ---
  vec2 cloudUv = uv * 3.0;
  float drift = uTime * 0.25;
  cloudUv += vec2(drift, drift * 0.6);

  // Swirling distortion
  float swirl = fbm(cloudUv * 0.8 + vec2(sin(uTime * 0.15) * 0.5, cos(uTime * 0.12) * 0.5));
  cloudUv += vec2(swirl * 0.4 - 0.2, swirl * 0.3 - 0.15);

  float cloud1 = fbm(cloudUv * 0.7);
  float cloud2 = fbm(cloudUv * 0.7 + vec2(4.1, 2.3));
  float cloudDensity = (cloud1 + cloud2) * 0.5;

  // Dark blue/indigo base palette
  vec3 bgDeep = vec3(0.04, 0.06, 0.20);
  vec3 bgMid = vec3(0.08, 0.12, 0.32);
  vec3 bgLight = vec3(0.12, 0.18, 0.42);

  vec3 bg = mix(bgDeep, bgMid, smoothstep(0.3, 0.6, cloudDensity));
  bg = mix(bg, bgLight, smoothstep(0.55, 0.75, cloudDensity) * 0.6);

  // --- spinning grid vortex ---
  // Use spherical mapping centered on the forward direction
  float gridAngle = atan(dir.x, dir.z);
  float gridElev = asin(clamp(dir.y, -1.0, 1.0));
  vec2 gridUv = vec2(gridAngle / TAU + 0.5, gridElev / PI + 0.5);

  float grid = vortexGrid(gridUv, uTime);

  // Grid line color — pale blue with slight glow
  vec3 gridColor = vec3(0.35, 0.50, 0.85);
  vec3 gridGlow = vec3(0.20, 0.30, 0.65);

  // Add grid lines over background
  vec3 color = bg + gridColor * grid * 0.7;

  // Soft glow around grid lines
  float softGrid = vortexGrid(gridUv, uTime);
  color += gridGlow * softGrid * 0.15;

  gl_FragColor = vec4(color, 1.0);
}
`

export function VortexGridSky() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    []
  )

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.getElapsedTime()
    }
  })

  return (
    <mesh>
      <sphereGeometry args={[50, 32, 16]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  )
}
