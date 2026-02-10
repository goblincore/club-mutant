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
    uVelocityX: { value: 0 }, // horizontal velocity direction (-1..1)
    uBoundsY: { value: new THREE.Vector2(-0.5, 0.5) }, // min/max Y of the geometry
  }

  material.onBeforeCompile = (shader) => {
    // Inject our uniforms
    const uniforms = material.userData.uniforms
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uSpeed = uniforms.uSpeed
    shader.uniforms.uVelocityX = uniforms.uVelocityX
    shader.uniforms.uBoundsY = uniforms.uBoundsY

    // Inject uniform declarations before main()
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      `
      uniform float uTime;
      uniform float uSpeed;
      uniform float uVelocityX;
      uniform vec2 uBoundsY;

      void main() {
      `
    )

    // Inject distortion logic after #include <begin_vertex> (where `transformed` is defined)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>

      // Normalized height: 0 at bottom, 1 at top
      float h = clamp((transformed.y - uBoundsY.x) / max(uBoundsY.y - uBoundsY.x, 0.001), 0.0, 1.0);

      float spd = uSpeed;

      // 1. Lean — top of mesh shears in movement direction
      transformed.x += h * h * uVelocityX * 0.15;

      // 2. Squash-stretch — elongate vertically, compress horizontally when moving
      float stretchY = 1.0 + spd * 0.12;
      float squashX = 1.0 - spd * 0.06;
      transformed.y *= stretchY;
      transformed.x *= squashX;

      // 3. Twist — rotate vertices around Y axis, more at top
      float twistAngle = h * spd * 0.4 * sin(uTime * 4.0);
      float ct = cos(twistAngle);
      float st = sin(twistAngle);
      float tx = transformed.x;
      float tz = transformed.z;
      transformed.x = tx * ct - tz * st;
      transformed.z = tx * st + tz * ct;

      // 4. Wobble — organic sine-wave displacement
      transformed.x += sin(h * 3.14159 + uTime * 6.0) * spd * 0.04;
      transformed.y += sin(h * 2.5 + uTime * 5.0) * spd * 0.025;

      // 5. Bounce — subtle vertical bounce cycle
      transformed.y += abs(sin(uTime * 8.0)) * spd * 0.03;
      `
    )
  }

  // Force shader recompilation
  material.needsUpdate = true

  return material
}

// Update the distortion uniforms for a material
export function updateDistortUniforms(
  material: THREE.MeshBasicMaterial,
  time: number,
  speed: number,
  velocityX: number,
) {
  const u = material.userData.uniforms
  if (!u) return

  u.uTime.value = time
  u.uSpeed.value = speed
  u.uVelocityX.value = velocityX
}

// Set the Y bounds for proper height normalization
export function setDistortBounds(material: THREE.MeshBasicMaterial, minY: number, maxY: number) {
  const u = material.userData.uniforms
  if (!u) return

  u.uBoundsY.value.set(minY, maxY)
}
