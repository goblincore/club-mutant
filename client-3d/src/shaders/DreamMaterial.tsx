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
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;
uniform float uChromaAberration;
uniform float uZoomPulse;
uniform float uRotation;
uniform vec2 uStretch;
uniform float uTransition;
uniform float uWaxSmooth;
uniform float uWaxSpecular;
uniform float uWaxRim;
uniform float uSmearStrength;
uniform vec2 uResolution;

// ── Noise functions ─────────────────────────────────────────────────
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

// ── Waxy lighting (adapted from WaxyPostFxPipeline) ─────────────────
// Smooth blur for plastic look
vec3 smoothSample(sampler2D tex, vec2 uv, float radius) {
  vec2 texel = 1.0 / uResolution;
  vec3 col = vec3(0.0);
  float total = 0.0;
  for (float x = -2.0; x <= 2.0; x += 1.0) {
    for (float y = -2.0; y <= 2.0; y += 1.0) {
      float weight = 1.0 - length(vec2(x, y)) / 3.0;
      weight = max(0.0, weight);
      col += texture2D(tex, uv + vec2(x, y) * texel * radius).rgb * weight;
      total += weight;
    }
  }
  return col / total;
}

float getLuma(vec3 col) {
  return dot(col, vec3(0.299, 0.587, 0.114));
}

// Compute surface normal from color gradients
vec3 getWaxNormal(sampler2D tex, vec2 uv, float scale) {
  vec2 texel = scale / uResolution;
  float l = getLuma(smoothSample(tex, uv - vec2(texel.x, 0.0), 1.5));
  float r = getLuma(smoothSample(tex, uv + vec2(texel.x, 0.0), 1.5));
  float d = getLuma(smoothSample(tex, uv - vec2(0.0, texel.y), 1.5));
  float u = getLuma(smoothSample(tex, uv + vec2(0.0, texel.y), 1.5));
  return normalize(vec3(l - r, d - u, 0.15));
}

// Gradient-based smear displacement (from melting wax reference)
vec2 getGrad(sampler2D tex, vec2 uv, float eps) {
  vec2 d = vec2(eps, 0.0);
  float l = getLuma(texture2D(tex, uv - d.xy).rgb);
  float r = getLuma(texture2D(tex, uv + d.xy).rgb);
  float dn = getLuma(texture2D(tex, uv - d.yx).rgb);
  float up = getLuma(texture2D(tex, uv + d.yx).rgb);
  return vec2(r - l, up - dn) / eps;
}

