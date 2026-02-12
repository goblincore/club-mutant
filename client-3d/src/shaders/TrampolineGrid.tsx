import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { getRippleVec4s, getRippleCount, getTime, TRAMPOLINE } from '../scene/TrampolineRipples'

// Custom deforming grid overlay that rides the trampoline ripples.
// Replaces drei <Grid> which can't deform with vertex displacement.

const GRID_SEGMENTS = 96

const gridVertexShader = `
varying vec2 vWorldXZ;

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

void main() {
  // Grid plane is rotated -PI/2 on X (same as floor), so local Z = world Y
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vec2 worldXZ = worldPos.xz;

  vec3 displaced = position;
  displaced.z += getDisplacement(worldXZ);

  vWorldXZ = worldXZ;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`

const gridFragmentShader = `
precision highp float;

varying vec2 vWorldXZ;

uniform float uRoomSize;
uniform float uFadeDistance;

// Draw anti-aliased grid lines
float gridLine(float coord, float thickness) {
  float d = abs(fract(coord - 0.5) - 0.5);
  float fw = fwidth(coord);
  return 1.0 - smoothstep(thickness - fw, thickness + fw, d);
}

void main() {
  // Cell grid (every 1 unit)
  float cellX = gridLine(vWorldXZ.x, 0.015);
  float cellZ = gridLine(vWorldXZ.y, 0.015);
  float cell = max(cellX, cellZ) * 0.3;

  // Section grid (every 4 units)
  float secX = gridLine(vWorldXZ.x / 4.0, 0.02);
  float secZ = gridLine(vWorldXZ.y / 4.0, 0.02);
  float sec = max(secX, secZ) * 0.6;

  float line = max(cell, sec);

  // Fade with distance from center
  float dist = length(vWorldXZ);
  float fade = 1.0 - smoothstep(uRoomSize * 0.3, uFadeDistance, dist);

  // Cell color: warm yellow; section color: darker gold
  vec3 cellColor = vec3(0.91, 0.78, 0.20); // #e8c832
  vec3 secColor = vec3(0.83, 0.63, 0.13);  // #d4a020

  vec3 color = mix(cellColor, secColor, step(cell, sec));

  float alpha = line * fade;

  if (alpha < 0.01) discard;

  gl_FragColor = vec4(color, alpha);
}
`

function makeRippleUniforms(): THREE.Vector4[] {
  return Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0))
}

interface TrampolineGridProps {
  roomSize: number
}

export function TrampolineGrid({ roomSize }: TrampolineGridProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRoomSize: { value: roomSize },
      uFadeDistance: { value: 20 },
      uRipples: { value: makeRippleUniforms() },
      uRippleCount: { value: 0 },
    }),
    [roomSize]
  )

  useFrame(() => {
    if (!matRef.current) return

    const t = getTime()

    matRef.current.uniforms.uTime.value = t
    matRef.current.uniforms.uRippleCount.value = getRippleCount()

    const vecs = getRippleVec4s()
    const uRipples = matRef.current.uniforms.uRipples.value as THREE.Vector4[]

    for (let i = 0; i < 16; i++) {
      uRipples[i].copy(vecs[i])
    }
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
      <planeGeometry args={[roomSize, roomSize, GRID_SEGMENTS, GRID_SEGMENTS]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={gridVertexShader}
        fragmentShader={gridFragmentShader}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        /* fwidth() requires OES_standard_derivatives — enabled by default in WebGL2 */
        uniforms={uniforms}
      />
    </mesh>
  )
}
