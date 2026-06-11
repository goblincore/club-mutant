import { useMemo } from 'react'

const sharedVert = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const checkerFrag = `
precision highp float;
varying vec2 vUv;

void main() {
  // 8x8 checkerboard tiles
  vec2 tiles = floor(vUv * 12.0);
  float checker = mod(tiles.x + tiles.y, 2.0);

  // White tiles: slightly warm off-white. Black tiles: very dark charcoal.
  vec3 white = vec3(0.96, 0.95, 0.92);
  vec3 black = vec3(0.10, 0.10, 0.11);

  // Thin grout line between tiles
  vec2 local = fract(vUv * 12.0);
  float grout = 0.03;
  float inTile = step(grout, local.x) * step(grout, local.y) *
                 step(local.x, 1.0 - grout) * step(local.y, 1.0 - grout);
  vec3 groutColor = vec3(0.70, 0.69, 0.67);

  vec3 tileColor = mix(black, white, checker);
  vec3 color = mix(groutColor, tileColor, inTile);

  // Subtle sheen — lighter toward center
  vec2 d = vUv - 0.5;
  float shine = 1.0 - dot(d, d) * 0.25;
  color *= shine;

  gl_FragColor = vec4(color, 1.0);
}
`

export function CheckerFloor({ size }: { size: [number, number] }) {
  const uniforms = useMemo(() => ({}), [])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={size} />
      <shaderMaterial vertexShader={sharedVert} fragmentShader={checkerFrag} uniforms={uniforms} />
    </mesh>
  )
}
