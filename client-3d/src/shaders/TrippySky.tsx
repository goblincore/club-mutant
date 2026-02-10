import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Windows 95-style sky — blue gradient with soft fluffy procedural clouds

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

// --- fractal brownian motion (5 octaves for fluffy detail) ---
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

void main() {
  vec3 dir = normalize(vWorldPos);

  // Spherical coords for sky mapping
  float elevation = dir.y; // -1 (bottom) to +1 (top)

  // --- sky gradient (Win95 teal-to-deep-blue, darkened to survive VHS bloom) ---
  vec3 skyTop = vec3(0.02, 0.12, 0.4);     // deep blue
  vec3 skyMid = vec3(0.12, 0.3, 0.55);     // mid blue
  vec3 skyHorizon = vec3(0.25, 0.4, 0.6);  // pale horizon
  vec3 skyBottom = vec3(0.15, 0.25, 0.45); // muted blue below

  vec3 sky;

  if (elevation > 0.0) {
    // Upper hemisphere
    float t = elevation;
    sky = mix(skyHorizon, skyMid, smoothstep(0.0, 0.3, t));
    sky = mix(sky, skyTop, smoothstep(0.3, 0.8, t));
  } else {
    // Below horizon — muted gradient
    sky = mix(skyHorizon, skyBottom, smoothstep(0.0, 0.5, -elevation));
  }

  // --- cloud layer ---
  // Project onto a flat plane above the viewer for classic flat cloud look
  if (elevation > 0.02) {
    // Flatten direction onto xz plane at a fixed height
    float cloudHeight = 1.0 / max(elevation, 0.05);
    vec2 cloudUv = dir.xz * cloudHeight * 0.8;

    // Drift clouds
    float drift = uTime * 0.4;
    cloudUv += vec2(drift, drift * 0.3);

    // Two layers of FBM for fluffy cloud shapes
    float cloud1 = fbm(cloudUv * 0.6);
    float cloud2 = fbm(cloudUv * 0.6 + vec2(3.7, 1.2));

    // Combine layers for shape variation
    float cloudDensity = (cloud1 + cloud2) * 0.5;

    // Soft threshold for puffy edges
    float cloudMask = smoothstep(0.35, 0.55, cloudDensity);

    // Cloud colors (toned down to survive VHS bloom)
    vec3 cloudBright = vec3(0.65, 0.68, 0.72);
    vec3 cloudShadow = vec3(0.4, 0.42, 0.5);
    float cloudShading = smoothstep(0.35, 0.6, cloud1);
    vec3 cloudColor = mix(cloudShadow, cloudBright, cloudShading);

    // Fade clouds near horizon for depth
    float horizonFade = smoothstep(0.02, 0.15, elevation);
    cloudMask *= horizonFade;

    sky = mix(sky, cloudColor, cloudMask * 0.9);
  }

  gl_FragColor = vec4(sky, 1.0);
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
