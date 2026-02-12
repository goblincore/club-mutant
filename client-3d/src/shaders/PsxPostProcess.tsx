import { useRef, useMemo, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useUIStore } from '../stores/uiStore'

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
  uniform vec2 u_resolution;
  uniform float u_time;

  varying vec2 vUv;

  // ---- fisheye / barrel distortion ----
  // Higher-order polynomial for true fisheye center magnification
  const float BARREL_K1 = 0.6;  // r² term — main curvature
  const float BARREL_K2 = 0.4;  // r⁴ term — extra center bulge

  vec2 barrelDistort(vec2 uv) {
    vec2 centered = uv - 0.5;
    float r2 = dot(centered, centered);
    float distort = 1.0 + r2 * BARREL_K1 + r2 * r2 * BARREL_K2;
    return centered * distort + 0.5;
  }

  // ---- film grain (gold noise) ----
  float goldNoise(vec2 xy, float seed) {
    return fract(sin(dot(xy * seed, vec2(12.9898, 78.233))) * 43758.5453);
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

  void main() {
    // Apply fisheye distortion to UVs
    vec2 distUv = barrelDistort(vUv);

    // Black outside the distorted frame
    if (distUv.x < 0.0 || distUv.x > 1.0 || distUv.y < 0.0 || distUv.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec4 raw = texture2D(tDiffuse, distUv);
    vec2 pixelCoord = distUv * u_resolution;

    // ---- bloom / glow (additive — always brightens) ----
    vec3 glow = sampleBloom(distUv);
    vec3 color = raw.rgb + glow * 0.35;

    // ---- VHS chroma bleed (subtle) ----
    vec3 chroma = chromaBleed(distUv);
    color = mix(color, chroma + glow * 0.35, 0.25);

    // ---- brightness lift (push brighter than unfiltered) ----
    color = mix(color, vec3(1.0), 0.08);
    color *= 1.2;
    color = pow(max(color, vec3(0.0)), vec3(0.88));

    // ---- film grain ----
    float grainSeed = floor(u_time * 24.0) / 24.0 + 1.0;
    float grain = (goldNoise(pixelCoord, grainSeed) - 0.5) * 0.025;
    color += grain;

    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, raw.a);
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

  // Fullscreen quad with VHS+PSX shader
  const { quadScene, quadCamera, material } = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VHS_VERTEX,
      fragmentShader: VHS_FRAGMENT,
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        u_resolution: { value: new THREE.Vector2(160, 120) },
        u_bloomResolution: { value: new THREE.Vector2(80, 60) },
        u_time: { value: 0 },
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
    material.uniforms.u_resolution.value.set(w, h)
    material.uniforms.u_bloomResolution.value.set(bw, bh)
  }, [size, renderScale, target, bloomTarget, material])

  // Cleanup render targets on unmount
  useEffect(() => {
    return () => {
      target.dispose()
      bloomTarget.dispose()
      material.dispose()
      blitMaterial.dispose()
    }
  }, [target, bloomTarget, material, blitMaterial])

  // Custom render loop: scene → low-res target → VHS shader → screen
  useFrame((_, delta) => {
    const render = originalRenderRef.current
    if (!render) return

    timeRef.current += delta
    material.uniforms.u_time.value = timeRef.current

    const hasBg = scene.background !== null
    const oldAutoClear = gl.autoClear

    gl.autoClear = true

    // Save camera layer mask — ChatBubble enables layer 1 for when VHS is off
    const savedMask = camera.layers.mask

    // 1. Render scene (layer 0 only, excludes UI bubbles) to low-res target
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
