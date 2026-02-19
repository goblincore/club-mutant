import { useMemo } from 'react'
import * as THREE from 'three'

// Procedural tatami mat floor shader — traditional herringbone layout with woven grain

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
  // Tatami grid: 6x6 layout of mat pairs
  vec2 gridUv = vUv * 6.0;
  vec2 cell = floor(gridUv);
  vec2 cellFrac = fract(gridUv);

  // Traditional herringbone: alternate cells are horizontal vs vertical mats
  // In a checkerboard pattern, even cells have horizontal grain, odd cells have vertical
  float checker = mod(cell.x + cell.y, 2.0);

  // Woven grain direction — either along X or Y depending on checker
  vec2 grainUv = checker < 0.5 ? vec2(cellFrac.x, cellFrac.y) : vec2(cellFrac.y, cellFrac.x);

  // Woven texture: fine horizontal lines (grain) with slight color variation
  float grainLines = sin(grainUv.y * 120.0) * 0.5 + 0.5;
  grainLines = grainLines * 0.08 + 0.92; // subtle grain between 0.92 and 1.0

  // Cross weave (perpendicular, very subtle)
  float crossWeave = sin(grainUv.x * 40.0) * 0.5 + 0.5;
  crossWeave = crossWeave * 0.03 + 0.97;

  // Base tatami color — dark nighttime green-beige
  vec3 tatamiA = vec3(0.22, 0.20, 0.12); // warm dark beige-green
  vec3 tatamiB = vec3(0.18, 0.18, 0.10); // dark green
  float colorVar = noise(cell * 7.3) * 0.5 + 0.25;
  vec3 baseColor = mix(tatamiA, tatamiB, colorVar);

  // Apply grain texture
  baseColor *= grainLines * crossWeave;

  // Per-mat surface noise for natural variation
  float surfNoise = noise(gridUv * 8.0 + cell * 5.1) * 0.06 - 0.03;
  baseColor += surfNoise;

  // Border/edging lines between mats (dark brown)
  float borderW = 0.04;
  float isEdgeX = 1.0 - step(borderW, cellFrac.x) * step(borderW, 1.0 - cellFrac.x);
  float isEdgeY = 1.0 - step(borderW, cellFrac.y) * step(borderW, 1.0 - cellFrac.y);
  float isBorder = max(isEdgeX, isEdgeY);

  // Border color — very dark brown/black edging tape
  vec3 borderColor = vec3(0.08, 0.05, 0.02);
  float borderNoise = noise(gridUv * 30.0) * 0.03;
  borderColor += borderNoise;

  // Slight darkening toward edges of each mat for depth
  float edgeDist = min(min(cellFrac.x, 1.0 - cellFrac.x), min(cellFrac.y, 1.0 - cellFrac.y));
  float edgeDarken = smoothstep(0.0, 0.1, edgeDist);
  baseColor *= 0.92 + edgeDarken * 0.08;

  vec3 color = mix(baseColor, borderColor, isBorder);

  gl_FragColor = vec4(color, uOpacity);
}
`

export function TatamiFloorMaterial() {
  const uniforms = useMemo(
    () => ({
      uOpacity: { value: 1.0 },
    }),
    []
  )

  return (
    <shaderMaterial
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
      side={THREE.DoubleSide}
    />
  )
}