// ── Main ────────────────────────────────────────────────────────────
void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / uResolution;

  // 1. Anamorphic stretch — slow breathing
  uv = (uv - 0.5) * uStretch + 0.5;

  // 2. Slow rotation
  uv = rotateUV(uv, uRotation);

  // 3. Zoom pulse (bass-reactive breathing)
  vec2 centered = uv - 0.5;
  centered *= 1.0 - uZoomPulse * 0.08;
  uv = centered + 0.5;

  // 4. UV warp (bass-reactive sinusoidal)
  float warpAmp = 0.02 + uBass * 0.04;
  uv.x += sin(uv.y * 2.0 + uTime * 0.2) * warpAmp;
  uv.y += cos(uv.x * 2.0 + uTime * 0.14) * warpAmp;

  // 5. Gradient smear displacement (melting wax effect)
  vec2 grad = getGrad(uVideoTex, uv, texel.x * 2.0);
  // Smear: displace along gradient perpendicular (normal to gradient = smearing)
  uv += grad.yx * vec2(1.0, -1.0) * uSmearStrength * texel.x * 300.0;
  // Also some diffusion along gradient
  uv += grad * uSmearStrength * texel.x * 150.0 * (0.5 + uBass * 0.5);

  // 6. Sample with chromatic aberration
  vec4 video;
  vec2 caDir = normalize(uv - 0.5 + 0.001);
  float caAmount = uChromaAberration * (0.002 + uBass * 0.005);

  if (uTransition > 0.001 && uTransition < 0.999) {
    // Melting displacement transition
    float noiseVal = fbm(uv * 4.0 + uTime * 0.2);
    float threshold = uTransition;
    float edge = 0.08;

    float dispStrength = 0.12 * (1.0 - abs(uTransition - 0.5) * 2.0);
    vec2 meltOffset = vec2(
      fbm(uv * 3.0 + vec2(uTime * 0.3, 0.0)) - 0.5,
      fbm(uv * 3.0 + vec2(0.0, uTime * 0.3)) - 0.5
    ) * dispStrength;

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

    float blend = smoothstep(threshold - edge, threshold + edge, noiseVal);
    video = mix(prevColor, currColor, blend);

    // Subtle glow at transition boundary
    float edgeGlow = smoothstep(edge, 0.0, abs(noiseVal - threshold));
    video.rgb += edgeGlow * vec3(0.2, 0.08, 0.35) * 0.4;
  } else {
    float rv = texture2D(uVideoTex, uv + caDir * caAmount).r;
    float gv = texture2D(uVideoTex, uv).g;
    float bv = texture2D(uVideoTex, uv - caDir * caAmount).b;
    video = vec4(rv, gv, bv, 1.0);
  }

  // 7. Waxy lighting — plastic/claymation look
  // Smooth the base color
  vec3 smoothed = smoothSample(uVideoTex, uv, uWaxSmooth);
  // Blend smoothed into video for plastic surface
  video.rgb = mix(video.rgb, smoothed, 0.4);

  // Boost saturation slightly
  float luma = getLuma(video.rgb);
  video.rgb = mix(vec3(luma), video.rgb, 1.3);

  // Compute surface normal from luminance gradient
  vec3 normal = getWaxNormal(uVideoTex, uv, 3.0);

  // Lighting
  vec3 lightDir = normalize(vec3(1.0, 1.0, 2.0));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);

  // Diffuse (half-lambert for soft wrap)
  float NdotL = dot(normal, lightDir);
  float diff = pow(NdotL * 0.5 + 0.5, 0.8);

  // Specular (Blinn-Phong)
  vec3 halfDir = normalize(lightDir + viewDir);
  float NdotH = max(0.0, dot(normal, halfDir));
  float spec = pow(NdotH, 12.0) * uWaxSpecular;

  // Rim lighting
  float NdotV = max(0.0, dot(normal, viewDir));
  float rim = pow(1.0 - NdotV, 2.5) * uWaxRim;

  // Combine
  vec3 ambient = video.rgb * 0.3;
  vec3 diffuse = video.rgb * diff * 0.75;
  vec3 specular = vec3(1.0, 0.98, 0.95) * spec;
  vec3 rimColor = video.rgb * 1.3 * rim;

  video.rgb = ambient + diffuse + specular + rimColor;

  // 8. Hue rotation — slow drift + mid-frequency influence
  vec3 hsv = rgb2hsv(video.rgb);
  hsv.x = fract(hsv.x + uTime * 0.03 + uMid * 0.2);
  video.rgb = hsv2rgb(hsv);

  // 9. Energy brightness pulse
  video.rgb *= 0.85 + uEnergy * 0.3;

  // 10. Film grain
  float grain = (fract(sin(dot(vUv + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
  video.rgb += grain * uHigh * 0.08;

  // 11. Vignette
  float vignette = 1.0 - smoothstep(0.3, 0.9, length(vUv - 0.5));
  video.rgb *= vignette;

  // Slight contrast
  video.rgb = pow(video.rgb, vec3(0.95));

  gl_FragColor = vec4(video.rgb, 1.0);
}
`

interface DreamMaterialProps {
  videoTexture: THREE.Texture | null
  prevVideoTexture?: THREE.Texture | null
  transition?: number
}

export function DreamMaterial({
  videoTexture,
  prevVideoTexture = null,
  transition = 1.0,
}: DreamMaterialProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uVideoTex: { value: null as THREE.Texture | null },
      uPrevVideoTex: { value: null as THREE.Texture | null },
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uEnergy: { value: 0 },
      uChromaAberration: { value: 0.3 },
      uZoomPulse: { value: 0.0 },
      uRotation: { value: 0.0 },
      uStretch: { value: new THREE.Vector2(1.0, 1.0) },
      uTransition: { value: 1.0 },
      uWaxSmooth: { value: 1.5 },
      uWaxSpecular: { value: 0.5 },
      uWaxRim: { value: 0.35 },
      uSmearStrength: { value: 0.4 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    }),
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

  useFrame(({ clock, size }) => {
    if (!matRef.current) return
    const u = matRef.current.uniforms
    const t = clock.elapsedTime

    u.uTime.value = t
    u.uTransition.value = transition
    u.uResolution.value.set(size.width, size.height)

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

    // Chromatic aberration — subtle, bass-reactive
    u.uChromaAberration.value = audioAnalyserActive
      ? 0.3 + audioBass * 0.8
      : 0.2 + Math.sin(t * 0.4) * 0.1

    // Zoom pulse — bass transient peak detector
    const bassDelta = currentBass - prevBass
    prevBass = currentBass
    if (bassDelta > 0.05) {
      zoomPulseValue = Math.min(zoomPulseValue + bassDelta * 2.5, 1.0)
    }
    zoomPulseValue *= 0.93
    u.uZoomPulse.value = zoomPulseValue

    // Slow rotation
    u.uRotation.value = Math.sin(t * 0.03) * 0.08

    // Anamorphic stretch — slow breathing
    u.uStretch.value.set(
      1.0 + Math.sin(t * 0.05) * 0.04,
      1.0 + Math.cos(t * 0.04) * 0.03
    )

    // Smear strength — gently varies with bass
    u.uSmearStrength.value = audioAnalyserActive
      ? 0.3 + audioBass * 0.4
      : 0.3 + Math.sin(t * 0.2) * 0.1

    // Wax lighting — pulse specular with energy
    u.uWaxSpecular.value = audioAnalyserActive
      ? 0.4 + audioEnergy * 0.4
      : 0.4 + Math.sin(t * 0.15) * 0.1
    u.uWaxRim.value = audioAnalyserActive
      ? 0.3 + audioEnergy * 0.2
      : 0.3 + Math.sin(t * 0.12) * 0.05
  })

  return (
    <shaderMaterial
      ref={matRef}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
      toneMapped={false}
      depthWrite={false}
      depthTest={false}
    />
  )
}
