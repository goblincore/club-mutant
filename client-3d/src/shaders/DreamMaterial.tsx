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
import { useDreamDebugStore } from '../stores/dreamDebugStore'

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
uniform vec2 uResolution;
uniform float uSaturation;
uniform float uHueSpeed;
uniform float uVignetteSize;
uniform float uLiquidAmount;
uniform float uFisheye;

// Toggle flags (0.0 or 1.0)
uniform float uEnableChroma;
uniform float uEnableZoomPulse;
uniform float uEnableRotation;
uniform float uEnableStretch;
uniform float uEnableLiquid;
uniform float uEnableFisheye;
uniform float uEnableHue;
uniform float uEnableGrain;
uniform float uEnableVignette;

// Blend mode: 0=none, 1=difference, 2=multiply, 3=screen, 4=overlay, 5=add
uniform float uBlendMode;
uniform float uBlendOpacity;

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

// ── Barrel distortion (fisheye) ─────────────────────────────────────
vec2 fisheyeUV(vec2 uv, float strength) {
  vec2 centered = uv - 0.5;
  float r = length(centered);
  float bind = 0.5; // radius of the image
  // Barrel distortion formula
  float rd = r * (1.0 + strength * r * r);
  vec2 result = centered * (rd / max(r, 0.0001)) + 0.5;
  return result;
}

// ── Blend modes ─────────────────────────────────────────────────────
vec3 blendDifference(vec3 a, vec3 b) { return abs(a - b); }
vec3 blendMultiply(vec3 a, vec3 b) { return a * b; }
vec3 blendScreen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }
vec3 blendOverlay(vec3 a, vec3 b) {
  return vec3(
    a.r < 0.5 ? 2.0 * a.r * b.r : 1.0 - 2.0 * (1.0 - a.r) * (1.0 - b.r),
    a.g < 0.5 ? 2.0 * a.g * b.g : 1.0 - 2.0 * (1.0 - a.g) * (1.0 - b.g),
    a.b < 0.5 ? 2.0 * a.b * b.b : 1.0 - 2.0 * (1.0 - a.b) * (1.0 - b.b)
  );
}
vec3 blendAdd(vec3 a, vec3 b) { return min(a + b, vec3(1.0)); }

vec3 applyBlend(vec3 base, vec3 blend, float mode) {
  if (mode < 0.5) return base;             // none
  if (mode < 1.5) return blendDifference(base, blend);
  if (mode < 2.5) return blendMultiply(base, blend);
  if (mode < 3.5) return blendScreen(base, blend);
  if (mode < 4.5) return blendOverlay(base, blend);
  return blendAdd(base, blend);             // add
}

