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
uniform float uWaxSmooth;
uniform float uWaxSpecular;
uniform float uWaxRim;
uniform float uSmearStrength;
uniform vec2 uResolution;
uniform float uSaturation;
uniform float uHueSpeed;
uniform float uVignetteSize;

// Toggle flags (0.0 or 1.0)
uniform float uEnableChroma;
uniform float uEnableZoomPulse;
uniform float uEnableRotation;
uniform float uEnableStretch;
uniform float uEnableUvWarp;
uniform float uEnableSmear;
uniform float uEnableWax;
uniform float uEnableHue;
uniform float uEnableGrain;
uniform float uEnableVignette;

// Datamosh
uniform float uDatamosh;
uniform float uDatamoshBlock;

// Transition type: 0 = melt, 1 = datamosh
uniform float uTransitionType;

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

// ── Datamosh effect ─────────────────────────────────────────────────
vec4 datamoshSample(sampler2D tex, vec2 uv, float intensity, float blockPx) {
  vec2 blockSize = vec2(blockPx) / uResolution;
  vec2 blockUV = floor(uv / blockSize) * blockSize + blockSize * 0.5;

  // Motion vector approximation from luminance gradient at block center
  vec2 blockGrad = getGrad(tex, blockUV, blockSize.x);

  // Directional smear along "motion vectors"
  vec2 smearOffset = blockGrad.yx * vec2(1.0, -1.0) * intensity * blockSize * 25.0;

  // Some blocks glitch harder — use time-varying hash for temporal variation
  float blockNoise = hash(blockUV * 97.0 + floor(uTime * 2.0) * 0.1);

  vec2 sampleUV = uv;
  if (blockNoise > 0.6) {
    // Hard glitch: displace entire block
    sampleUV = blockUV + smearOffset * 2.0;
  } else if (blockNoise > 0.3) {
    // Moderate smear
    sampleUV = uv + smearOffset;
  }
  // else: clean block (no displacement)

  return texture2D(tex, sampleUV);
}

