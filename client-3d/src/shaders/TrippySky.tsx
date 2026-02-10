import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Trippy animated skybox — large inverted sphere with shifting nebula/gradient shader

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

// Simplex-ish noise
float hash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash(i);
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);

  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);

  return mix(nxy0, nxy1, f.z);
}

// Fractal brownian motion
float fbm(vec3 p) {
  float val = 0.0;
  float amp = 0.5;

  for (int i = 0; i < 4; i++) {
    val += amp * noise(p);
    p *= 2.1;
    amp *= 0.5;
  }

  return val;
}

void main() {
  vec3 dir = normalize(vWorldPos);

  // Slowly rotating sample point
  float t = uTime * 0.04;
  vec3 samplePos = dir * 2.0 + vec3(t, t * 0.7, t * 0.3);

  float n = fbm(samplePos);
  float n2 = fbm(samplePos + vec3(5.2, 1.3, 2.8));

  // Color palette — deep purples, teals, and dark magentas
  vec3 deepPurple = vec3(0.08, 0.02, 0.15);
  vec3 darkTeal = vec3(0.02, 0.08, 0.12);
  vec3 magenta = vec3(0.2, 0.02, 0.15);
  vec3 midnight = vec3(0.01, 0.01, 0.03);

  // Layered color mixing
  vec3 color = mix(deepPurple, darkTeal, n);
  color = mix(color, magenta, n2 * 0.5);
  color = mix(midnight, color, 0.6 + n * 0.4);

  // Subtle stars — bright dots from high-frequency noise
  float starNoise = hash(dir * 500.0 + floor(uTime * 0.5));
  float stars = smoothstep(0.97, 1.0, starNoise) * 0.6;
  color += vec3(stars);

  // Vertical gradient — darker at bottom, lighter at top
  float heightGrad = dir.y * 0.5 + 0.5;
  color *= 0.5 + heightGrad * 0.6;

  gl_FragColor = vec4(color, 1.0);
}
`

export function TrippySky() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

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
        uniforms={{
          uTime: { value: 0 },
        }}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  )
}
