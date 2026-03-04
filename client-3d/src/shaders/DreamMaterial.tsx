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
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragmentShader = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uVideoTex;
uniform float uTime;
uniform float uFade;
uniform float uHueOffset;
uniform float uWarpSpeed;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uKaleidoscope;

// RGB <-> HSV conversions (from AudioReactiveVideoMaterial)
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec2 warpUV(vec2 uv, float time, float bassIntensity) {
  float warpAmp = 0.03 + bassIntensity * 0.05;
  float warpFreq = 2.0;
  uv.x += sin(uv.y * warpFreq + time * uWarpSpeed) * warpAmp;
  uv.y += cos(uv.x * warpFreq + time * uWarpSpeed * 0.7) * warpAmp;
  return uv;
}

vec2 kaleidoscope(vec2 uv, float folds) {
  vec2 centered = uv - 0.5;
  float angle = atan(centered.y, centered.x);
  float radius = length(centered);
  float segment = 6.28318 / folds;
  angle = mod(angle, segment);
  angle = abs(angle - segment * 0.5);
  return vec2(cos(angle), sin(angle)) * radius + 0.5;
}

void main() {
  vec2 uv = warpUV(vUv, uTime, uBass);

  // Optional kaleidoscope
  if (uKaleidoscope > 1.0) {
    uv = kaleidoscope(uv, uKaleidoscope);
  }

  vec4 video = texture2D(uVideoTex, uv);

  // Hue rotation — slow drift per layer + mid-frequency influence
  vec3 hsv = rgb2hsv(video.rgb);
  hsv.x = fract(hsv.x + uHueOffset + uTime * 0.05 + uMid * 0.3);
  video.rgb = hsv2rgb(hsv);

  // Energy brightness pulse
  video.rgb *= 0.8 + uEnergy * 0.4;

  // Film grain driven by highs
  float grain = (fract(sin(dot(vUv + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
  video.rgb += grain * uHigh * 0.1;

  // Vignette
  float vignette = 1.0 - smoothstep(0.3, 0.9, length(vUv - 0.5));
  video.rgb *= vignette;

  // Crossfade alpha
  video.a = uFade;

  gl_FragColor = video;
}
`

interface DreamMaterialProps {
  videoTexture: THREE.Texture | null
  hueOffset: number
  warpSpeed: number
  fade: number
  useAdditiveBlend?: boolean
}

export function DreamMaterial({
  videoTexture,
  hueOffset,
  warpSpeed,
  fade,
  useAdditiveBlend = false,
}: DreamMaterialProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uVideoTex: { value: null as THREE.Texture | null },
      uTime: { value: 0 },
      uFade: { value: 0 },
      uHueOffset: { value: hueOffset },
      uWarpSpeed: { value: warpSpeed },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uEnergy: { value: 0 },
      uKaleidoscope: { value: 0.0 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useEffect(() => {
    if (matRef.current) {
      matRef.current.uniforms.uVideoTex.value = videoTexture
    }
  }, [videoTexture])

  useFrame(({ clock }) => {
    if (!matRef.current) return
    const u = matRef.current.uniforms

    u.uTime.value = clock.elapsedTime
    u.uFade.value = fade
    u.uHueOffset.value = hueOffset
    u.uWarpSpeed.value = warpSpeed

    if (audioAnalyserActive) {
      u.uBass.value = audioBass
      u.uMid.value = audioMid
      u.uHigh.value = audioHigh
      u.uEnergy.value = audioEnergy
    } else {
      // Slow ambient distortion when no audio (don't decay to zero)
      const t = clock.elapsedTime
      u.uBass.value = 0.15 + Math.sin(t * 0.3) * 0.1
      u.uMid.value = 0.1 + Math.sin(t * 0.2) * 0.05
      u.uHigh.value = 0.05
      u.uEnergy.value = 0.15 + Math.sin(t * 0.15) * 0.05
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
      blending={useAdditiveBlend ? THREE.AdditiveBlending : THREE.NormalBlending}
      depthWrite={false}
      depthTest={false}
    />
  )
}
