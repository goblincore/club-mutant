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

// ── Module-level state for bass transient detection ─────────────────────
let prevBass = 0
let zoomPulseValue = 0

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
uniform sampler2D uPrevVideoTex;
uniform float uTime;
uniform float uFade;
uniform float uHueOffset;
uniform float uWarpSpeed;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uKaleidoscope;
uniform float uChromaAberration;
uniform float uZoomPulse;
uniform float uRotation;
uniform float uPixelWave;
uniform float uTransition;
uniform vec2 uStretch;
uniform vec2 uMirror;
uniform float uEdgeGlow;

// ── Noise functions (from DreamGenerativeMaterial) ──────────────────
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

// ── Color conversion ────────────────────────────────────────────────
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

// ── UV transforms ───────────────────────────────────────────────────
vec2 rotateUV(vec2 uv, float angle) {
  vec2 centered = uv - 0.5;
  float c = cos(angle);
  float s = sin(angle);
  return vec2(centered.x * c - centered.y * s, centered.x * s + centered.y * c) + 0.5;
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

// ── Sobel edge detection ────────────────────────────────────────────
vec3 sobelEdge(vec2 uv, sampler2D tex) {
  vec2 texel = vec2(1.0 / 320.0, 1.0 / 240.0);
  float tl = dot(texture2D(tex, uv + vec2(-texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
  float t  = dot(texture2D(tex, uv + vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
  float tr = dot(texture2D(tex, uv + vec2(texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
  float l  = dot(texture2D(tex, uv + vec2(-texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
  float r  = dot(texture2D(tex, uv + vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
  float bl = dot(texture2D(tex, uv + vec2(-texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
  float bo = dot(texture2D(tex, uv + vec2(0.0, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
  float br = dot(texture2D(tex, uv + vec2(texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
  float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
  float gy = -tl - 2.0*t - tr + bl + 2.0*bo + br;
  return vec3(sqrt(gx*gx + gy*gy));
}

// ── Main ────────────────────────────────────────────────────────────
void main() {
  vec2 uv = vUv;

  // 1. Mirror flip
  if (uMirror.x > 0.5) uv.x = 1.0 - uv.x;
  if (uMirror.y > 0.5) uv.y = 1.0 - uv.y;

  // 2. Anamorphic stretch
  uv = (uv - 0.5) * uStretch + 0.5;

  // 3. Slow rotation
  uv = rotateUV(uv, uRotation);

  // 4. Zoom pulse (bass-reactive)
  vec2 centered = uv - 0.5;
  centered *= 1.0 - uZoomPulse * 0.08;
  uv = centered + 0.5;

  // 5. Pixelation wave
  if (uPixelWave > 0.01) {
    float wave = sin((uv.x + uv.y) * 4.0 + uTime * 0.5) * 0.5 + 0.5;
    float pixelSize = mix(1.0, 0.02, wave * uPixelWave);
    if (pixelSize < 0.99) {
      uv = floor(uv / pixelSize) * pixelSize + pixelSize * 0.5;
    }
  }

  // 6. UV warp (existing, bass-reactive)
  uv = warpUV(uv, uTime, uBass);

  // 7. Kaleidoscope
  if (uKaleidoscope > 1.0) {
    uv = kaleidoscope(uv, uKaleidoscope);
  }

  // 8. Texture sample + chromatic aberration
  vec4 video;
  vec2 caDir = normalize(uv - 0.5 + 0.001); // +0.001 avoids zero-length normalize
  float caAmount = uChromaAberration * (0.003 + uBass * 0.008);

  if (uTransition > 0.001 && uTransition < 0.999) {
    // 9. Melting displacement transition
    float noiseVal = fbm(uv * 4.0 + uTime * 0.2);
    float threshold = uTransition;
    float edge = 0.08;

    // Displacement strongest at transition midpoint
    float dispStrength = 0.15 * (1.0 - abs(uTransition - 0.5) * 2.0);
    vec2 meltOffset = vec2(
      fbm(uv * 3.0 + vec2(uTime * 0.3, 0.0)) - 0.5,
      fbm(uv * 3.0 + vec2(0.0, uTime * 0.3)) - 0.5
    ) * dispStrength;

    // Sample both textures with chromatic aberration
    vec2 prevUv = uv + meltOffset;
    vec2 currUv = uv - meltOffset;

    float pr = texture2D(uPrevVideoTex, prevUv + caDir * caAmount).r;
    float pg = texture2D(uPrevVideoTex, prevUv).g;
    float pb = texture2D(uPrevVideoTex, prevUv - caDir * caAmount).b;
    vec4 prevColor = vec4(pr, pg, pb, 1.0);

    float cr = texture2D(uVideoTex, currUv + caDir * caAmount).r;
    float cg = texture2D(uVideoTex, currUv).g;
    float cb = texture2D(uVideoTex, currUv - caDir * caAmount).b;
    vec4 currColor = vec4(cr, cg, cb, 1.0);

    // Organic noise-based blend
    float blend = smoothstep(threshold - edge, threshold + edge, noiseVal);
    video = mix(prevColor, currColor, blend);

    // Purple edge glow at transition boundary
    float edgeGlow = smoothstep(edge, 0.0, abs(noiseVal - threshold));
    video.rgb += edgeGlow * vec3(0.3, 0.1, 0.5) * 0.5;
  } else {
    // Normal single-texture sample with chromatic aberration
    float rv = texture2D(uVideoTex, uv + caDir * caAmount).r;
    float gv = texture2D(uVideoTex, uv).g;
    float bv = texture2D(uVideoTex, uv - caDir * caAmount).b;
    video = vec4(rv, gv, bv, 1.0);
  }

  // 10. Hue rotation — slow drift per layer + mid-frequency influence
  vec3 hsv = rgb2hsv(video.rgb);
  hsv.x = fract(hsv.x + uHueOffset + uTime * 0.05 + uMid * 0.3);
  video.rgb = hsv2rgb(hsv);

  // 11. Energy brightness pulse
  video.rgb *= 0.8 + uEnergy * 0.4;

  // 12. Edge glow (Sobel detection)
  if (uEdgeGlow > 0.01) {
    vec3 edges = sobelEdge(uv, uVideoTex);
    vec3 edgeColor = hsv2rgb(vec3(fract(uTime * 0.1 + uHueOffset), 0.8, 1.0));
    video.rgb += edges * edgeColor * uEdgeGlow;
  }

  // 13. Film grain driven by highs
  float grain = (fract(sin(dot(vUv + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
  video.rgb += grain * uHigh * 0.1;

  // 14. Vignette
  float vignette = 1.0 - smoothstep(0.3, 0.9, length(vUv - 0.5));
  video.rgb *= vignette;

  // 15. Crossfade alpha
  video.a = uFade;

  gl_FragColor = video;
}
`

interface DreamMaterialProps {
  videoTexture: THREE.Texture | null
  prevVideoTexture?: THREE.Texture | null
  transition?: number
  hueOffset: number
  warpSpeed: number
  fade: number
  useAdditiveBlend?: boolean
}

export function DreamMaterial({
  videoTexture,
  prevVideoTexture = null,
  transition = 1.0,
  hueOffset,
  warpSpeed,
  fade,
  useAdditiveBlend = false,
}: DreamMaterialProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uVideoTex: { value: null as THREE.Texture | null },
      uPrevVideoTex: { value: null as THREE.Texture | null },
      uTime: { value: 0 },
      uFade: { value: 0 },
      uHueOffset: { value: hueOffset },
      uWarpSpeed: { value: warpSpeed },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uEnergy: { value: 0 },
      uKaleidoscope: { value: 0.0 },
      uChromaAberration: { value: 0.3 },
      uZoomPulse: { value: 0.0 },
      uRotation: { value: 0.0 },
      uPixelWave: { value: 0.0 },
      uTransition: { value: 1.0 },
      uStretch: { value: new THREE.Vector2(1.0, 1.0) },
      uMirror: { value: new THREE.Vector2(0.0, 0.0) },
      uEdgeGlow: { value: 0.0 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useEffect(() => {
    if (matRef.current) {
      matRef.current.uniforms.uVideoTex.value = videoTexture
    }
  }, [videoTexture])

  useEffect(() => {
    if (matRef.current) {
      matRef.current.uniforms.uPrevVideoTex.value = prevVideoTexture
    }
  }, [prevVideoTexture])

  useFrame(({ clock }) => {
    if (!matRef.current) return
    const u = matRef.current.uniforms
    const t = clock.elapsedTime

    u.uTime.value = t
    u.uFade.value = fade
    u.uHueOffset.value = hueOffset
    u.uWarpSpeed.value = warpSpeed
    u.uTransition.value = transition

    // Audio values
    const currentBass = audioAnalyserActive ? audioBass : 0.15 + Math.sin(t * 0.3) * 0.1
    if (audioAnalyserActive) {
      u.uBass.value = audioBass
      u.uMid.value = audioMid
      u.uHigh.value = audioHigh
      u.uEnergy.value = audioEnergy
    } else {
      u.uBass.value = currentBass
      u.uMid.value = 0.1 + Math.sin(t * 0.2) * 0.05
      u.uHigh.value = 0.05
      u.uEnergy.value = 0.15 + Math.sin(t * 0.15) * 0.05
    }

    // Chromatic aberration — bass-reactive
    u.uChromaAberration.value = audioAnalyserActive
      ? 0.5 + audioBass * 1.5
      : 0.3 + Math.sin(t * 0.4) * 0.2

    // Zoom pulse — bass transient peak detector
    const bassDelta = currentBass - prevBass
    prevBass = currentBass
    if (bassDelta > 0.05) {
      zoomPulseValue = Math.min(zoomPulseValue + bassDelta * 3.0, 1.0)
    }
    zoomPulseValue *= 0.92
    u.uZoomPulse.value = zoomPulseValue

    // Slow rotation — per-layer offset via hueOffset
    u.uRotation.value = Math.sin(t * 0.04 + hueOffset * 6.28) * 0.12

    // Kaleidoscope — activate during high energy moments
    const kaleidoTarget = (audioAnalyserActive ? audioEnergy : u.uEnergy.value) > 0.4 ? 6.0 : 0.0
    u.uKaleidoscope.value += (kaleidoTarget - u.uKaleidoscope.value) * 0.03

    // Pixelation waves — mid-reactive
    u.uPixelWave.value = audioAnalyserActive
      ? audioMid * 0.6
      : 0.1 + Math.sin(t * 0.2) * 0.08

    // Anamorphic stretch — slow breathing
    u.uStretch.value.set(
      1.0 + Math.sin(t * 0.07) * 0.06,
      1.0 + Math.cos(t * 0.05) * 0.04
    )

    // Mirror flips — slow sine toggles, phase-offset per layer
    u.uMirror.value.set(
      Math.sin(t * 0.08 + hueOffset * 3.0) > 0.3 ? 1.0 : 0.0,
      Math.sin(t * 0.06 + hueOffset * 5.0) > 0.5 ? 1.0 : 0.0,
    )

    // Edge glow — energy-reactive
    u.uEdgeGlow.value = audioAnalyserActive
      ? audioEnergy * 0.8
      : 0.15 + Math.sin(t * 0.25) * 0.1
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
