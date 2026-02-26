import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import {
  audioBass,
  audioMid,
  audioHigh,
  audioEnergy,
  audioAnalyserActive,
} from '../hooks/useAudioAnalyser'

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

uniform sampler2D tVideo;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uTime;
uniform float uOpacity;

// Simple pseudo-random noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Convert RGB to HSV
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// Convert HSV to RGB
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 uv = vUv;

  // ── Chromatic aberration (bass-driven) ──────────────────────────
  // Offset R and B channels outward from center, proportional to bass
  float chromaOffset = uBass * 0.006;
  vec2 dir = uv - 0.5;
  float r = texture2D(tVideo, uv + dir * chromaOffset).r;
  float g = texture2D(tVideo, uv).g;
  float b = texture2D(tVideo, uv - dir * chromaOffset).b;
  vec3 color = vec3(r, g, b);

  // ── Brightness pulse (mid-driven) ──────────────────────────────
  // Subtle brightness boost on beats
  color *= 1.0 + uMid * 0.2;

  // ── Scanline noise (high-driven) ───────────────────────────────
  // Animated horizontal grain that intensifies with high frequencies
  float scanY = floor(vUv.y * 200.0);
  float noise = hash(vec2(scanY, floor(uTime * 12.0)));
  float noiseIntensity = uHigh * 0.25;
  color += (noise - 0.5) * noiseIntensity;

  // ── Saturation shift (energy-driven) ───────────────────────────
  // Boost saturation when loud, desaturate when quiet
  vec3 hsv = rgb2hsv(color);
  hsv.y = clamp(hsv.y + (uEnergy - 0.2) * 0.5, 0.0, 1.0);
  color = hsv2rgb(hsv);

  gl_FragColor = vec4(color, uOpacity);
}
`

interface AudioReactiveVideoMaterialProps {
  videoTexture: THREE.Texture
}

export function AudioReactiveVideoMaterial({ videoTexture }: AudioReactiveVideoMaterialProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      tVideo: { value: null as THREE.Texture | null },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uEnergy: { value: 0 },
      uTime: { value: 0 },
      uOpacity: { value: 1.0 },
    }),
    []
  )

  // Update texture uniform when prop changes (NOT inline — stable ref)
  useEffect(() => {
    if (matRef.current) {
      matRef.current.uniforms.tVideo.value = videoTexture
    }
  }, [videoTexture])

  useFrame(({ clock }) => {
    if (!matRef.current) return
    const u = matRef.current.uniforms

    u.uTime.value = clock.elapsedTime

    if (audioAnalyserActive) {
      u.uBass.value = audioBass
      u.uMid.value = audioMid
      u.uHigh.value = audioHigh
      u.uEnergy.value = audioEnergy
    } else {
      // Decay to zero when no audio data — video shows without effects
      u.uBass.value *= 0.95
      u.uMid.value *= 0.95
      u.uHigh.value *= 0.95
      u.uEnergy.value *= 0.95
    }
  })

  return (
    <shaderMaterial
      ref={matRef}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
      transparent
      toneMapped={false}
    />
  )
}
