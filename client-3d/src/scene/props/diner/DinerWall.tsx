import { useMemo } from 'react'
import * as THREE from 'three'

const sharedVert = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const dinerWallFrag = `
precision highp float;
varying vec2 vUv;
uniform float uOpacity;

void main() {
  // Split: lower ~42% is deep red wainscoting, upper is dark wine/maroon
  float split = 0.42;
  float railH  = 0.018;
  float baseH  = 0.06; // dark baseboard at very bottom

  // Lower panel: deep muted red-burgundy
  vec3 lower  = vec3(0.38, 0.05, 0.07);
  // Upper: dark warm maroon/wine
  vec3 upper  = vec3(0.22, 0.04, 0.05);
  // Chrome/brass rail
  vec3 chrome = vec3(0.68, 0.58, 0.34);
  // Dark baseboard
  vec3 base   = vec3(0.06, 0.02, 0.02);

  // Add grime noise to wall
  float grime = fract(sin(dot(vUv * 150.0, vec2(12.9898, 78.233))) * 43758.5453);
  lower -= grime * 0.08;
  upper -= grime * 0.05;

  // Subtle plank/panel lines on lower section
  float panelLine = 0.0;
  if (vUv.y < split - railH) {
    float px = fract(vUv.x * 5.0);
    float lineW = 0.025;
    panelLine = (1.0 - step(lineW, px)) * 0.18 + (1.0 - step(lineW, 1.0 - px)) * 0.18;
  }

  // Subtle vertical wallpaper texture on upper section
  float wallNoise = 0.0;
  if (vUv.y > split + railH) {
    // Fine vertical stripes
    float stripe = step(0.5, fract(vUv.x * 24.0));
    wallNoise = stripe * 0.06;
    // Light plaster grain
    float grain = fract(sin(dot(floor(vUv * 80.0), vec2(127.1, 311.7))) * 43758.5453) * 0.03;
    wallNoise += grain - 0.015;
  }

  vec3 color;
  if (vUv.y < baseH) {
    color = base;
  } else if (vUv.y < split - railH) {
    color = lower - panelLine;
  } else if (vUv.y < split + railH) {
    // Shiny brass rail with slight gradient
    float railPos = (vUv.y - (split - railH)) / (railH * 2.0);
    float shine = 1.0 - abs(railPos - 0.5) * 1.2;
    color = chrome * (0.75 + shine * 0.45);
  } else {
    color = upper + wallNoise;
  }

  gl_FragColor = vec4(color, uOpacity);
}
`

export function DinerWallMaterial() {
  const uniforms = useMemo(() => ({ uOpacity: { value: 1.0 } }), [])
  return (
    <shaderMaterial
      vertexShader={sharedVert}
      fragmentShader={dinerWallFrag}
      uniforms={uniforms}
      transparent
      side={THREE.FrontSide}
    />
  )
}
