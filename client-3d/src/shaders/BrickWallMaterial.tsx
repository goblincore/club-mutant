import { useMemo } from 'react'
import * as THREE from 'three'

// Procedural brick wall shader — PSX-crunchy red/brown bricks with mortar lines

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

  // Brick grid — offset every other row
  float row = floor(uv.y);
  float xOffset = mod(row, 2.0) * 0.5;
  vec2 brickUv = vec2(uv.x + xOffset, uv.y);

  // Position within the brick
  vec2 brickPos = fract(brickUv);

  // Mortar lines (thin gaps between bricks)
  float mortarW = 0.06;
  float mortarH = 0.08;
  float isMortar = 1.0 - step(mortarW, brickPos.x) * step(mortarW, 1.0 - brickPos.x)
                       * step(mortarH, brickPos.y) * step(mortarH, 1.0 - brickPos.y);

  // Brick color — varied per brick
  vec2 brickId = floor(brickUv);
  float brickHash = hash(brickId);

  // Base brick colors — dark reds and browns
  vec3 brickA = vec3(0.45, 0.12, 0.08);  // dark red
  vec3 brickB = vec3(0.55, 0.18, 0.10);  // warm red
  vec3 brickC = vec3(0.38, 0.15, 0.12);  // brown-red

  vec3 brickColor = mix(brickA, brickB, smoothstep(0.3, 0.7, brickHash));
  brickColor = mix(brickColor, brickC, smoothstep(0.6, 0.9, brickHash));

  // Per-brick noise for surface texture
  float surfaceNoise = noise(brickUv * 8.0 + brickId * 3.7) * 0.12;
  brickColor += surfaceNoise - 0.06;

  // Slight darkening at brick edges for depth
  float edgeDist = min(min(brickPos.x, 1.0 - brickPos.x), min(brickPos.y, 1.0 - brickPos.y));
  float edgeDarken = smoothstep(0.0, 0.15, edgeDist);
  brickColor *= 0.85 + edgeDarken * 0.15;

  // Mortar color
  vec3 mortarColor = vec3(0.35, 0.32, 0.28);
  float mortarNoise = noise(uv * 20.0) * 0.05;
  mortarColor += mortarNoise;

  vec3 color = mix(brickColor, mortarColor, isMortar);

  gl_FragColor = vec4(color, uOpacity);
}
`

interface BrickWallMaterialProps {
  repeat?: [number, number]
}

export function BrickWallMaterial({ repeat = [6, 3] }: BrickWallMaterialProps) {
  // Stable uniforms — must survive re-renders so occlusion code can mutate uOpacity.value
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
