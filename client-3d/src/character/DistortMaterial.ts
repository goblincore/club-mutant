import * as THREE from 'three'

// PaRappa-style vertex distortion material
// Extends MeshBasicMaterial with vertex shader warping driven by movement velocity
export function createDistortMaterial(texture: THREE.Texture): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.01,
    side: THREE.DoubleSide,
    depthWrite: true,
  })

  // Attach custom uniforms — these get updated per-frame
  material.userData.uniforms = {
    uTime: { value: 0 },
    uSpeed: { value: 0 }, // movement speed magnitude (0..1 normalized)
    uBoundsY: { value: new THREE.Vector2(-0.5, 0.5) }, // min/max Y of the geometry
    uBillboardTwist: { value: 0 }, // angular velocity of billboard rotation (rad/s)
    uVertexFisheye: { value: 0 }, // clip-space barrel distortion intensity
    uCharHBottom: { value: 0 }, // character-space h at this part's geometry bottom (h=0)
    uCharHTop: { value: 1 }, // character-space h at this part's geometry top (h=1)
    uDistortScale: { value: 1 }, // per-bone distortion scale multiplier (0..1)
  }

  // Shared cache key — shader source is identical across all parts, so Three.js
  // reuses the compiled GL program. Per-material uniforms are bound separately
  // via onBeforeCompile + material.userData.shader.
  material.customProgramCacheKey = () => 'distort-paperdoll'

  material.onBeforeCompile = (shader) => {
    // Store shader reference so we can sync uniforms later
    material.userData.shader = shader

    // Bind our uniform objects to the shader
    const uniforms = material.userData.uniforms
    for (const key of Object.keys(uniforms)) {
      shader.uniforms[key] = uniforms[key]
    }

    // Inject uniform declarations before main()
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      `
      uniform float uTime;
      uniform float uSpeed;
      uniform vec2 uBoundsY;
      uniform float uBillboardTwist;
      uniform float uVertexFisheye;
      uniform float uCharHBottom;
      uniform float uCharHTop;
      uniform float uDistortScale;

      void main() {
      `
    )

    // Inject distortion logic after #include <begin_vertex> (where `transformed` is defined)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>

      // Per-part normalized height: 0 at bottom, 1 at top
      float h = clamp((transformed.y - uBoundsY.x) / max(uBoundsY.y - uBoundsY.x, 0.001), 0.0, 1.0);

      // Character-space height: propagated from parent bone chain
      // Ensures continuity at joints (child bottom matches parent at attachment point)
      float hChar = clamp(mix(uCharHBottom, uCharHTop, h), 0.0, 1.0);

      // dScale: per-bone override for part-local effects only (wobble, squash, bounce)
      // Body-coherent effects (lean, twist, billboard twist) always use full speed
      // to maintain joint continuity between parent/child parts
      float dScale = uDistortScale;
      float spd = uSpeed;
      float spdLocal = uSpeed * dScale;

      // 1. Lean — applied at GROUP level in PaperDoll.tsx (not vertex shader)
      // This ensures children (head on torso) inherit lean through the scene graph.
      // Vertex-level lean would move vertices but not child groups, causing gaps.

      // 2. Squash-stretch — part-local (uses h, scaled by dScale)
      float stretchY = 1.0 + spdLocal * 0.12;
      float squashX = 1.0 - spdLocal * 0.06;
      transformed.y *= stretchY;
      transformed.x *= squashX;

      // 3. Twist — body-coherent (uses hChar, NOT scaled by dScale)
      // Only X displacement (no Z) to prevent z-clipping between parts
      float twistAngle = hChar * spd * 0.4 * sin(uTime * 4.0);
      float ct = cos(twistAngle);
      float st = sin(twistAngle);
      transformed.x = transformed.x * ct - transformed.z * st;
      // transformed.z intentionally unchanged — Z displacement causes parts to clip through each other

      // 4. Wobble — part-local (uses h, scaled by dScale)
      transformed.x += sin(h * 3.14159 + uTime * 6.0) * spdLocal * 0.04;
      transformed.y += sin(h * 2.5 + uTime * 5.0) * spdLocal * 0.025;

      // 5. Bounce — part-local (scaled by dScale)
      transformed.y += abs(sin(uTime * 8.0)) * spdLocal * 0.03;

      // 6. Billboard twist — body-coherent (uses hChar, NOT scaled by dScale)
      // Only X displacement (no Z) to prevent z-clipping between parts
      float twistH = hChar * hChar; // quadratic: top moves way more
      float bbAngle = twistH * uBillboardTwist * 2.5;
      float bbc = cos(bbAngle);
      float bbs = sin(bbAngle);
      transformed.x = transformed.x * bbc - transformed.z * bbs;
      // transformed.z intentionally unchanged

      // Add subtle lateral shear from billboard twist (bendy feel)
      transformed.x += twistH * uBillboardTwist * 0.12;
      `
    )

    // Inject clip-space barrel distortion after projection
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      #include <project_vertex>

      // Vertex-level fisheye: warp clip-space positions outward from center
      if (uVertexFisheye > 0.0) {
        vec2 ndc = gl_Position.xy / gl_Position.w;
        float r2 = dot(ndc, ndc);
        float barrel = 1.0 + r2 * uVertexFisheye * 0.4 + r2 * r2 * uVertexFisheye * 0.15;
        gl_Position.xy *= barrel;
      }
      `
    )
  }

  // Force shader recompilation
  material.needsUpdate = true

  return material
}

// Sync uniforms from material.userData to the compiled shader.
// Must be called after onBeforeCompile has run (i.e., after first render frame).
function syncUniforms(material: THREE.MeshBasicMaterial) {
  const shader = material.userData.shader
  if (!shader) return

  const uniforms = material.userData.uniforms
  if (!uniforms) return

  // Ensure shader.uniforms references point to our uniform objects.
  // This handles the case where Three.js program caching may have
  // disconnected the uniform bindings.
  for (const key of Object.keys(uniforms)) {
    if (shader.uniforms[key] !== uniforms[key]) {
      shader.uniforms[key] = uniforms[key]
    }
  }
}

// Update the distortion uniforms for a material
export function updateDistortUniforms(
  material: THREE.MeshBasicMaterial,
  time: number,
  speed: number,
  billboardTwist: number = 0
) {
  const u = material.userData.uniforms
  if (!u) return

  u.uTime.value = time
  u.uSpeed.value = speed
  u.uBillboardTwist.value = billboardTwist

  // Re-sync uniform references every frame to handle context loss / program re-caching
  syncUniforms(material)
}

// Set the vertex-level fisheye intensity (0 = off)
export function setVertexFisheye(material: THREE.MeshBasicMaterial, intensity: number) {
  const u = material.userData.uniforms
  if (!u) return

  u.uVertexFisheye.value = intensity
}

// Set the Y bounds for proper height normalization
export function setDistortBounds(material: THREE.MeshBasicMaterial, minY: number, maxY: number) {
  const u = material.userData.uniforms
  if (!u) return

  u.uBoundsY.value.set(minY, maxY)
}

// Set character-space height bounds for joint-continuous distortion
export function setCharacterSpaceBounds(
  material: THREE.MeshBasicMaterial,
  hCharBottom: number,
  hCharTop: number
) {
  const u = material.userData.uniforms
  if (!u) return

  u.uCharHBottom.value = hCharBottom
  u.uCharHTop.value = hCharTop
}

// Set the per-bone distortion scale multiplier (0..1)
export function setDistortScale(material: THREE.MeshBasicMaterial, scale: number) {
  const u = material.userData.uniforms
  if (!u) return

  u.uDistortScale.value = scale
}
