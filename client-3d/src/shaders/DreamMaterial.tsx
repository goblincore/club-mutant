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

// VHS
uniform float uEnableVhs;
uniform float uVhsStrength;

// Scanlines (moire)
uniform float uEnableScanlines;
uniform float uScanlineCount;
uniform float uScanlineThickness;
uniform float uScanlineIntensity;
uniform float uScanlineScrollSpeed;

// Glitch
uniform float uEnableInterference;
uniform float uInterferenceIntensity;
uniform float uEnableGhosting;
uniform float uGhostIntensity;
uniform float uEnableDropout;
uniform float uDropoutIntensity;

#define PI 3.14159265359
#define SCALE(a) (uResolution.y / 450.0) * (a)

// ── Noise functions ─────────────────────────────────────────────────
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float GoldNoise(vec2 xy, float seed) {
  return fract(sin(dot(xy * seed, vec2(12.9898, 78.233))) * 43758.5453);
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

vec2 fisheyeUV(vec2 uv, float strength) {
  vec2 centered = uv - 0.5;
  float r = length(centered);
  float rd = r * (1.0 + strength * r * r);
  return centered * (rd / max(r, 0.0001)) + 0.5;
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
  if (mode < 0.5) return base;
  if (mode < 1.5) return blendDifference(base, blend);
  if (mode < 2.5) return blendMultiply(base, blend);
  if (mode < 3.5) return blendScreen(base, blend);
  if (mode < 4.5) return blendOverlay(base, blend);
  return blendAdd(base, blend);
}

// ── VHS helpers (ported from VhsPostFxPipeline) ─────────────────────
float BlendSoftLight(float base, float blend) {
  return (blend < 0.5)
    ? (2.0 * base * blend + base * base * (1.0 - 2.0 * blend))
    : (sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend));
}

vec3 BlendSoftLightV(vec3 base, vec3 blend) {
  return vec3(
    BlendSoftLight(base.r, blend.r),
    BlendSoftLight(base.g, blend.g),
    BlendSoftLight(base.b, blend.b)
  );
}

