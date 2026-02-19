import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Dusk/nighttime sky — deep blue-purple gradient with stars and soft clouds

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

// --- fractal brownian motion ---
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

// --- star field ---
float stars(vec2 p) {
  // Hash-based stars — tiny bright dots
  float h = hash(floor(p * 80.0));
  float star = step(0.985, h);

  // Twinkle
  float twinkle = sin(uTime * 1.5 + h * 100.0) * 0.3 + 0.7;

  // Vary brightness
  float brightness = h * h * 0.8 + 0.2;

  return star * twinkle * brightness;
}

void main() {
  vec3 dir = normalize(vWorldPos);
  float elevation = dir.y;

  // --- sky gradient (deep night: dark blue-purple → navy → warm horizon) ---
  vec3 skyZenith  = vec3(0.02, 0.02, 0.08);   // near-black deep blue
  vec3 skyUpper   = vec3(0.05, 0.03, 0.15);   // dark purple
  vec3 skyMid     = vec3(0.08, 0.05, 0.18);   // purple-blue
  vec3 skyHorizon = vec3(0.15, 0.06, 0.12);   // warm dusk horizon (subtle mauve)
  vec3 skyBelow   = vec3(0.04, 0.03, 0.06);   // very dark below

  vec3 sky;

  if (elevation > 0.0) {
    float t = elevation;
    sky = mix(skyHorizon, skyMid, smoothstep(0.0, 0.15, t));
    sky = mix(sky, skyUpper, smoothstep(0.15, 0.4, t));
    sky = mix(sky, skyZenith, smoothstep(0.4, 0.8, t));
  } else {
    sky = mix(skyHorizon, skyBelow, smoothstep(0.0, 0.4, -elevation));
  }

  // --- subtle warm glow at horizon (dusk remnant) ---
  float horizonGlow = exp(-abs(elevation) * 12.0) * 0.15;
  vec3 glowColor = vec3(0.25, 0.08, 0.12); // warm amber-pink
  sky += glowColor * horizonGlow;

  // --- stars (only above horizon) ---
  if (elevation > 0.05) {
    float cloudHeight = 1.0 / max(elevation, 0.05);
    vec2 starUv = dir.xz * cloudHeight * 1.5;

    float starBright = stars(starUv);

    // Fade stars near horizon
    float starFade = smoothstep(0.05, 0.25, elevation);
    sky += vec3(0.8, 0.85, 1.0) * starBright * starFade * 0.5;
  }

  // --- very faint dark clouds (barely visible wisps) ---
  if (elevation > 0.02) {
    float cloudHeight = 1.0 / max(elevation, 0.05);
    vec2 cloudUv = dir.xz * cloudHeight * 0.8;

    float drift = uTime * 0.15;
    cloudUv += vec2(drift, drift * 0.3);

    float cloud1 = fbm(cloudUv * 0.6);
    float cloud2 = fbm(cloudUv * 0.6 + vec2(3.7, 1.2));

    float cloudDensity = (cloud1 + cloud2) * 0.5;
    float cloudMask = smoothstep(0.4, 0.6, cloudDensity);

    // Very dark clouds — barely visible against sky
    vec3 cloudColor = vec3(0.06, 0.04, 0.1);
    float horizonFade = smoothstep(0.02, 0.15, elevation);
    cloudMask *= horizonFade;

    sky = mix(sky, cloudColor, cloudMask * 0.35);
  }

  gl_FragColor = vec4(sky, 1.0);
}
`

export function NightSky() {
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
