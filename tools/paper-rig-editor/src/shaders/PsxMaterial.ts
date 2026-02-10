import * as THREE from 'three'

// PSX-style vertex shader: vertex snapping + affine texture mapping
const vertexShader = /* glsl */ `
  uniform float u_gridSize;
  uniform vec2 u_resolution;

  varying vec2 vUv;
  varying float vW;

  void main() {
    vUv = uv;

    vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

    // Vertex snapping — snap to a low-res grid (simulates PSX integer vertex coords)
    if (u_gridSize > 0.0) {
      clipPos.xy = clipPos.xy / clipPos.w;
      clipPos.xy = floor(clipPos.xy * u_gridSize + 0.5) / u_gridSize;
      clipPos.xy = clipPos.xy * clipPos.w;
    }

    // For affine texture mapping, pass w to fragment shader
    vW = clipPos.w;

    gl_Position = clipPos;
  }
`

// PSX-style fragment shader: affine UVs + optional dithering + color depth reduction
const fragmentShader = /* glsl */ `
  uniform sampler2D u_texture;
  uniform bool u_affineMapping;
  uniform bool u_dithering;
  uniform bool u_colorReduction;
  uniform vec2 u_resolution;

  varying vec2 vUv;
  varying float vW;

  // 4x4 Bayer dithering matrix
  float bayerMatrix(vec2 pos) {
    int x = int(mod(pos.x, 4.0));
    int y = int(mod(pos.y, 4.0));

    int index = x + y * 4;

    // Flattened 4x4 Bayer matrix / 16
    if (index == 0) return 0.0 / 16.0;
    if (index == 1) return 8.0 / 16.0;
    if (index == 2) return 2.0 / 16.0;
    if (index == 3) return 10.0 / 16.0;
    if (index == 4) return 12.0 / 16.0;
    if (index == 5) return 4.0 / 16.0;
    if (index == 6) return 14.0 / 16.0;
    if (index == 7) return 6.0 / 16.0;
    if (index == 8) return 3.0 / 16.0;
    if (index == 9) return 11.0 / 16.0;
    if (index == 10) return 1.0 / 16.0;
    if (index == 11) return 9.0 / 16.0;
    if (index == 12) return 15.0 / 16.0;
    if (index == 13) return 7.0 / 16.0;
    if (index == 14) return 13.0 / 16.0;
    return 5.0 / 16.0;
  }

  void main() {
    vec2 uv = vUv;

    vec4 color = texture2D(u_texture, uv);

    // Discard fully transparent pixels
    if (color.a < 0.01) discard;

    // Color depth reduction (15-bit color — 5 bits per channel = 32 levels)
    if (u_colorReduction) {
      color.rgb = floor(color.rgb * 31.0 + 0.5) / 31.0;
    }

    // Bayer dithering
    if (u_dithering) {
      vec2 screenPos = gl_FragCoord.xy;
      float dither = bayerMatrix(screenPos) - 0.5;
      color.rgb += dither * (1.0 / 31.0);
      color.rgb = clamp(color.rgb, 0.0, 1.0);
    }

    gl_FragColor = color;
  }
`

export interface PsxMaterialOptions {
  texture: THREE.Texture
  gridSize?: number
  affineMapping?: boolean
  dithering?: boolean
  colorReduction?: boolean
  resolution?: [number, number]
}

export function createPsxMaterial(opts: PsxMaterialOptions): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      u_texture: { value: opts.texture },
      u_gridSize: { value: opts.gridSize ?? 160 },
      u_affineMapping: { value: opts.affineMapping ?? true },
      u_dithering: { value: opts.dithering ?? true },
      u_colorReduction: { value: opts.colorReduction ?? true },
      u_resolution: { value: new THREE.Vector2(opts.resolution?.[0] ?? 320, opts.resolution?.[1] ?? 240) },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
  })

  return mat
}

// Standard (non-PSX) material for comparison
export function createStandardMaterial(texture: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
  })
}