// ── Main ────────────────────────────────────────────────────────────
void main() {
  vec2 uv = vUv;

  // 1. Fisheye barrel distortion
  if (uEnableFisheye > 0.5) {
    uv = fisheyeUV(uv, uFisheye);
  }

  // 2. Anamorphic stretch — slow breathing
  if (uEnableStretch > 0.5) {
    uv = (uv - 0.5) * uStretch + 0.5;
  }

  // 3. Slow rotation
  if (uEnableRotation > 0.5) {
    uv = rotateUV(uv, uRotation);
  }

  // 4. Zoom pulse (bass-reactive breathing)
  if (uEnableZoomPulse > 0.5) {
    vec2 centered = uv - 0.5;
    centered *= 1.0 - uZoomPulse * 0.08;
    uv = centered + 0.5;
  }

  // 5. Liquid domain warp — organic flowing distortion
  if (uEnableLiquid > 0.5 && uLiquidAmount > 0.001) {
    // Domain warping: warp the noise coordinates with noise itself
    float n1 = fbm(uv * 3.0 + uTime * 0.08);
    float n2 = fbm(uv * 3.0 + n1 * 0.8 + vec2(5.2, 1.3) + uTime * 0.06);
    float n3 = fbm(uv * 3.0 + n2 * 0.8 + vec2(1.7, 9.2) + uTime * 0.04);

    // Audio-reactive liquid intensity
    float liquidStr = uLiquidAmount * (1.0 + uBass * 1.5);

    uv += vec2(n2 - 0.5, n3 - 0.5) * liquidStr;

    // Extra sinusoidal waves for more visible waviness
    uv.x += sin(uv.y * 6.0 + uTime * 0.3 + n1 * 3.0) * liquidStr * 0.5;
    uv.y += cos(uv.x * 5.0 + uTime * 0.25 + n2 * 3.0) * liquidStr * 0.5;
  }

  // 6. Sample with chromatic aberration
  vec4 video;
  vec2 caDir = normalize(uv - 0.5 + 0.001);
  float caAmount = (uEnableChroma > 0.5)
    ? uChromaAberration * (0.002 + uBass * 0.005)
    : 0.0;

  bool inTransition = uTransition > 0.001 && uTransition < 0.999;

  if (inTransition) {
    // ── Melt transition (FBM noise dissolve) ──
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

    // Apply blend mode between prev and current during transition
    if (uBlendMode > 0.5 && uBlendOpacity > 0.001) {
      vec3 blended = applyBlend(currColor.rgb, prevColor.rgb, uBlendMode);
      float transBlend = sin(uTransition * 3.14159) * uBlendOpacity; // peaks at midpoint
      video.rgb = mix(video.rgb, blended, transBlend);
    }
  } else {
    // No transition — normal sampling
    float rv = texture2D(uVideoTex, uv + caDir * caAmount).r;
    float gv = texture2D(uVideoTex, uv).g;
    float bv = texture2D(uVideoTex, uv - caDir * caAmount).b;
    video = vec4(rv, gv, bv, 1.0);

    // Continuous blend with prev video if still available
    if (uBlendMode > 0.5 && uBlendOpacity > 0.001) {
      vec3 prevSample = texture2D(uPrevVideoTex, uv).rgb;
      // Only blend if prev texture has content (non-black)
      float prevLuma = dot(prevSample, vec3(0.3, 0.6, 0.1));
      if (prevLuma > 0.01) {
        vec3 blended = applyBlend(video.rgb, prevSample, uBlendMode);
        video.rgb = mix(video.rgb, blended, uBlendOpacity);
      }
    }
  }

  // 7. Saturation
  float luma = dot(video.rgb, vec3(0.299, 0.587, 0.114));
  video.rgb = mix(vec3(luma), video.rgb, uSaturation);

  // 8. Hue rotation
  if (uEnableHue > 0.5) {
    vec3 hsv = rgb2hsv(video.rgb);
    hsv.x = fract(hsv.x + uTime * uHueSpeed + uMid * 0.2);
    video.rgb = hsv2rgb(hsv);
  }

  // 9. Energy brightness pulse
  video.rgb *= 0.85 + uEnergy * 0.3;

  // 10. Film grain
  if (uEnableGrain > 0.5) {
    float grain = (fract(sin(dot(vUv + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
    video.rgb += grain * uHigh * 0.08;
  }

  // 11. Vignette
  if (uEnableVignette > 0.5) {
    float vignette = 1.0 - smoothstep(uVignetteSize, 0.9, length(vUv - 0.5));
    video.rgb *= vignette;
  }

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
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uSaturation: { value: 1.3 },
      uHueSpeed: { value: 0.03 },
      uVignetteSize: { value: 0.3 },
      uLiquidAmount: { value: 0.06 },
      uFisheye: { value: 0.8 },
      // Toggle flags
      uEnableChroma: { value: 1.0 },
      uEnableZoomPulse: { value: 1.0 },
      uEnableRotation: { value: 1.0 },
      uEnableStretch: { value: 1.0 },
      uEnableLiquid: { value: 1.0 },
      uEnableFisheye: { value: 1.0 },
      uEnableHue: { value: 1.0 },
      uEnableGrain: { value: 1.0 },
      uEnableVignette: { value: 1.0 },
      // Blend mode
      uBlendMode: { value: 1.0 },
      uBlendOpacity: { value: 0.3 },
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

    // Read debug store
    const dbg = useDreamDebugStore.getState()

    // Toggle flags
    u.uEnableChroma.value = dbg.chromaAberration ? 1.0 : 0.0
    u.uEnableZoomPulse.value = dbg.zoomPulse ? 1.0 : 0.0
    u.uEnableRotation.value = dbg.rotation ? 1.0 : 0.0
    u.uEnableStretch.value = dbg.stretch ? 1.0 : 0.0
    u.uEnableLiquid.value = dbg.liquidWarp ? 1.0 : 0.0
    u.uEnableFisheye.value = dbg.fisheye ? 1.0 : 0.0
    u.uEnableHue.value = dbg.hueRotation ? 1.0 : 0.0
    u.uEnableGrain.value = dbg.filmGrain ? 1.0 : 0.0
    u.uEnableVignette.value = dbg.vignette ? 1.0 : 0.0

    // Debug-controlled values
    u.uSaturation.value = dbg.saturation
    u.uHueSpeed.value = dbg.hueSpeed
    u.uVignetteSize.value = dbg.vignetteSize
    u.uLiquidAmount.value = dbg.liquidAmount
    u.uFisheye.value = dbg.fisheyeAmount

    // Blend mode: none=0, difference=1, multiply=2, screen=3, overlay=4, add=5
    const modeMap: Record<string, number> = {
      none: 0, difference: 1, multiply: 2, screen: 3, overlay: 4, add: 5,
    }
    u.uBlendMode.value = modeMap[dbg.blendMode] ?? 0
    u.uBlendOpacity.value = dbg.blendOpacity

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

    // Chromatic aberration — bass-reactive, scaled by debug strength
    u.uChromaAberration.value = dbg.chromaStrength * (
      audioAnalyserActive
        ? 0.3 + audioBass * 0.8
        : 0.2 + Math.sin(t * 0.4) * 0.1
    )

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
