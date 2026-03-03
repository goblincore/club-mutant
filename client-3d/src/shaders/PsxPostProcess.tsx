import { useRef, useMemo, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useUIStore } from '../stores/uiStore'
import { cameraDistance } from '../scene/Camera'
import {
  HIGHLIGHT_LAYER,
  highlightIntensity,
  highlightNeedsOcclusion,
} from '../scene/InteractableObject'

/**
 * VHS + PSX post-processing pass (WebGL2 / GLSL3).
 *
 * Pipeline:
 * 1. Renders the scene to a half-resolution render target (NearestFilter → chunky pixels)
 * 2. Applies a combined VHS + PSX fullscreen shader:
 *    - Bloom (multi-scale glow from bright areas)
 *    - VHS chroma bleed (horizontal color smearing)
 *    - Washed-out brightness lift (raised blacks, compressed range, gamma lift)
 *    - Slight desaturation
 *    - Bayer dithering + 15-bit color reduction
 *    - Animated film grain
 *    - Subtle green shadow tint (VHS tape character)
 *    - Light vignette
 * 3. Outputs to the screen
 *
 * Ported from the 2D client's VhsPostFxPipeline.ts, rewritten for Three.js + WebGL2.
 */

// ---------- vertex shader ----------
// Three.js (GLSL3 mode) injects: #version 300 es, attribute→in, varying→out
const VHS_VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// ---------- fragment shader ----------
// Three.js (GLSL3 mode) injects: varying→in, texture2D→texture, gl_FragColor→out
const VHS_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tMask;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_highlightIntensity;

  varying vec2 vUv;

  // ---- fisheye / barrel distortion ----
  // Driven by u_fisheye uniform (0 = none, 1 = default, 2+ = extreme)
  uniform float u_fisheye;

  vec2 barrelDistort(vec2 uv) {
    vec2 centered = uv - 0.5;
    float r2 = dot(centered, centered);
    float k1 = 0.6 * u_fisheye;  // r² term
    float k2 = 0.4 * u_fisheye;  // r⁴ term
    float distort = 1.0 + r2 * k1 + r2 * r2 * k2;
    return centered * distort + 0.5;
  }

  // ---- film grain (gold noise) ----
  float goldNoise(vec2 xy, float seed) {
    return fract(sin(dot(xy * seed, vec2(12.9898, 78.233))) * 43758.5453);
  }

  // ---- CRT frame helpers (ported from cool-retro-term terminal_frame.frag) ----
  uniform float u_crtFrameEnabled;
  uniform vec3  u_frameColor;
  uniform float u_frameShininess;
  uniform float u_screenRadius;
  uniform float u_ambientLight;

  float min2(vec2 v) { return min(v.x, v.y); }
  float prod2(vec2 v) { return v.x * v.y; }

  // Rounded rectangle SDF in pixel space (resolution-independent corners)
  float roundedRectSdf(vec2 uv, vec2 topLeft, vec2 bottomRight, float radiusPixels) {
    vec2 sizePixels = (bottomRight - topLeft) * u_resolution;
    vec2 centerPixels = (topLeft + bottomRight) * 0.5 * u_resolution;
    vec2 localPixels = uv * u_resolution - centerPixels;
    vec2 halfSize = sizePixels * 0.5 - vec2(radiusPixels);
    vec2 d = abs(localPixels) - halfSize;
    return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - radiusPixels;
  }

  // ---- bloom: multi-scale glow from half-res downsample ----
  uniform sampler2D tBloom;
  uniform vec2 u_bloomResolution;

  vec3 sampleBloom(vec2 uv) {
    vec2 texel = 1.0 / u_bloomResolution;
    vec3 sum = vec3(0.0);
    float totalW = 0.0;

    // 4 iterations × 4 cardinal directions = 16 taps on half-res texture.
    // Bilinear filtering on the downsampled RT provides diagonal spread for free.
    for (int i = 1; i <= 4; i++) {
      float off = float(i) * 3.0;
      float w = 1.0 / (float(i) + 1.0);

      vec3 s0 = texture2D(tBloom, uv + vec2( off, 0.0) * texel).rgb;
      vec3 s1 = texture2D(tBloom, uv + vec2(-off, 0.0) * texel).rgb;
      vec3 s2 = texture2D(tBloom, uv + vec2(0.0,  off) * texel).rgb;
      vec3 s3 = texture2D(tBloom, uv + vec2(0.0, -off) * texel).rgb;

      sum += (s0 + s1 + s2 + s3) * 0.25 * w;
      totalW += w;
    }

    return sum / totalW;
  }

  // ---- VHS chroma bleed: horizontal color smear ----
  vec3 chromaBleed(vec2 uv) {
    vec2 texel = 1.0 / u_resolution;
    vec3 sum = vec3(0.0);
    float totalW = 0.0;

    for (int i = -5; i <= 5; i++) {
      float w = 1.0 - abs(float(i)) / 6.0;
      vec3 s = texture2D(tDiffuse, uv + vec2(float(i) * texel.x * 2.0, 0.0)).rgb;
      sum += s * w;
      totalW += w;
    }

    return sum / totalW;
  }

  // ---- screen-space silhouette outline from highlight mask ----
  float outlineGlow(vec2 uv) {
    vec2 texel = 1.0 / u_resolution;
    float center = texture2D(tMask, uv).r;

    // Dilate the mask outward with soft falloff (3 radii × 8 directions = 24 taps)
    float dilated = center;

    for (int r = 1; r <= 3; r++) {
      float fr = float(r);
      float w = 1.0 - fr / 4.0;
      float wd = w * 0.707; // diagonal weight (shorter effective radius)

      // Cardinal directions
      dilated = max(dilated, texture2D(tMask, uv + vec2( texel.x * fr, 0.0)).r * w);
      dilated = max(dilated, texture2D(tMask, uv + vec2(-texel.x * fr, 0.0)).r * w);
      dilated = max(dilated, texture2D(tMask, uv + vec2(0.0,  texel.y * fr)).r * w);
      dilated = max(dilated, texture2D(tMask, uv + vec2(0.0, -texel.y * fr)).r * w);

      // Diagonal directions (rounder outline)
      dilated = max(dilated, texture2D(tMask, uv + vec2( texel.x * fr,  texel.y * fr)).r * wd);
      dilated = max(dilated, texture2D(tMask, uv + vec2(-texel.x * fr,  texel.y * fr)).r * wd);
      dilated = max(dilated, texture2D(tMask, uv + vec2( texel.x * fr, -texel.y * fr)).r * wd);
      dilated = max(dilated, texture2D(tMask, uv + vec2(-texel.x * fr, -texel.y * fr)).r * wd);
    }

    // Outline = dilated region minus the interior
    return max(0.0, dilated - center);
  }

  // ---- vortex grid OOB fill (pre-rendered to tiny RT) ----
  uniform sampler2D tVortex;
  uniform float u_vortexEnabled;

  void main() {
    // Apply fisheye distortion to UVs
    vec2 distUv = barrelDistort(vUv);

    // ---- CRT frame SDF ----
    float screenRadiusPixels = u_screenRadius;
    float edgeSoftPixels = 2.5;
    float distPixels = roundedRectSdf(distUv, vec2(0.0), vec2(1.0), screenRadiusPixels);
    float inScreen = smoothstep(0.0, edgeSoftPixels, -distPixels);

    // ---- Frame / OOB handling ----
    if (inScreen < 0.001) {
      if (u_crtFrameEnabled < 0.5) {
        // CRT frame disabled — fallback to old behavior
        gl_FragColor = u_vortexEnabled > 0.5
          ? texture2D(tVortex, vUv)
          : vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // Render CRT bezel with directional bevel lighting
      float seamWidth = max(screenRadiusPixels, 0.5) / min2(u_resolution);

      // N/S/E/W seam masks for directional shadow
      float e = min(smoothstep(-seamWidth, seamWidth, distUv.x - distUv.y),
                    smoothstep(-seamWidth, seamWidth, distUv.x - (1.0 - distUv.y)));
      float s = min(smoothstep(-seamWidth, seamWidth, distUv.y - distUv.x),
                    smoothstep(-seamWidth, seamWidth, distUv.x - (1.0 - distUv.y)));
      float w = min(smoothstep(-seamWidth, seamWidth, distUv.y - distUv.x),
                    smoothstep(-seamWidth, seamWidth, (1.0 - distUv.x) - distUv.y));
      float n = min(smoothstep(-seamWidth, seamWidth, distUv.x - distUv.y),
                    smoothstep(-seamWidth, seamWidth, (1.0 - distUv.x) - distUv.y));

      float frameShadow = (e * 0.66 + w * 0.66 + n * 0.33 + s);
      frameShadow = mix(0.35, frameShadow, smoothstep(0.0, edgeSoftPixels * 5.0, distPixels));

      // Bezel color with directional lighting + dither noise
      vec3 frameTint = u_frameColor * frameShadow;
      float noise = fract(sin(dot(vUv * u_resolution, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      frameTint = clamp(frameTint + vec3(noise * 0.04), 0.0, 1.0);

      // Bloom reflection on bezel — soft diffuse color splotches
      float reflectFade = exp(-distPixels * 0.09);
      vec2 bTexel = 1.0 / u_bloomResolution;
      float spread = 20.0;
      vec3 bloomSample = texture2D(tBloom, distUv).rgb * 2.0;
      bloomSample += texture2D(tBloom, distUv + vec2( spread, 0.0) * bTexel).rgb;
      bloomSample += texture2D(tBloom, distUv + vec2(-spread, 0.0) * bTexel).rgb;
      bloomSample += texture2D(tBloom, distUv + vec2(0.0,  spread) * bTexel).rgb;
      bloomSample += texture2D(tBloom, distUv + vec2(0.0, -spread) * bTexel).rgb;
      bloomSample += texture2D(tBloom, distUv + vec2( spread,  spread) * 0.707 * bTexel).rgb;
      bloomSample += texture2D(tBloom, distUv + vec2(-spread,  spread) * 0.707 * bTexel).rgb;
      bloomSample += texture2D(tBloom, distUv + vec2( spread, -spread) * 0.707 * bTexel).rgb;
      bloomSample += texture2D(tBloom, distUv + vec2(-spread, -spread) * 0.707 * bTexel).rgb;
      bloomSample /= 10.0;
      frameTint += bloomSample * reflectFade * u_frameShininess * 0.9;
      frameTint = clamp(frameTint, 0.0, 1.0);

      gl_FragColor = vec4(frameTint, 1.0);
      return;
    }

    // ---- Normal VHS pipeline (inside screen) ----
    vec4 raw = texture2D(tDiffuse, distUv);
    vec2 pixelCoord = distUv * u_resolution;

    // ---- bloom / glow (additive — always brightens) ----
    vec3 glow = sampleBloom(distUv);
    vec3 color = raw.rgb + glow * 0.35;

    // ---- VHS chroma bleed (subtle) ----
    vec3 chroma = chromaBleed(distUv);
    color = mix(color, chroma + glow * 0.35, 0.25);

    // ---- highlight outline (screen-space silhouette glow) ----
    if (u_highlightIntensity > 0.01) {
      float outline = outlineGlow(distUv);
      color += vec3(1.0) * outline * u_highlightIntensity * 2.0;
    }

    // ---- brightness lift (push brighter than unfiltered) ----
    color = mix(color, vec3(1.0), 0.08);
    color *= 1.2;
    color = pow(max(color, vec3(0.0)), vec3(0.88));

    // ---- film grain ----
    float grainSeed = floor(u_time * 24.0) / 24.0 + 1.0;
    float grain = (goldNoise(pixelCoord, grainSeed) - 0.5) * 0.025;
    color += grain;

    color = clamp(color, 0.0, 1.0);

    // ---- CRT glass reflection + edge blend ----
    if (u_crtFrameEnabled > 0.5) {
      // Subtle glass sheen: bright center, dark edges (curved glass reflection)
      float glass = clamp(
        u_ambientLight * pow(prod2(distUv * (1.0 - distUv.yx)) * 25.0, 0.5),
        0.0, 1.0
      );
      color += vec3(glass) * u_frameShininess * 0.15;

      // Soft edge darkening at screen boundary (bezel shadow overhang)
      float edgeDarken = smoothstep(0.0, edgeSoftPixels * 3.0, -distPixels);
      color *= mix(0.85, 1.0, edgeDarken);
    }

    gl_FragColor = vec4(color, raw.a);
  }
`

// ---------- vortex grid shader (rendered to tiny offscreen RT) ----------
const VORTEX_SIZE = 128 // 128×128 pixels — super low-res, chunky

const VORTEX_FRAGMENT = /* glsl */ `
  uniform float u_time;
  varying vec2 vUv;

  #define V_TAU 6.28318530718

  float vHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float vNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = vHash(i);
    float b = vHash(i + vec2(1.0, 0.0));
    float c = vHash(i + vec2(0.0, 1.0));
    float d = vHash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float vFbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;

    for (int i = 0; i < 5; i++) {
      val += amp * vNoise(p * freq);
      freq *= 2.0;
      amp *= 0.5;
    }

    return val;
  }

  void main() {
    vec2 centered = vUv - 0.5;
    float radius = length(centered);
    float angle = atan(centered.y, centered.x);

    // Slow spin
    angle += u_time * 0.15;

    // --- dark swirling clouds ---
    vec2 cloudUv = vUv * 8.0;

    float swirlAngle = angle + u_time * 0.2;
    float swirlStrength = 1.5 / (radius + 0.3);
    cloudUv += vec2(cos(swirlAngle), sin(swirlAngle)) * swirlStrength * 0.5;

    cloudUv += vec2(u_time * 0.15, u_time * 0.08);

    float warp = vFbm(cloudUv * 0.5 + u_time * 0.05);
    cloudUv += vec2(warp * 1.2 - 0.6, warp * 0.8 - 0.4);

    float c1 = vFbm(cloudUv);
    float c2 = vFbm(cloudUv + vec2(5.2, 3.1));
    float cloudDensity = (c1 * 0.6 + c2 * 0.4);

    vec3 bgBright = vec3(0.08, 0.55, 0.30);
    vec3 bgDark = vec3(0.02, 0.18, 0.08);
    vec3 bg = mix(bgBright, bgDark, smoothstep(0.32, 0.58, cloudDensity));

    // --- perspective tunnel grid ---
    float logDepth = -log(max(radius, 0.001)) * 4.0;
    float ringPos = logDepth - u_time * 0.3;

    float ringCell = fract(ringPos);
    float ringLine = 1.0 - smoothstep(0.0, 0.10, ringCell) * (1.0 - smoothstep(0.90, 1.0, ringCell));

    float spokeCount = 28.0;
    float spokeCell = fract(angle * spokeCount / V_TAU);
    float spokeLine = 1.0 - smoothstep(0.0, 0.08, spokeCell) * (1.0 - smoothstep(0.92, 1.0, spokeCell));

    float grid = max(ringLine, spokeLine);

    float outerFade = smoothstep(0.7, 0.4, radius);
    grid *= outerFade;

    vec3 gridBright = vec3(0.55, 1.0, 0.70);
    vec3 gridEdge = vec3(0.35, 0.80, 0.50);
    vec3 gridColor = mix(gridEdge, gridBright, grid * 0.8);

    vec3 color = mix(bg, gridColor, grid * 0.85);

    float centerGlow = exp(-radius * 8.0);
    color += vec3(0.50, 1.0, 0.65) * centerGlow;

    gl_FragColor = vec4(color, 1.0);
  }
`

const BLOOM_SCALE = 0.5 // bloom at half the scene RT resolution

export function PsxPostProcess() {
  const { gl, scene, camera, size } = useThree()
  const renderScale = useUIStore((s) => s.renderScale)

  const originalRenderRef = useRef<typeof gl.render | null>(null)
  const timeRef = useRef(0)

  // Low-res render target with nearest-neighbor filtering
  const target = useMemo(() => {
    return new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
    })
  }, [])

  // Half-res bloom target — LinearFilter gives free blur on downsample
  const bloomTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    })
  }, [])

  // Highlight mask render target (same resolution as scene)
  const maskTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
    })
  }, [])

  // Tiny vortex grid render target (128×128, NearestFilter for chunky pixels)
  const vortexTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(VORTEX_SIZE, VORTEX_SIZE, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
    })
  }, [])

  // Flat white override material for mask color pass
  const maskMaterialNoDepth = useMemo(() => {
    return new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })
  }, [])

  // Depth-tested variant for objects that want occlusion-aware outlines
  const maskMaterialDepth = useMemo(() => {
    return new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: true })
  }, [])

  // Simple blit shader for downsampling scene → bloom RT
  const { blitScene, blitCamera, blitMaterial } = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VHS_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `,
      uniforms: { tDiffuse: { value: null } },
      depthTest: false,
      depthWrite: false,
    })

    const geo = new THREE.PlaneGeometry(2, 2)
    const quad = new THREE.Mesh(geo, mat)
    quad.frustumCulled = false

    const s = new THREE.Scene()
    s.add(quad)

    const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    return { blitScene: s, blitCamera: c, blitMaterial: mat }
  }, [])

  // Vortex grid shader quad (renders to tiny 128×128 RT)
  const { vortexScene, vortexCamera, vortexMaterial } = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VHS_VERTEX,
      fragmentShader: VORTEX_FRAGMENT,
      uniforms: { u_time: { value: 0 } },
      depthTest: false,
      depthWrite: false,
    })

    const geo = new THREE.PlaneGeometry(2, 2)
    const quad = new THREE.Mesh(geo, mat)
    quad.frustumCulled = false

    const s = new THREE.Scene()
    s.add(quad)

    const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    return { vortexScene: s, vortexCamera: c, vortexMaterial: mat }
  }, [])

  // Fullscreen quad with VHS+PSX shader
  const { quadScene, quadCamera, material } = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VHS_VERTEX,
      fragmentShader: VHS_FRAGMENT,
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        tMask: { value: null },
        tVortex: { value: null },
        u_vortexEnabled: { value: 0 },
        u_resolution: { value: new THREE.Vector2(160, 120) },
        u_bloomResolution: { value: new THREE.Vector2(80, 60) },
        u_time: { value: 0 },
        u_fisheye: { value: 1.0 },
        u_highlightIntensity: { value: 0 },
        u_crtFrameEnabled: { value: 1.0 },
        u_frameColor: { value: new THREE.Vector3(0.82, 0.76, 0.65) },
        u_frameShininess: { value: 0.8 },
        u_screenRadius: { value: 12.0 },
        u_ambientLight: { value: 0.8 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })

    const geo = new THREE.PlaneGeometry(2, 2)
    const quad = new THREE.Mesh(geo, mat)
    quad.frustumCulled = false

    const qScene = new THREE.Scene()
    qScene.add(quad)

    const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    return { quadScene: qScene, quadCamera: qCam, material: mat }
  }, [])

  // Take over rendering from r3f
  useEffect(() => {
    const original = gl.render.bind(gl)
    originalRenderRef.current = original
    gl.render = () => {} // no-op the default r3f render

    return () => {
      gl.render = original // restore on unmount
      originalRenderRef.current = null
    }
  }, [gl])

  // Resize render targets when window resizes or renderScale changes
  useEffect(() => {
    const w = Math.max(1, Math.floor(size.width * renderScale))
    const h = Math.max(1, Math.floor(size.height * renderScale))
    const bw = Math.max(1, Math.floor(w * BLOOM_SCALE))
    const bh = Math.max(1, Math.floor(h * BLOOM_SCALE))

    target.setSize(w, h)
    bloomTarget.setSize(bw, bh)
    maskTarget.setSize(w, h)
    material.uniforms.u_resolution.value.set(w, h)
    material.uniforms.u_bloomResolution.value.set(bw, bh)
  }, [size, renderScale, target, bloomTarget, maskTarget, material])

  // Cleanup render targets on unmount
  useEffect(() => {
    return () => {
      target.dispose()
      bloomTarget.dispose()
      maskTarget.dispose()
      vortexTarget.dispose()
      maskMaterialNoDepth.dispose()
      maskMaterialDepth.dispose()
      material.dispose()
      blitMaterial.dispose()
      vortexMaterial.dispose()
    }
  }, [
    target,
    bloomTarget,
    maskTarget,
    vortexTarget,
    maskMaterialNoDepth,
    maskMaterialDepth,
    material,
    blitMaterial,
    vortexMaterial,
  ])

  // Custom render loop: scene → low-res target → VHS shader → screen
  useFrame((_, delta) => {
    const render = originalRenderRef.current
    if (!render) return

    timeRef.current += delta
    material.uniforms.u_time.value = timeRef.current

    // Dynamic fisheye: stronger when zoomed in, weaker when zoomed out
    const override = useUIStore.getState().fisheyeOverride

    if (override !== null) {
      material.uniforms.u_fisheye.value = override
    } else {
      // Map distance 3..15 → fisheye 1.8..0.6 (closer = more distortion)
      const t = Math.max(0, Math.min(1, (cameraDistance - 3) / 12))
      material.uniforms.u_fisheye.value = 1.8 - t * 1.2
    }

    // CRT frame toggle
    const crtFrameOn = useUIStore.getState().crtFrame
    material.uniforms.u_crtFrameEnabled.value = crtFrameOn ? 1.0 : 0.0

    const hasBg = scene.background !== null
    const oldAutoClear = gl.autoClear

    gl.autoClear = true

    // Save camera layer mask — ChatBubble enables layer 1 for when VHS is off
    const savedMask = camera.layers.mask

    // 0. Render highlight mask (layer 2 only) — flat white silhouette
    const intensity = highlightIntensity
    material.uniforms.u_highlightIntensity.value = intensity

    if (intensity > 0.01) {
      gl.setRenderTarget(maskTarget)
      gl.setClearColor(0x000000, 0)
      gl.clear()

      if (highlightNeedsOcclusion) {
        // Depth pre-pass: render full scene to populate depth buffer,
        // then clear color and render highlight with depth testing.
        camera.layers.mask = savedMask
        camera.layers.disable(1)
        gl.autoClear = false
        render(scene, camera)

        gl.clear(true, false, false)

        camera.layers.set(HIGHLIGHT_LAYER)
        scene.overrideMaterial = maskMaterialDepth
        render(scene, camera)
      } else {
        // No occlusion: full silhouette renders through geometry.
        camera.layers.set(HIGHLIGHT_LAYER)
        scene.overrideMaterial = maskMaterialNoDepth
        render(scene, camera)
      }

      gl.autoClear = true
      scene.overrideMaterial = null
      material.uniforms.tMask.value = maskTarget.texture
    } else {
      // Clear mask when nothing is highlighted
      gl.setRenderTarget(maskTarget)
      gl.setClearColor(0x000000, 0)
      gl.clear()
      material.uniforms.tMask.value = maskTarget.texture
    }

    // 1. Render scene (layer 0 only, excludes UI bubbles) to low-res target
    camera.layers.mask = savedMask
    camera.layers.disable(1)
    gl.setRenderTarget(target)

    if (!hasBg) {
      gl.setClearColor(0x000000, 0)
    }

    gl.clear()
    render(scene, camera)

    // 2. Downsample scene → half-res bloom target (LinearFilter provides free blur)
    gl.setRenderTarget(bloomTarget)
    blitMaterial.uniforms.tDiffuse.value = target.texture
    gl.clear()
    render(blitScene, blitCamera)

    // 2.5. Render vortex grid to tiny 128×128 RT (skip when CRT frame covers OOB)
    const vortexOn = useUIStore.getState().vortexOob && !crtFrameOn
    material.uniforms.u_vortexEnabled.value = vortexOn ? 1.0 : 0.0

    if (vortexOn) {
      vortexMaterial.uniforms.u_time.value = timeRef.current
      gl.setRenderTarget(vortexTarget)
      gl.clear()
      render(vortexScene, vortexCamera)
      material.uniforms.tVortex.value = vortexTarget.texture
    }

    // 3. Render VHS post-process quad to screen
    gl.setRenderTarget(null)
    material.uniforms.tDiffuse.value = target.texture
    material.uniforms.tBloom.value = bloomTarget.texture
    gl.clear()
    render(quadScene, quadCamera)

    // 4. Render UI layer (chat bubbles) clean, without post-processing
    gl.autoClear = false
    camera.layers.set(1)
    gl.clearDepth()
    render(scene, camera)

    // Restore
    camera.layers.mask = savedMask

    gl.autoClear = oldAutoClear
  }, 1)

  return null
}
