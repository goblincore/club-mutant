import * as THREE from 'three'
import { shaderMaterial } from '@react-three/drei'
import { extend } from '@react-three/fiber'

/**
 * Procedural Yoshi-style spotted egg material.
 *
 * Vertex shader tapers a sphere into an egg shape.
 * Fragment shader renders a white base with colored circular spots
 * placed at fixed directions on the surface.
 */

const SpottedEggMaterial = shaderMaterial(
  {
    spotColor: new THREE.Color('#22aa44'),
  },

  // ── Vertex shader ──
  /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldNormal;

    void main() {
      // Egg deformation: taper the top, widen the bottom
      vec3 pos = position;

      // Normalize Y to 0..1 range (sphere radius = 1, Y goes -1..1)
      float t = (pos.y + 1.0) * 0.5;

      // Egg taper: bottom is wider, top is narrower
      float eggScale = mix(1.05, 0.7, t * t);
      pos.x *= eggScale;
      pos.z *= eggScale;

      // Slight vertical stretch for egg proportions
      pos.y *= 1.15;

      vPosition = pos;
      vNormal = normalize(normalMatrix * normal);
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,

  // ── Fragment shader ──
  /* glsl */ `
    uniform vec3 spotColor;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldNormal;

    void main() {
      // Base white color with subtle shading
      vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
      float diff = max(dot(vNormal, lightDir), 0.0);
      float ambient = 0.45;
      float lighting = ambient + (1.0 - ambient) * diff;

      vec3 baseColor = vec3(0.95, 0.95, 0.93) * lighting;

      // Spot centers well-separated around the egg (near-orthogonal directions)
      // to prevent any overlapping. Mix of 2 large + 3 small spots.
      vec3 normPos = normalize(vPosition);

      float soft = 0.04;

      // 2 large spots — opposite sides of the egg
      float s1 = smoothstep(0.84 - soft, 0.84 + soft, dot(normPos, normalize(vec3( 0.7,  0.4,  0.5))));
      float s2 = smoothstep(0.83 - soft, 0.83 + soft, dot(normPos, normalize(vec3(-0.6, -0.3, -0.7))));

      // 3 small spots — in the gaps between the large ones
      float s3 = smoothstep(0.91 - soft, 0.91 + soft, dot(normPos, normalize(vec3(-0.8,  0.5,  0.2))));
      float s4 = smoothstep(0.90 - soft, 0.90 + soft, dot(normPos, normalize(vec3( 0.2, -0.9,  0.3))));
      float s5 = smoothstep(0.92 - soft, 0.92 + soft, dot(normPos, normalize(vec3( 0.3,  0.7, -0.6))));

      float spotMask = max(max(s1, s2), max(s3, max(s4, s5)));

      // Spot color with its own lighting
      vec3 litSpotColor = spotColor * lighting;

      vec3 finalColor = mix(baseColor, litSpotColor, spotMask);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
)

extend({ SpottedEggMaterial })

declare module '@react-three/fiber' {
  interface ThreeElements {
    spottedEggMaterial: JSX.IntrinsicElements['shaderMaterial'] & {
      spotColor?: THREE.Color | string
    }
  }
}

export { SpottedEggMaterial }