// ── Main ────────────────────────────────────────────────────────────
void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / uResolution;

  // 1. Anamorphic stretch — slow breathing
  if (uEnableStretch > 0.5) {
    uv = (uv - 0.5) * uStretch + 0.5;
  }

  // 2. Slow rotation
  if (uEnableRotation > 0.5) {
    uv = rotateUV(uv, uRotation);
  }

  // 3. Zoom pulse (bass-reactive breathing)
  if (uEnableZoomPulse > 0.5) {
    vec2 centered = uv - 0.5;
    centered *= 1.0 - uZoomPulse * 0.08;
    uv = centered + 0.5;
  }

  // 4. UV warp (bass-reactive sinusoidal)
  if (uEnableUvWarp > 0.5) {
    float warpAmp = 0.02 + uBass * 0.04;
    uv.x += sin(uv.y * 2.0 + uTime * 0.2) * warpAmp;
    uv.y += cos(uv.x * 2.0 + uTime * 0.14) * warpAmp;
  }

  // 5. Gradient smear displacement (melting wax effect)
  if (uEnableSmear > 0.5 && uSmearStrength > 0.001) {
    vec2 grad = getGrad(uVideoTex, uv, texel.x * 2.0);
    uv += grad.yx * vec2(1.0, -1.0) * uSmearStrength * texel.x * 300.0;
    uv += grad * uSmearStrength * texel.x * 150.0 * (0.5 + uBass * 0.5);
  }

  // 6. Datamosh (continuous, independent of transitions)
  if (uDatamosh > 0.001) {
    vec2 blockSize = vec2(uDatamoshBlock) / uResolution;
    vec2 blockUV = floor(uv / blockSize) * blockSize + blockSize * 0.5;
    vec2 blockGrad = getGrad(uVideoTex, blockUV, blockSize.x);
    vec2 smearOffset = blockGrad.yx * vec2(1.0, -1.0) * uDatamosh * blockSize * 25.0;
    float blockNoise = hash(blockUV * 97.0 + floor(uTime * 2.0) * 0.1);
    if (blockNoise > 0.6) {
      uv = blockUV + smearOffset * 2.0;
    } else if (blockNoise > 0.3) {
      uv += smearOffset;
    }
  }

  // 7. Sample with chromatic aberration
  vec4 video;
  vec2 caDir = normalize(uv - 0.5 + 0.001);
  float caAmount = (uEnableChroma > 0.5)
    ? uChromaAberration * (0.002 + uBass * 0.005)
    : 0.0;

  bool inTransition = uTransition > 0.001 && uTransition < 0.999;

  if (inTransition) {
    if (uTransitionType > 0.5) {
      // ── Datamosh transition ──
      vec2 blockSize = vec2(uDatamoshBlock) / uResolution;
      vec2 blockUV = floor(uv / blockSize) * blockSize + blockSize * 0.5;

      // Block-level decision: show old or new based on transition progress
      float blockHash = hash(blockUV * 50.0 + floor(uTime * 3.0) * 0.1);

      // Smear direction from outgoing video
      vec2 smearDir = getGrad(uPrevVideoTex, blockUV, blockSize.x);
      vec2 smearOffset = smearDir.yx * vec2(1.0, -1.0) * (1.0 - uTransition) * blockSize * 35.0;

      // Progressive reveal: more blocks switch to new video as transition advances
      float threshold = uTransition * 1.2 - 0.1; // slight bias for snappier start

      vec4 prevColor, currColor;

      if (blockHash < threshold) {
        // Show new video (possibly with some residual smear at edges)
        float edgeFade = smoothstep(threshold - 0.15, threshold, blockHash);
        vec2 revealOffset = smearOffset * (1.0 - edgeFade) * 0.3;
        currColor = texture2D(uVideoTex, uv + revealOffset);
        video = currColor;
      } else {
        // Show smeared old video
        prevColor = texture2D(uPrevVideoTex, uv + smearOffset);
        video = prevColor;
      }

      // Add chromatic aberration
      if (caAmount > 0.0) {
        float rv = video.r;
        video.r = texture2D(uVideoTex, uv + caDir * caAmount).r * step(threshold, 0.001 + blockHash)
                + texture2D(uPrevVideoTex, uv + smearOffset + caDir * caAmount).r * step(blockHash, threshold);
      }
    } else {
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
    }
  } else {
    // No transition — normal sampling
    float rv = texture2D(uVideoTex, uv + caDir * caAmount).r;
    float gv = texture2D(uVideoTex, uv).g;
    float bv = texture2D(uVideoTex, uv - caDir * caAmount).b;
    video = vec4(rv, gv, bv, 1.0);
  }

  // 8. Waxy lighting — plastic/claymation look
  if (uEnableWax > 0.5) {
    vec3 smoothed = smoothSample(uVideoTex, uv, uWaxSmooth);
    video.rgb = mix(video.rgb, smoothed, 0.4);

    // Saturation
    float luma = getLuma(video.rgb);
    video.rgb = mix(vec3(luma), video.rgb, uSaturation);

    // Surface normal from luminance gradient
    vec3 normal = getWaxNormal(uVideoTex, uv, 3.0);

    vec3 lightDir = normalize(vec3(1.0, 1.0, 2.0));
    vec3 viewDir = vec3(0.0, 0.0, 1.0);

    // Diffuse (half-lambert)
    float NdotL = dot(normal, lightDir);
    float diff = pow(NdotL * 0.5 + 0.5, 0.8);

    // Specular (Blinn-Phong)
    vec3 halfDir = normalize(lightDir + viewDir);
    float NdotH = max(0.0, dot(normal, halfDir));
    float spec = pow(NdotH, 12.0) * uWaxSpecular;

    // Rim lighting
    float NdotV = max(0.0, dot(normal, viewDir));
    float rim = pow(1.0 - NdotV, 2.5) * uWaxRim;

    vec3 ambient = video.rgb * 0.3;
    vec3 diffuse = video.rgb * diff * 0.75;
    vec3 specular = vec3(1.0, 0.98, 0.95) * spec;
    vec3 rimColor = video.rgb * 1.3 * rim;

    video.rgb = ambient + diffuse + specular + rimColor;
  }

  // 9. Hue rotation
  if (uEnableHue > 0.5) {
    vec3 hsv = rgb2hsv(video.rgb);
    hsv.x = fract(hsv.x + uTime * uHueSpeed + uMid * 0.2);
    video.rgb = hsv2rgb(hsv);
  }

  // 10. Energy brightness pulse
  video.rgb *= 0.85 + uEnergy * 0.3;

  // 11. Film grain
  if (uEnableGrain > 0.5) {
    float grain = (fract(sin(dot(vUv + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
    video.rgb += grain * uHigh * 0.08;
  }

  // 12. Vignette
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
      uWaxSmooth: { value: 1.5 },
      uWaxSpecular: { value: 0.5 },
      uWaxRim: { value: 0.35 },
      uSmearStrength: { value: 0.4 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uSaturation: { value: 1.3 },
      uHueSpeed: { value: 0.03 },
      uVignetteSize: { value: 0.3 },
      // Toggle flags
      uEnableChroma: { value: 1.0 },
      uEnableZoomPulse: { value: 1.0 },
      uEnableRotation: { value: 1.0 },
      uEnableStretch: { value: 1.0 },
      uEnableUvWarp: { value: 1.0 },
      uEnableSmear: { value: 1.0 },
      uEnableWax: { value: 1.0 },
      uEnableHue: { value: 1.0 },
      uEnableGrain: { value: 1.0 },
      uEnableVignette: { value: 1.0 },
      // Datamosh
      uDatamosh: { value: 0.0 },
      uDatamoshBlock: { value: 16.0 },
      // Transition type
      uTransitionType: { value: 0.0 },
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

    // Read debug store (non-reactive, read in frame loop)
    const dbg = useDreamDebugStore.getState()

    // Toggle flags
    u.uEnableChroma.value = dbg.chromaAberration ? 1.0 : 0.0
    u.uEnableZoomPulse.value = dbg.zoomPulse ? 1.0 : 0.0
    u.uEnableRotation.value = dbg.rotation ? 1.0 : 0.0
    u.uEnableStretch.value = dbg.stretch ? 1.0 : 0.0
    u.uEnableUvWarp.value = dbg.uvWarp ? 1.0 : 0.0
    u.uEnableSmear.value = dbg.smear ? 1.0 : 0.0
    u.uEnableWax.value = dbg.waxLighting ? 1.0 : 0.0
    u.uEnableHue.value = dbg.hueRotation ? 1.0 : 0.0
    u.uEnableGrain.value = dbg.filmGrain ? 1.0 : 0.0
    u.uEnableVignette.value = dbg.vignette ? 1.0 : 0.0

    // Debug-controlled values
    u.uWaxSmooth.value = dbg.waxSmooth
    u.uSaturation.value = dbg.saturation
    u.uHueSpeed.value = dbg.hueSpeed
    u.uVignetteSize.value = dbg.vignetteSize
    u.uDatamoshBlock.value = dbg.datamoshBlockSize
    u.uTransitionType.value = dbg.transitionType === 'datamosh' ? 1.0 : 0.0

    // Datamosh (continuous effect, independent of transition)
    u.uDatamosh.value = dbg.datamoshEnabled ? dbg.datamoshIntensity : 0.0

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

    // Smear strength — gently varies with bass, scaled by debug value
    u.uSmearStrength.value = dbg.smearStrength * (
      audioAnalyserActive
        ? 0.75 + audioBass * 1.0
        : 0.75 + Math.sin(t * 0.2) * 0.25
    )

    // Wax lighting — pulse specular/rim with energy
    u.uWaxSpecular.value = dbg.waxSpecular * (
      audioAnalyserActive
        ? 0.8 + audioEnergy * 0.8
        : 0.8 + Math.sin(t * 0.15) * 0.2
    )
    u.uWaxRim.value = dbg.waxRim * (
      audioAnalyserActive
        ? 0.85 + audioEnergy * 0.6
        : 0.85 + Math.sin(t * 0.12) * 0.15
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