// ── Main ────────────────────────────────────────────────────────────
void main() {
  vec2 uv = vUv;
  vec2 fragCoord = vUv * uResolution;

  // 1. Fisheye barrel distortion
  if (uEnableFisheye > 0.5) {
    uv = fisheyeUV(uv, uFisheye);
  }

  // 2. Anamorphic stretch
  if (uEnableStretch > 0.5) {
    uv = (uv - 0.5) * uStretch + 0.5;
  }

  // 3. Slow rotation
  if (uEnableRotation > 0.5) {
    uv = rotateUV(uv, uRotation);
  }

  // 4. Zoom pulse
  if (uEnableZoomPulse > 0.5) {
    vec2 centered = uv - 0.5;
    centered *= 1.0 - uZoomPulse * 0.08;
    uv = centered + 0.5;
  }

  // 5. Liquid domain warp
  if (uEnableLiquid > 0.5 && uLiquidAmount > 0.001) {
    float n1 = fbm(uv * 3.0 + uTime * 0.08);
    float n2 = fbm(uv * 3.0 + n1 * 0.8 + vec2(5.2, 1.3) + uTime * 0.06);
    float n3 = fbm(uv * 3.0 + n2 * 0.8 + vec2(1.7, 9.2) + uTime * 0.04);
    float liquidStr = uLiquidAmount * (1.0 + uBass * 1.5);
    uv += vec2(n2 - 0.5, n3 - 0.5) * liquidStr;
    uv.x += sin(uv.y * 6.0 + uTime * 0.3 + n1 * 3.0) * liquidStr * 0.5;
    uv.y += cos(uv.x * 5.0 + uTime * 0.25 + n2 * 3.0) * liquidStr * 0.5;
  }

  // 6. VHS UV distortions (tracking bar + wave wobble)
  if (uEnableVhs > 0.5) {
    // Tracking: moving horizontal bar shifts pixels right
    float trackSpeed = 8.0;
    float trackT = 1.0 - mod(uTime, trackSpeed) / trackSpeed;
    float trackY = mod(trackT * uResolution.y, uResolution.y);
    float trackJitter = GoldNoise(vec2(5000.0, 5000.0), 10.0 + fract(uTime)) * SCALE(20.0);
    trackY += trackJitter;
    if (fragCoord.y > trackY) {
      uv.x += SCALE(8.0) / uResolution.x * uVhsStrength;
    }

    // Wave: per-scanline horizontal wobble
    float waveFreq = 18.0;
    float phaseNum = floor(fragCoord.y / (uResolution.y / waveFreq));
    float waveNoise = GoldNoise(vec2(1.0 + phaseNum, phaseNum), 10.0);
    float waveOffset = sin((uv.y + fract(uTime * 0.05)) * PI * 2.0 * waveFreq)
                       * (SCALE(0.8) * waveNoise / uResolution.x);
    uv.x += waveOffset * uVhsStrength;

    // Bottom warp: distortion at bottom edge
    float warpHeight = SCALE(15.0) / uResolution.y;
    if (uv.y < warpHeight) {
      float t = uv.y / warpHeight;
      float warpOffset = t * (SCALE(100.0) / uResolution.x);
      float warpJitter = (GoldNoise(vec2(500.0, 500.0), fract(uTime)) * SCALE(50.0)) / uResolution.x;
      uv.x -= (warpOffset + warpJitter) * uVhsStrength;
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
    // Melt transition (FBM noise dissolve)
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

    float edgeGlow = smoothstep(edge, 0.0, abs(noiseVal - threshold));
    video.rgb += edgeGlow * vec3(0.2, 0.08, 0.35) * 0.4;

    // Blend mode during transition
    if (uBlendMode > 0.5 && uBlendOpacity > 0.001) {
      vec3 blended = applyBlend(currColor.rgb, prevColor.rgb, uBlendMode);
      float transBlend = sin(uTransition * PI) * uBlendOpacity;
      video.rgb = mix(video.rgb, blended, transBlend);
    }
  } else {
    // Normal sampling
    float rv = texture2D(uVideoTex, uv + caDir * caAmount).r;
    float gv = texture2D(uVideoTex, uv).g;
    float bv = texture2D(uVideoTex, uv - caDir * caAmount).b;
    video = vec4(rv, gv, bv, 1.0);

    // Continuous blend with prev video
    if (uBlendMode > 0.5 && uBlendOpacity > 0.001) {
      vec3 prevSample = texture2D(uPrevVideoTex, uv).rgb;
      float prevLuma = dot(prevSample, vec3(0.3, 0.6, 0.1));
      if (prevLuma > 0.01) {
        vec3 blended = applyBlend(video.rgb, prevSample, uBlendMode);
        video.rgb = mix(video.rgb, blended, uBlendOpacity);
      }
    }
  }

  // 7b. Frame ghosting (temporal echo with offset samples)
  if (uEnableGhosting > 0.5) {
    vec2 g1 = uv + vec2(sin(uTime * 0.5) * 0.02, cos(uTime * 0.3) * 0.02);
    vec2 g2 = uv + vec2(sin(uTime * 0.7) * 0.03, cos(uTime * 0.5) * 0.015);
    vec2 g3 = uv + vec2(sin(uTime * 0.9) * 0.025, cos(uTime * 0.7) * 0.02);
    vec3 ghostMix = (texture2D(uVideoTex, g1).rgb + texture2D(uVideoTex, g2).rgb + texture2D(uVideoTex, g3).rgb) / 3.0;
    video.rgb = mix(video.rgb, ghostMix, uGhostIntensity);
  }

  // 8. VHS color processing
  if (uEnableVhs > 0.5) {
    // Shadow tint (greenish tint in dark areas — classic VHS look)
    float luma = dot(video.rgb, vec3(0.2126, 0.7152, 0.0722));
    float darkness = pow(1.0 - luma, 1.5);
    video.rgb += vec3(0.0, 0.035, 0.01) * darkness * uVhsStrength;

    // Slight VHS desaturation
    video.rgb = mix(vec3(luma), video.rgb, mix(1.0, 0.75, uVhsStrength));

    // Clamp levels (crush blacks, clip whites)
    video.rgb = mix(video.rgb, vec3(0.0), 0.1 * uVhsStrength);
    video.rgb = mix(video.rgb, vec3(1.0), 0.1 * uVhsStrength);
    video.rgb = clamp(video.rgb, 0.0, 1.0);
  }

  // 9. Saturation
  float satLuma = dot(video.rgb, vec3(0.299, 0.587, 0.114));
  video.rgb = mix(vec3(satLuma), video.rgb, uSaturation);

  // 10. Hue rotation
  if (uEnableHue > 0.5) {
    vec3 hsv = rgb2hsv(video.rgb);
    hsv.x = fract(hsv.x + uTime * uHueSpeed + uMid * 0.2);
    video.rgb = hsv2rgb(hsv);
  }

  // 11. Energy brightness pulse
  video.rgb *= 0.85 + uEnergy * 0.3;

  // 12. Film grain (VHS-style monochromatic if VHS is on)
  if (uEnableGrain > 0.5) {
    if (uEnableVhs > 0.5) {
      // VHS grain: coarser, monochromatic, SoftLight blended
      float grainSize = SCALE(4.0);
      vec2 grainCoord = vec2(floor(fragCoord.x / grainSize), floor(fragCoord.y / grainSize));
      float seed = floor(fract(uTime) * 30.0) / 30.0 + 1.0;
      float grain = GoldNoise(grainCoord, seed);
      video.rgb = mix(video.rgb, BlendSoftLightV(video.rgb, vec3(grain)), 0.05 * uVhsStrength);
    } else {
      float grain = (fract(sin(dot(vUv + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
      video.rgb += grain * uHigh * 0.08;
    }
  }

  // 13. VHS scanlines + noise bars
  if (uEnableVhs > 0.5) {
    // Scanlines (darken every other line)
    float lineH = SCALE(2.0);
    float scanline = step(lineH, mod(fragCoord.y, lineH * 2.0));
    video.rgb *= 1.0 - scanline * 0.12 * uVhsStrength;

    // White noise scanlines (random flashing horizontal bars)
    float noiseChance = GoldNoise(vec2(600.0, 500.0), fract(uTime) * 10.0);
    if (noiseChance > 0.97) {
      float lineStart = floor(GoldNoise(vec2(800.0, 50.0), fract(uTime)) * uResolution.y);
      float lineEnd = lineStart + SCALE(6.0);
      if (fragCoord.y >= lineStart && fragCoord.y < lineEnd) {
        float freq = GoldNoise(vec2(850.0, 50.0), fract(uTime)) * 3.0 + 1.0;
        float offset = GoldNoise(vec2(900.0, 51.0), fract(uTime));
        float x = fragCoord.x / uResolution.x + offset;
        float white = pow(cos(PI * fract(x * freq) / 2.0), 10.0) * 0.3 * uVhsStrength;
        float grit = GoldNoise(vec2(floor(fragCoord.x / 3.0), 800.0), fract(uTime));
        white = max(white - grit * 0.3, 0.0);
        video.rgb += white;
      }
    }

    // Bottom warp: fade to black at bottom edge
    float warpH = SCALE(15.0) / uResolution.y;
    if (vUv.y < warpH) {
      video.rgb *= vUv.y / warpH;
    }
  }

  // 14. Moire scanlines (sine-wave with thickness — creates moire with pixel grid)
  if (uEnableScanlines > 0.5) {
    float effectiveCount = uScanlineCount > 0.5 ? uScanlineCount : uResolution.y * 0.5;
    float scanUV = vUv.y;
    if (uScanlineScrollSpeed > 0.001) {
      scanUV += uTime * uScanlineScrollSpeed;
    }
    float scanlinePos = scanUV * effectiveCount;
    float scanlinePattern = sin(scanlinePos * PI * 2.0);
    float thickFactor = mix(0.05, 0.95, uScanlineThickness);
    float scanlineMask = smoothstep(-thickFactor, thickFactor, scanlinePattern);
    float minInt = mix(0.8, 0.1, uScanlineIntensity);
    float scanlineEffect = mix(minInt, 1.0, scanlineMask);
    video.rgb *= scanlineEffect;
  }

  // 15. Interference lines (rolling horizontal TV interference)
  if (uEnableInterference > 0.5) {
    float interference = sin((vUv.y + uTime * 2.0) * 100.0);
    video.rgb += vec3(interference * uInterferenceIntensity * 0.15);
  }

  // 16. Signal dropout (random block corruption)
  if (uEnableDropout > 0.5) {
    float dropSize = 0.05;
    vec2 dropBlock = floor(vUv / dropSize);
    float dropNoise = hash(dropBlock + vec2(floor(uTime * 6.0)));
    float thresh = uDropoutIntensity * 0.3;
    if (dropNoise < thresh) {
      if (dropNoise < thresh * 0.33)      video.rgb = vec3(0.0);
      else if (dropNoise < thresh * 0.66) video.rgb = vec3(1.0);
      else                                 video.rgb = vec3(1.0, 0.0, 0.0);
    }
  }

  // 17. Vignette
  if (uEnableVignette > 0.5) {
    if (uEnableVhs > 0.5) {
      // VHS-style vignette (softer, TV-like)
      float vig = pow(vUv.x * (1.0 - vUv.x) * vUv.y * (1.0 - vUv.y), 0.25) * 2.2;
      vig = mix(1.0, vig, 0.25 * uVhsStrength);
      video.rgb *= vig;
    } else {
      float vignette = 1.0 - smoothstep(uVignetteSize, 0.9, length(vUv - 0.5));
      video.rgb *= vignette;
    }
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
      // VHS
      uEnableVhs: { value: 1.0 },
      uVhsStrength: { value: 0.7 },
      // Scanlines (moire)
      uEnableScanlines: { value: 1.0 },
      uScanlineCount: { value: 0.0 },
      uScanlineThickness: { value: 0.4 },
      uScanlineIntensity: { value: 0.5 },
      uScanlineScrollSpeed: { value: 0.0 },
      // Glitch
      uEnableInterference: { value: 0.0 },
      uInterferenceIntensity: { value: 0.3 },
      uEnableGhosting: { value: 0.0 },
      uGhostIntensity: { value: 0.3 },
      uEnableDropout: { value: 0.0 },
      uDropoutIntensity: { value: 0.1 },
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

    // VHS
    u.uEnableVhs.value = dbg.vhsEffect ? 1.0 : 0.0
    u.uVhsStrength.value = dbg.vhsStrength

    // Scanlines (moire)
    u.uEnableScanlines.value = dbg.scanlines ? 1.0 : 0.0
    u.uScanlineCount.value = dbg.scanlineCount
    u.uScanlineThickness.value = dbg.scanlineThickness
    u.uScanlineIntensity.value = dbg.scanlineIntensity
    u.uScanlineScrollSpeed.value = dbg.scanlineScrollSpeed

    // Glitch
    u.uEnableInterference.value = dbg.interferenceLines ? 1.0 : 0.0
    u.uInterferenceIntensity.value = dbg.interferenceIntensity
    u.uEnableGhosting.value = dbg.frameGhosting ? 1.0 : 0.0
    u.uGhostIntensity.value = dbg.frameGhostIntensity
    u.uEnableDropout.value = dbg.signalDropout ? 1.0 : 0.0
    u.uDropoutIntensity.value = dbg.signalDropoutIntensity

    // Blend mode
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

    // Chromatic aberration
    u.uChromaAberration.value = dbg.chromaStrength * (
      audioAnalyserActive
        ? 0.3 + audioBass * 0.8
        : 0.2 + Math.sin(t * 0.4) * 0.1
    )

    // Zoom pulse
    const bassDelta = currentBass - prevBass
    prevBass = currentBass
    if (bassDelta > 0.05) {
      zoomPulseValue = Math.min(zoomPulseValue + bassDelta * 2.5, 1.0)
    }
    zoomPulseValue *= 0.93
    u.uZoomPulse.value = zoomPulseValue

    // Slow rotation
    u.uRotation.value = Math.sin(t * 0.03) * 0.08

    // Anamorphic stretch
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
