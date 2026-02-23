import { useMemo, useRef } from 'react'
import { useFrame, useThree, useLoader } from '@react-three/fiber'
import * as THREE from 'three'

// Seeded noise helpers for flicker
function fract(x: number) { return x - Math.floor(x) }
function hash(n: number) { return fract(Math.sin(n) * 43758.5453) }

import { useGameStore, getPlayerPosition } from '../stores/gameStore'
import { useUIStore } from '../stores/uiStore'
import { NightSky } from '../shaders/NightSky'
import { InteractableObject } from './InteractableObject'

interface JukeboxRoomProps {
  videoTexture?: THREE.VideoTexture | null
  slideshowTexture?: THREE.Texture | null
}

const ROOM_W = 9
const ROOM_D = 9
const WALL_HEIGHT = 3.0
const WORLD_SCALE = 0.01
const HALF_W = ROOM_W / 2
const HALF_D = ROOM_D / 2

// Stage world-space bounds (exported so PlayerEntity can do floor elevation)
export const JUKEBOX_STAGE_Z_MIN = HALF_D - 1.8 - 0.05   // back edge of stage
export const JUKEBOX_STAGE_Z_MAX = HALF_D - 0.05          // front edge
export const JUKEBOX_STAGE_X_MIN = -2.25
export const JUKEBOX_STAGE_X_MAX = 2.25
export const JUKEBOX_STAGE_HEIGHT = 0.3                    // world units

const FADE_SPEED = 6
const OCCLUDE_OPACITY = 0.08

const raycaster = new THREE.Raycaster()
const playerWorldPos = new THREE.Vector3()
const _scratchDir = new THREE.Vector3()

const sharedVert = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// ── Black & white checkerboard floor ──
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

function CheckerFloor({ size }: { size: [number, number] }) {
  const uniforms = useMemo(() => ({}), [])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={size} />
      <shaderMaterial vertexShader={sharedVert} fragmentShader={checkerFrag} uniforms={uniforms} />
    </mesh>
  )
}

// ── Diner wall — deep burgundy/red lower wainscoting, dark wine upper, chrome rail ──
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

function DinerWallMaterial() {
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

// ── Diner booth — red vinyl bench seats ──
function DinerBooth({
  position,
  rotation = [0, 0, 0],
  width = 1.8,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  width?: number
}) {
  const SEAT_H = 0.42
  const SEAT_D = 0.55
  const BACK_H = 0.5
  const VINYL = '#c0151a'
  const FRAME = '#1a1a1a'

  return (
    <group position={position} rotation={rotation}>
      {/* Seat */}
      <mesh position={[0, SEAT_H, 0]}>
        <boxGeometry args={[width, 0.1, SEAT_D]} />
        <meshStandardMaterial color={VINYL} roughness={0.6} />
      </mesh>

      {/* Seat base */}
      <mesh position={[0, SEAT_H / 2, 0]}>
        <boxGeometry args={[width, SEAT_H, SEAT_D]} />
        <meshStandardMaterial color={FRAME} roughness={0.8} />
      </mesh>

      {/* Back rest */}
      <mesh position={[0, SEAT_H + BACK_H / 2 + 0.05, -(SEAT_D / 2) + 0.08]}>
        <boxGeometry args={[width, BACK_H, 0.1]} />
        <meshStandardMaterial color={VINYL} roughness={0.6} />
      </mesh>

      {/* Back rest frame */}
      <mesh position={[0, SEAT_H + BACK_H / 2, -(SEAT_D / 2) + 0.03]}>
        <boxGeometry args={[width + 0.02, BACK_H + 0.1, 0.06]} />
        <meshStandardMaterial color={FRAME} roughness={0.8} />
      </mesh>
    </group>
  )
}

// ── Diner table — chrome legs, formica top ──
function DinerTable({
  position,
  rotation = [0, 0, 0],
  size = [1.1, 0.65] as [number, number],
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  size?: [number, number]
}) {
  const TABLE_H = 0.76
  const [tw, td] = size

  return (
    <group position={position} rotation={rotation}>
      {/* Tabletop — pale formica */}
      <mesh position={[0, TABLE_H, 0]}>
        <boxGeometry args={[tw, 0.04, td]} />
        <meshStandardMaterial color="#e8e2d4" roughness={0.4} metalness={0.05} />
      </mesh>

      {/* Chrome edge band */}
      <mesh position={[0, TABLE_H - 0.01, 0]}>
        <boxGeometry args={[tw + 0.01, 0.025, td + 0.01]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Single chrome pedestal leg */}
      <mesh position={[0, TABLE_H / 2, 0]}>
        <cylinderGeometry args={[0.025, 0.025, TABLE_H, 8]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Foot base */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.04, 12]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Salt & pepper shakers */}
      {[-0.12, 0.12].map((xOff, i) => (
        <mesh key={i} position={[xOff, TABLE_H + 0.055, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.07, 8]} />
          <meshStandardMaterial color={i === 0 ? '#f0f0f0' : '#222'} roughness={0.5} />
        </mesh>
      ))}

      {/* Ketchup bottle */}
      <mesh position={[0, TABLE_H + 0.07, 0.12]}>
        <cylinderGeometry args={[0.018, 0.022, 0.1, 8]} />
        <meshStandardMaterial color="#c0201a" roughness={0.6} />
      </mesh>
    </group>
  )
}

// ── Bar island — L-shaped counter, cute 60s retro style ──
// Uses emissive to ensure pastel colors show through even in shadow
function BarIsland({ position }: { position: [number, number, number] }) {
  const H = 0.38          // low counter — below waist height
  const D = 0.55
  const MAIN_LEN = 3.6    // main bar runs along Z
  const WING_LEN = 1.8    // short wing runs along X
  const TOP_COLOR = '#f5ead0'     // warm cream formica
  const FRONT_COLOR = '#ffc1d3'   // pastel pink (customer-facing)
  const BACK_COLOR = '#f0d6e0'    // light pink (bartender side)
  const CHROME_COLOR = '#d4cfc8'  // light silver
  const RAIL_COLOR = '#c0b8b0'    // warm silver

  // Single bar section helper — "front" = +Z side (chrome edge + foot rail)
  const BarSection = ({ len, rot, pos }: { len: number; rot: [number, number, number]; pos: [number, number, number] }) => (
    <group position={pos} rotation={rot}>
      {/* Counter top — warm cream formica */}
      <mesh position={[0, H, 0]}>
        <boxGeometry args={[len, 0.04, D]} />
        <meshStandardMaterial color={TOP_COLOR} emissive={TOP_COLOR} emissiveIntensity={0.3} roughness={0.4} metalness={0.02} />
      </mesh>

      {/* Chrome edge on counter top (front side) */}
      <mesh position={[0, H - 0.006, D / 2 - 0.01]}>
        <boxGeometry args={[len + 0.01, 0.024, 0.016]} />
        <meshStandardMaterial color={CHROME_COLOR} metalness={0.5} roughness={0.25} />
      </mesh>

      {/* Front face — pastel pink panel (customer-facing) */}
      <mesh position={[0, H / 2, D / 2]}>
        <boxGeometry args={[len, H, 0.05]} />
        <meshStandardMaterial color={FRONT_COLOR} emissive={FRONT_COLOR} emissiveIntensity={0.25} roughness={0.7} />
      </mesh>

      {/* Back panel — lighter pink */}
      <mesh position={[0, H / 2, -D / 2]}>
        <boxGeometry args={[len, H, 0.05]} />
        <meshStandardMaterial color={BACK_COLOR} emissive={BACK_COLOR} emissiveIntensity={0.2} roughness={0.75} />
      </mesh>

      {/* Chrome foot rail (front side) */}
      <mesh position={[0, 0.08, D / 2 + 0.04]}>
        <boxGeometry args={[len - 0.1, 0.020, 0.020]} />
        <meshStandardMaterial color={RAIL_COLOR} metalness={0.5} roughness={0.25} />
      </mesh>

      {/* Left end cap */}
      <mesh position={[-(len / 2), H / 2, 0]}>
        <boxGeometry args={[0.05, H, D]} />
        <meshStandardMaterial color={FRONT_COLOR} emissive={FRONT_COLOR} emissiveIntensity={0.22} roughness={0.7} />
      </mesh>

      {/* Right end cap */}
      <mesh position={[len / 2, H / 2, 0]}>
        <boxGeometry args={[0.05, H, D]} />
        <meshStandardMaterial color={FRONT_COLOR} emissive={FRONT_COLOR} emissiveIntensity={0.22} roughness={0.7} />
      </mesh>
    </group>
  )

  return (
    <group position={position}>
      {/* Main bar — runs along Z axis, front (chrome/rail) faces -X (room center) */}
      <BarSection len={MAIN_LEN} rot={[0, -Math.PI / 2, 0]} pos={[0, 0, 0]} />

      {/* Wing — extends from back end of main bar toward +X (right wall), closes off corridor */}
      <BarSection len={WING_LEN} rot={[0, Math.PI, 0]} pos={[(WING_LEN / 2) - D / 2, 0, (MAIN_LEN / 2) + D / 2 - 0.05]} />

      {/* Flower vases on counter top — cute 60s accent */}
      {([
        { pos: [-0.05,  -0.3] as [number, number], vaseColor: '#e8b4d0', flowerColor: '#ff88bb' },
        { pos: [-0.05, -1.4] as [number, number], vaseColor: '#b4d0e8', flowerColor: '#88ccff' },
        { pos: [-0.05,  0.6] as [number, number], vaseColor: '#d0e8b4', flowerColor: '#aaee66' },
      ]).map(({ pos: [px, pz], vaseColor, flowerColor }, i) => (
        <group key={i} position={[px, H + 0.02, pz]}>
          {/* Vase */}
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.03, 0.04, 0.10, 8]} />
            <meshStandardMaterial color={vaseColor} emissive={vaseColor} emissiveIntensity={0.3} roughness={0.5} />
          </mesh>
          {/* Flower head */}
          <mesh position={[0, 0.13, 0]}>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshStandardMaterial color={flowerColor} emissive={flowerColor} emissiveIntensity={0.35} roughness={0.6} />
          </mesh>
          {/* Stem */}
          <mesh position={[0, 0.09, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.06, 4]} />
            <meshStandardMaterial color="#66aa66" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ── Back shelf — bottles behind the bar against the right wall — 60s retro ──
// Rotation prop so it can be oriented flat against the wall
function BackShelf({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  const SHELF_W = 3.2
  const SHELF_D = 0.25
  const BACK_COLOR = '#f0e6da'       // light cream backing
  const SHELF_WOOD = '#d4b896'       // warm light wood

  // Candy-bright bottle colors for 60s retro vibe
  const bottles = [
    { x: -1.2, h: 0.22, color: '#88ddaa' },
    { x: -0.9, h: 0.18, color: '#ee8899' },
    { x: -0.6, h: 0.24, color: '#ffcc66' },
    { x: -0.3, h: 0.16, color: '#aaccff' },
    { x: 0.0, h: 0.20, color: '#cc99ff' },
    { x: 0.3, h: 0.22, color: '#88ddaa' },
    { x: 0.6, h: 0.18, color: '#ee8899' },
    { x: 0.9, h: 0.24, color: '#ffcc66' },
    { x: 1.2, h: 0.16, color: '#aaccff' },
  ]

  return (
    <group position={position} rotation={rotation}>
      {/* Back board — light cream, emissive so it glows */}
      <mesh position={[0, 0.8, -SHELF_D / 2 - 0.02]}>
        <boxGeometry args={[SHELF_W + 0.1, 1.4, 0.04]} />
        <meshStandardMaterial color={BACK_COLOR} emissive={BACK_COLOR} emissiveIntensity={0.25} roughness={0.7} />
      </mesh>

      {/* Shelf 1 — lower */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[SHELF_W, 0.03, SHELF_D]} />
        <meshStandardMaterial color={SHELF_WOOD} emissive={SHELF_WOOD} emissiveIntensity={0.15} roughness={0.6} />
      </mesh>

      {/* Shelf 2 — upper */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[SHELF_W, 0.03, SHELF_D]} />
        <meshStandardMaterial color={SHELF_WOOD} emissive={SHELF_WOOD} emissiveIntensity={0.15} roughness={0.6} />
      </mesh>

      {/* Shelf 3 — top */}
      <mesh position={[0, 1.25, 0]}>
        <boxGeometry args={[SHELF_W, 0.03, SHELF_D]} />
        <meshStandardMaterial color={SHELF_WOOD} emissive={SHELF_WOOD} emissiveIntensity={0.15} roughness={0.6} />
      </mesh>

      {/* Bottles on lower shelf — candy bright, emissive for pop */}
      {bottles.map((b, i) => (
        <mesh key={`low-${i}`} position={[b.x, 0.45 + b.h / 2 + 0.02, 0]}>
          <cylinderGeometry args={[0.025, 0.03, b.h, 8]} />
          <meshStandardMaterial color={b.color} emissive={b.color} emissiveIntensity={0.3} roughness={0.3} transparent opacity={0.8} />
        </mesh>
      ))}

      {/* Bottles on upper shelf */}
      {bottles.slice(0, 7).map((b, i) => (
        <mesh key={`up-${i}`} position={[b.x + 0.15, 0.85 + b.h / 2 + 0.02, 0]}>
          <cylinderGeometry args={[0.022, 0.028, b.h * 0.85, 8]} />
          <meshStandardMaterial color={b.color} emissive={b.color} emissiveIntensity={0.3} roughness={0.3} transparent opacity={0.8} />
        </mesh>
      ))}

      {/* A couple glasses on top shelf */}
      {[-0.5, 0.1, 0.7].map((x, i) => (
        <mesh key={`glass-${i}`} position={[x, 1.25 + 0.06, 0]}>
          <cylinderGeometry args={[0.03, 0.025, 0.1, 8]} />
          <meshStandardMaterial color="#e0e0e0" roughness={0.15} transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  )
}

// ── Counter stool — chrome post + pastel pink vinyl seat ──
function CounterStool({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Seat cushion — small pastel pink to match bar (H=0.38 bar → seat at ~0.28) */}
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.045, 8]} />
        <meshStandardMaterial color="#ffc1d3" emissive="#ffc1d3" emissiveIntensity={0.2} roughness={0.6} />
      </mesh>

      {/* Post — short to match low bar */}
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.28, 6]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.85} roughness={0.15} />
      </mesh>

      {/* Foot ring */}
      <mesh position={[0, 0.10, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.10, 0.010, 6, 12]} />
        <meshStandardMaterial color="#aaaaaa" metalness={0.7} roughness={0.2} />
      </mesh>

      {/* Base */}
      <mesh position={[0, 0.018, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.03, 8]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  )
}

// ── Pastel Kawaii Retro jukebox ──
function JukeboxMachine({ position }: { position: [number, number, number] }) {
  const W = 0.82
  const H = 1.75
  const D = 0.5

  return (
    <group position={position}>
      {/* Main cabinet — Pastel Pink */}
      <mesh position={[0, H / 2, 0]}>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color="#ffb3d9" roughness={0.4} />
      </mesh>

      {/* Cat ears */}
      <mesh position={[-0.25, H + 0.35, 0]} rotation={[0, 0, 0.2]}>
        <coneGeometry args={[0.15, 0.25, 4]} />
        <meshStandardMaterial color="#ffb3d9" roughness={0.4} />
      </mesh>
      <mesh position={[0.25, H + 0.35, 0]} rotation={[0, 0, -0.2]}>
        <coneGeometry args={[0.15, 0.25, 4]} />
        <meshStandardMaterial color="#ffb3d9" roughness={0.4} />
      </mesh>

      {/* Inner Ear pink */}
      <mesh position={[-0.25, H + 0.36, 0.05]} rotation={[0, 0, 0.2]}>
        <coneGeometry args={[0.08, 0.15, 3]} />
        <meshStandardMaterial color="#ff3388" roughness={0.4} />
      </mesh>
      <mesh position={[0.25, H + 0.36, 0.05]} rotation={[0, 0, -0.2]}>
        <coneGeometry args={[0.08, 0.15, 3]} />
        <meshStandardMaterial color="#ff3388" roughness={0.4} />
      </mesh>

      {/* Rounded dome top */}
      <mesh position={[0, H + 0.12, 0]}>
        <sphereGeometry args={[W * 0.52, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#fca5ce" roughness={0.4} />
      </mesh>

      {/* Glowing display arch — soft pink */}
      <mesh position={[0, H * 0.78, D / 2 + 0.01]}>
        <planeGeometry args={[W * 0.78, H * 0.22]} />
        <meshStandardMaterial
          color="#ffccff"
          emissive="#ff99dd"
          emissiveIntensity={1.2}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Chrome trim — top arch */}
      <mesh position={[0, H * 0.9, D / 2 + 0.012]}>
        <boxGeometry args={[W * 0.82, 0.03, 0.01]} />
        <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Chrome trim — mid divider */}
      <mesh position={[0, H * 0.62, D / 2 + 0.012]}>
        <boxGeometry args={[W * 0.9, 0.025, 0.01]} />
        <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Side chrome fins */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 + 0.01), H * 0.76, 0]}>
          <boxGeometry args={[0.025, H * 0.5, D + 0.02]} />
          <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
        </mesh>
      ))}

      {/* Speaker grille — lower front (soft white/pink tone) */}
      <mesh position={[0, H * 0.28, D / 2 + 0.01]}>
        <planeGeometry args={[W * 0.72, H * 0.3]} />
        <meshStandardMaterial color="#ffeeff" roughness={0.95} />
      </mesh>

      {/* Grille bars */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[0, H * 0.17 + i * 0.055, D / 2 + 0.018]}>
          <boxGeometry args={[W * 0.62, 0.007, 0.003]} />
          <meshStandardMaterial color="#ffaadd" />
        </mesh>
      ))}

      {/* Selection buttons are now little stars/hearts (using rotated squares for simplicity) */}
      {[-0.18, -0.06, 0.06, 0.18].map((xOff, i) => (
        <mesh key={i} position={[xOff, H * 0.53, D / 2 + 0.015]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.03, 0.03, 0.01]} />
          <meshStandardMaterial
            color={['#ff88cc', '#aaddff', '#bcffbc', '#ffffaa'][i]}
            emissive={['#ff88cc', '#aaddff', '#bcffbc', '#ffffaa'][i]}
            emissiveIntensity={0.8}
          />
        </mesh>
      ))}

      {/* Coin slot */}
      <mesh position={[W * 0.28, H * 0.53, D / 2 + 0.015]}>
        <boxGeometry args={[0.055, 0.012, 0.008]} />
        <meshStandardMaterial color="#dddddd" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Vinyl record visible through top window */}
      <mesh position={[0, H * 0.78 + 0.01, D / 2 + 0.02]}>
        <circleGeometry args={[0.12, 16]} />
        <meshStandardMaterial color="#554466" roughness={0.3} />
      </mesh>
      <mesh position={[0, H * 0.78 + 0.022, D / 2 + 0.02]}>
        <circleGeometry args={[0.035, 12]} />
        <meshStandardMaterial color="#ff99cc" roughness={0.7} />
      </mesh>

      {/* Base */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[W + 0.06, 0.1, D + 0.06]} />
        <meshStandardMaterial color="#ff88bb" roughness={0.85} />
      </mesh>
    </group>
  )
}

// ── Milkshake / menu stand props for the counter ──
function CounterProps({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Menu stand */}
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.12, 0.22, 0.015]} />
        <meshStandardMaterial color="#cc3322" roughness={0.7} />
      </mesh>

      {/* Milkshake glass */}
      <mesh position={[0.18, 0.1, 0]}>
        <cylinderGeometry args={[0.025, 0.02, 0.16, 8]} />
        <meshStandardMaterial color="#f0e8d0" transparent opacity={0.7} roughness={0.2} />
      </mesh>

      {/* Straw */}
      <mesh position={[0.185, 0.17, 0]} rotation={[0.2, 0, 0.15]}>
        <cylinderGeometry args={[0.004, 0.004, 0.12, 6]} />
        <meshStandardMaterial color="#ff6688" />
      </mesh>
    </group>
  )
}

// ── Neon sign on the wall ──
function NeonSign({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Backing board */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[1.1, 0.38, 0.04]} />
        <meshStandardMaterial color="#111" roughness={0.9} />
      </mesh>

      {/* "DINER" text glow — emissive plane */}
      <mesh position={[0, 0.06, 0.01]}>
        <planeGeometry args={[0.96, 0.14]} />
        <meshStandardMaterial
          color="#ff4488"
          emissive="#ff2266"
          emissiveIntensity={2.5}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Bottom tagline glow */}
      <mesh position={[0, -0.1, 0.01]}>
        <planeGeometry args={[0.7, 0.07]} />
        <meshStandardMaterial
          color="#44ddff"
          emissive="#22bbff"
          emissiveIntensity={2.0}
          transparent
          opacity={0.85}
        />
      </mesh>
    </group>
  )
}

// ── Heavens Night Sign ──
const MAX_SPARKS = 18
const _sparkMat = new THREE.Matrix4()
const _sparkPos = new THREE.Vector3()

function HeavensNightSign({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  const texture = useLoader(THREE.TextureLoader, '/textures/heavens_night.png')

  // MeshBasicMaterial — color multiplier drives brightness for flicker
  const signMatRef  = useRef<THREE.MeshBasicMaterial>(null)
  const sparkRef    = useRef<THREE.InstancedMesh>(null)

  // Per-spark state: [x, y, vx, vy, life, maxLife, size]
  const sparks   = useRef<Float32Array>(new Float32Array(MAX_SPARKS * 7).fill(0))
  const flickerT = useRef(0)
  // _color reused each frame to avoid allocation
  const _color   = useMemo(() => new THREE.Color(), [])

  useFrame((_, dt) => {
    flickerT.current += dt
    const t = flickerT.current

    // ── Flicker: layered fast buzz + occasional hard stutter ──
    const buzz    = hash(Math.floor(t * 38) * 1.1)
    const stutter = hash(Math.floor(t *  5) * 3.7)
    // Most of the time fully on; occasionally dims or cuts
    const flicker = buzz > 0.12 ? 1.0 : stutter > 0.3 ? 0.25 : 0.0
    const bright  = 0.75 + flicker * 0.85  // range 0 – 1.6

    if (signMatRef.current) {
      _color.setRGB(bright, bright * 0.6, bright * 0.85)
      signMatRef.current.color.copy(_color)
    }

    // ── Sparks: spawn during bright moments ──
    const sp = sparks.current
    if (flicker > 0.8 && Math.random() < 0.22) {
      for (let i = 0; i < MAX_SPARKS; i++) {
        const b = i * 7
        if (sp[b + 4] <= 0) {
          sp[b + 0] = (Math.random() - 0.5) * 1.0    // x  (within text area)
          sp[b + 1] = (Math.random() - 0.5) * 0.7    // y
          sp[b + 2] = (Math.random() - 0.5) * 0.8    // vx
          sp[b + 3] = Math.random() * 1.0 + 0.4      // vy upward
          sp[b + 4] = 0.35 + Math.random() * 0.45    // life
          sp[b + 5] = sp[b + 4]                      // maxLife
          sp[b + 6] = 0.010 + Math.random() * 0.014  // size
          break
        }
      }
    }

    if (!sparkRef.current) return
    let visible = 0
    for (let i = 0; i < MAX_SPARKS; i++) {
      const b = i * 7
      if (sp[b + 4] <= 0) continue
      sp[b + 4] -= dt
      sp[b + 0] += sp[b + 2] * dt
      sp[b + 1] += sp[b + 3] * dt
      sp[b + 3] -= 2.8 * dt          // gravity
      const s = sp[b + 6] * (sp[b + 4] / sp[b + 5])
      _sparkPos.set(sp[b + 0], sp[b + 1], 0.02)
      _sparkMat.makeScale(s, s, s)
      _sparkMat.setPosition(_sparkPos)
      sparkRef.current.setMatrixAt(visible++, _sparkMat)
    }
    sparkRef.current.count = visible
    sparkRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group position={position} rotation={rotation}>
      {/* Neon sign — AdditiveBlending so black bg is invisible, only bright pixels show.
          depthWrite=false prevents the plane from occluding geometry behind it. */}
      <mesh>
        <planeGeometry args={[1.5, 1.5]} />
        <meshBasicMaterial
          ref={signMatRef}
          map={texture}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          transparent
        />
      </mesh>

      {/* Sparks — tiny instanced quads, additive so they glow */}
      <instancedMesh ref={sparkRef} args={[undefined, undefined, MAX_SPARKS]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color="#ffaadd"
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          transparent
        />
      </instancedMesh>
    </group>
  )
}

// ── Retro Arcade Machine ──
function ArcadeMachine({ position, rotation = [0, 0, 0], theme = 'fighter' }: { position: [number, number, number], rotation?: [number, number, number], theme?: 'fighter' | 'racer' }) {
  const W = 0.6
  const H = 1.6
  const D = 0.7

  const colors = theme === 'fighter'
    ? { primary: '#aa2222', accent: '#eeaa11', screen: '#ff5533' }
    : { primary: '#2233aa', accent: '#33ffdd', screen: '#3388ff' }

  return (
    <group position={position} rotation={rotation}>
      {/* Base Cabinet */}
      <mesh position={[0, H * 0.25, 0]}>
        <boxGeometry args={[W, H * 0.5, D]} />
        <meshStandardMaterial color={colors.primary} roughness={0.8} />
      </mesh>
      {/* Control Panel */}
      <mesh position={[0, H * 0.55, 0.1]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[W + 0.02, 0.1, 0.4]} />
        <meshStandardMaterial color="#111" roughness={0.9} />
      </mesh>
      {/* Control stick/buttons */}
      <mesh position={[-0.15, H * 0.61, 0]} rotation={[-0.2, 0, 0]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color={colors.accent} roughness={0.4} />
      </mesh>
      <mesh position={[0.1, H * 0.61, 0.1]} rotation={[-0.2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.01]} />
        <meshStandardMaterial color={colors.accent} roughness={0.4} />
      </mesh>
      {/* Screen Area */}
      <mesh position={[0, H * 0.75, -0.1]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[W, 0.5, 0.4]} />
        <meshStandardMaterial color="#050505" roughness={0.5} />
      </mesh>
      {/* Screen Glow */}
      <mesh position={[0, H * 0.75, 0.11]} rotation={[0.2, 0, 0]}>
        <planeGeometry args={[W * 0.8, 0.4]} />
        <meshStandardMaterial color={colors.screen} emissive={colors.screen} emissiveIntensity={0.8} />
      </mesh>
      {/* Marquee (Top) */}
      <mesh position={[0, H * 0.95, -0.05]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[W, 0.2, 0.4]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[0, H * 0.95, 0.16]} rotation={[0.1, 0, 0]}>
        <planeGeometry args={[W * 0.9, 0.15]} />
        <meshStandardMaterial color="#fff" emissive={colors.accent} emissiveIntensity={0.9} />
      </mesh>
      {/* Side Panels */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 + 0.01), H * 0.5, 0]}>
          <boxGeometry args={[0.02, H, D]} />
          <meshStandardMaterial color={colors.primary} roughness={0.8} />
        </mesh>
      ))}
      {/* Coin slots */}
      <mesh position={[W * 0.2, H * 0.35, D / 2 + 0.01]}>
        <boxGeometry args={[0.02, 0.05, 0.02]} />
        <meshStandardMaterial color="#ccc" metalness={0.8} />
      </mesh>
      <mesh position={[W * 0.3, H * 0.35, D / 2 + 0.01]}>
        <boxGeometry args={[0.02, 0.05, 0.02]} />
        <meshStandardMaterial color="#ccc" metalness={0.8} />
      </mesh>
    </group>
  )
}

// ── Video display — mounted above the counter like a diner TV ──
function VideoDisplay({
  position,
  rotation,
  videoTexture,
  slideshowTexture,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  videoTexture?: THREE.VideoTexture | null
  slideshowTexture?: THREE.Texture | null
}) {
  const SCREEN_W = 2.2
  const SCREEN_H = SCREEN_W * (9 / 16)
  const displayTexture = videoTexture ?? slideshowTexture

  return (
    <group position={position} rotation={rotation}>
      {/* Bezel */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[SCREEN_W + 0.08, SCREEN_H + 0.08, 0.08]} />
        <meshStandardMaterial color="#111" roughness={0.7} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        {displayTexture ? (
          <meshBasicMaterial map={displayTexture} toneMapped={false} />
        ) : (
          <meshStandardMaterial color="#060810" emissive="#030408" emissiveIntensity={0.5} />
        )}
      </mesh>
    </group>
  )
}

// ── Vinyl record decoration on the wall ──
function WallRecord({
  position,
  rotation,
  color = '#222222',
  labelColor = '#cc3322',
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  color?: string
  labelColor?: string
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <cylinderGeometry args={[0.15, 0.15, 0.012, 16]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.007, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.004, 12]} />
        <meshStandardMaterial color={labelColor} roughness={0.7} />
      </mesh>
    </group>
  )
}

// ── Raised stage platform with mic stand and spotlight ──
const STAGE_W = 4.5
const STAGE_D = 1.8
const STAGE_H = 0.3

function MicStand({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Main pole */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 1.1, 8]} />
        <meshStandardMaterial color="#aaaaaa" metalness={0.85} roughness={0.2} />
      </mesh>
      {/* Mic capsule directly on top of head */}
      <mesh position={[0, 1.13, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.018, 0.07, 10]} />
        <meshStandardMaterial color="#333" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Mic head grille */}
      <mesh position={[0, 1.17, 0]}>
        <sphereGeometry args={[0.025, 10, 8]} />
        <meshStandardMaterial color="#555" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Base tripod — 3 legs */}
      {[0, 1, 2].map((i) => {
        const angle = (i / 3) * Math.PI * 2
        return (
          <mesh
            key={i}
            position={[Math.sin(angle) * 0.16, 0.05, Math.cos(angle) * 0.16]}
            rotation={[0, 0, (angle > Math.PI ? -1 : 1) * 0.35]}
          >
            <cylinderGeometry args={[0.008, 0.008, 0.36, 6]} />
            <meshStandardMaterial color="#888" metalness={0.7} roughness={0.3} />
          </mesh>
        )
      })}
    </group>
  )
}

function Stage() {
  const WOOD = '#5a3318'
  const WOOD_EDGE = '#3d2010'
  const APRON = '#2a1208'

  return (
    <group>
      {/* Apron — front, back, left, right side faces only (no top/bottom faces needed) */}
      {/* Front face */}
      <mesh position={[0, STAGE_H / 2, STAGE_D / 2]}>
        <planeGeometry args={[STAGE_W, STAGE_H]} />
        <meshStandardMaterial color={APRON} roughness={0.9} side={THREE.FrontSide} />
      </mesh>
      {/* Back face */}
      <mesh position={[0, STAGE_H / 2, -STAGE_D / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[STAGE_W, STAGE_H]} />
        <meshStandardMaterial color={APRON} roughness={0.9} side={THREE.FrontSide} />
      </mesh>
      {/* Left face */}
      <mesh position={[-STAGE_W / 2, STAGE_H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[STAGE_D, STAGE_H]} />
        <meshStandardMaterial color={APRON} roughness={0.9} side={THREE.FrontSide} />
      </mesh>
      {/* Right face */}
      <mesh position={[STAGE_W / 2, STAGE_H / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[STAGE_D, STAGE_H]} />
        <meshStandardMaterial color={APRON} roughness={0.9} side={THREE.FrontSide} />
      </mesh>

      {/* Wood plank top surface — depthWrite off so characters standing on it aren't clipped */}
      <mesh position={[0, STAGE_H + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[STAGE_W, STAGE_D]} />
        <meshStandardMaterial color={WOOD} roughness={0.75} depthWrite={false} />
      </mesh>

      {/* Front edge trim */}
      <mesh position={[0, STAGE_H - 0.025, STAGE_D / 2]}>
        <boxGeometry args={[STAGE_W + 0.02, 0.05, 0.04]} />
        <meshStandardMaterial color={WOOD_EDGE} roughness={0.7} metalness={0.05} />
      </mesh>

      {/* Side edge trims */}
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * (STAGE_W / 2 + 0.01), STAGE_H - 0.025, 0]}>
          <boxGeometry args={[0.04, 0.05, STAGE_D]} />
          <meshStandardMaterial color={WOOD_EDGE} roughness={0.7} />
        </mesh>
      ))}

      {/* Steps — front-center */}
      <mesh position={[0, 0.075, STAGE_D / 2 + 0.2]}>
        <boxGeometry args={[0.8, 0.15, 0.28]} />
        <meshStandardMaterial color={WOOD_EDGE} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.16, STAGE_D / 2 + 0.07]}>
        <boxGeometry args={[0.8, 0.02, 0.28]} />
        <meshStandardMaterial color={WOOD} roughness={0.75} />
      </mesh>

      {/* Mic stand on stage */}
      <MicStand position={[0.3, STAGE_H, 0.1]} />
    </group>
  )
}

// ── Retro diner poster — coloured rectangle with inner frame + label stripe ──
function DinerPoster({
  position,
  rotation,
  width = 0.38,
  height = 0.52,
  bgColor = '#1a0a0a',
  accentColor = '#cc2233',
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  width?: number
  height?: number
  bgColor?: string
  accentColor?: string
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Outer frame */}
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[width + 0.04, height + 0.04, 0.018]} />
        <meshStandardMaterial color="#2a1a00" roughness={0.8} metalness={0.1} />
      </mesh>
      {/* Poster background */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={bgColor} roughness={0.9} />
      </mesh>
      {/* Inner accent border */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[width - 0.04, height - 0.04]} />
        <meshStandardMaterial color={accentColor} roughness={0.85} />
      </mesh>
      {/* Inner dark panel */}
      <mesh position={[0, 0.03, 0.002]}>
        <planeGeometry args={[width - 0.08, height - 0.12]} />
        <meshStandardMaterial color="#0d0404" roughness={0.95} />
      </mesh>
      {/* Bottom label stripe */}
      <mesh position={[0, -(height / 2 - 0.045), 0.002]}>
        <planeGeometry args={[width - 0.04, 0.07]} />
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={0.3}
          roughness={0.7}
        />
      </mesh>
    </group>
  )
}

export function JukeboxRoom({ videoTexture, slideshowTexture }: JukeboxRoomProps) {
  const { camera } = useThree()

  const wallRefs = useRef<THREE.Mesh[]>([])
  const wallOpacities = useRef<number[]>([1, 1, 1, 1])
  const wallAttachmentRefs = useRef<(THREE.Group | null)[]>([null, null, null, null])

  const setWallRef = (index: number) => (mesh: THREE.Mesh | null) => {
    if (mesh) wallRefs.current[index] = mesh
  }
  const setWallAttachmentRef = (index: number) => (group: THREE.Group | null) => {
    wallAttachmentRefs.current[index] = group
  }

  useFrame((_, delta) => {
    const state = useGameStore.getState()
    const myId = state.mySessionId
    if (!myId) return
    const pos = getPlayerPosition(myId)
    if (!pos) return
    playerWorldPos.set(pos.x * WORLD_SCALE, 0.5, -pos.y * WORLD_SCALE)

    const dir = _scratchDir.copy(playerWorldPos).sub(camera.position).normalize()
    raycaster.set(camera.position, dir)
    const distToPlayer = camera.position.distanceTo(playerWorldPos)

    for (let i = 0; i < wallRefs.current.length; i++) {
      const wall = wallRefs.current[i]
      if (!wall) continue

      const mat = wall.material as THREE.ShaderMaterial | THREE.MeshStandardMaterial
      // Temporarily use DoubleSide for raycasting so backface hits (camera outside room) register
      const prevSide = (mat as THREE.Material).side
      ;(mat as THREE.Material).side = THREE.DoubleSide
      const isBlocking = raycaster
        .intersectObject(wall)
        .some((hit) => hit.distance < distToPlayer)
      ;(mat as THREE.Material).side = prevSide

      const targetOpacity = isBlocking ? OCCLUDE_OPACITY : 1
      const t = 1 - Math.exp(-FADE_SPEED * delta)
      wallOpacities.current[i] += (targetOpacity - wallOpacities.current[i]) * t

      const opacity = wallOpacities.current[i]
      const faded = opacity < 0.99

      // Update wall material opacity + depthWrite
      if ('uniforms' in mat) {
        const sm = mat as THREE.ShaderMaterial
        if (sm.uniforms?.uOpacity) sm.uniforms.uOpacity.value = opacity
        sm.depthWrite = !faded
      } else {
        const msm = mat as THREE.MeshStandardMaterial
        msm.opacity = opacity
        msm.depthWrite = !faded
      }

      // Update wall attachment opacity + depthWrite + side + emissive scaling
      const attachments = wallAttachmentRefs.current[i]
      if (attachments) {
        attachments.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const m = child.material as THREE.Material & {
              opacity?: number
              depthWrite?: boolean
              emissiveIntensity?: number
              side?: number
            }
            if (!m.transparent) {
              m.transparent = true
              m.needsUpdate = true
            }
            // If the mesh uses meshBasicMaterial (like neon sign or video screen), we must lower its opacity explicitly
            m.opacity = opacity
            m.depthWrite = !faded
            // When faded, render both sides so attachments are visible from
            // behind the wall (planes/circles default to FrontSide which
            // faces the room interior — invisible when camera is outside).
            m.side = faded ? THREE.DoubleSide : THREE.FrontSide
            // Scale down emissive glow so neon signs etc. fade with the wall
            if (typeof m.emissiveIntensity === 'number') {
              if (m.userData._baseEmissive === undefined) {
                m.userData._baseEmissive = m.emissiveIntensity
              }
              m.emissiveIntensity = m.userData._baseEmissive * opacity
            }
          }
        })
      }
    }
  })

  return (
    <group>
      {/* ── Sky — night / dusk ── */}
      <NightSky />

      {/* ── Checkerboard floor ── */}
      <CheckerFloor size={[ROOM_W, ROOM_D]} />

      {/* ── Ceiling — dark warm tin ceiling ── */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_HEIGHT, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color="#1c1008" roughness={0.9} />
      </mesh>

      {/* ── Back wall (-Z) — teal + cream diner ── */}
      <mesh ref={setWallRef(0)} position={[0, WALL_HEIGHT / 2, -HALF_D]}>
        <planeGeometry args={[ROOM_W, WALL_HEIGHT]} />
        <DinerWallMaterial />
      </mesh>

      {/* Back wall attachments: posters + vinyl records */}
      <group ref={setWallAttachmentRef(0)}>

        {/* Posters — left cluster */}
        <DinerPoster
          position={[-3.4, WALL_HEIGHT * 0.68, -HALF_D + 0.02]}
          rotation={[0, 0, 0]}
          bgColor="#0a0a18"
          accentColor="#2244cc"
          width={0.34}
          height={0.48}
        />
        <DinerPoster
          position={[-2.85, WALL_HEIGHT * 0.62, -HALF_D + 0.02]}
          rotation={[0, 0, -0.05]}
          bgColor="#0d0808"
          accentColor="#aa2211"
          width={0.30}
          height={0.42}
        />

        {/* Vinyl records on back wall upper area */}
        <WallRecord
          position={[-3.85, WALL_HEIGHT * 0.55, -HALF_D + 0.02]}
          rotation={[Math.PI / 2, 0, 0.3]}
          labelColor="#ffcc00"
        />
        <WallRecord
          position={[0.4, WALL_HEIGHT * 0.78, -HALF_D + 0.02]}
          rotation={[Math.PI / 2, 0, -0.2]}
          labelColor="#33aa55"
        />
      </group>

      {/* ── Left wall (-X) ── */}
      <mesh
        ref={setWallRef(1)}
        position={[-HALF_W, WALL_HEIGHT / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_D, WALL_HEIGHT]} />
        <DinerWallMaterial />
      </mesh>

      {/* Left wall attachments: posters + records */}
      <group ref={setWallAttachmentRef(1)}>
        {/* Tall poster above booth */}
        <DinerPoster
          position={[-HALF_W + 0.02, WALL_HEIGHT * 0.67, -2.2]}
          rotation={[0, Math.PI / 2, 0]}
          bgColor="#0a0d08"
          accentColor="#336611"
          width={0.40}
          height={0.56}
        />
        {/* Poster above second booth */}
        <DinerPoster
          position={[-HALF_W + 0.02, WALL_HEIGHT * 0.67, 0.4]}
          rotation={[0, Math.PI / 2, 0]}
          bgColor="#12080a"
          accentColor="#cc1133"
          width={0.38}
          height={0.52}
        />
        {/* Records between posters */}
        <WallRecord
          position={[-HALF_W + 0.02, WALL_HEIGHT * 0.73, -0.9]}
          rotation={[0, Math.PI / 2, 0.25]}
          labelColor="#ff4488"
        />
        <WallRecord
          position={[-HALF_W + 0.02, WALL_HEIGHT * 0.56, -1.4]}
          rotation={[0, Math.PI / 2, -0.3]}
          labelColor="#44ddff"
        />
        <WallRecord
          position={[-HALF_W + 0.02, WALL_HEIGHT * 0.58, 1.2]}
          rotation={[0, Math.PI / 2, 0.6]}
          labelColor="#ffcc00"
        />
      </group>

      {/* ── Right wall (+X) ── */}
      <mesh
        ref={setWallRef(2)}
        position={[HALF_W, WALL_HEIGHT / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_D, WALL_HEIGHT]} />
        <DinerWallMaterial />
      </mesh>

      {/* Right wall attachments: neon sign above shelf + posters */}
      <group ref={setWallAttachmentRef(2)}>
        {/* Heaven's Night neon sign — centered above the back shelf */}
        <HeavensNightSign
          position={[HALF_W - 0.04, WALL_HEIGHT * 0.72, -1.5]}
          rotation={[0, -Math.PI / 2, 0]}
        />

        <DinerPoster
          position={[HALF_W - 0.02, WALL_HEIGHT * 0.72, -2.8]}
          rotation={[0, -Math.PI / 2, 0]}
          bgColor="#0a0808"
          accentColor="#cc5511"
          width={0.36}
          height={0.50}
        />
        <DinerPoster
          position={[HALF_W - 0.02, WALL_HEIGHT * 0.68, -1.2]}
          rotation={[0, -Math.PI / 2, 0.04]}
          bgColor="#080a12"
          accentColor="#2255bb"
          width={0.32}
          height={0.46}
        />
        <WallRecord
          position={[HALF_W - 0.02, WALL_HEIGHT * 0.60, 0.8]}
          rotation={[0, -Math.PI / 2, 0.35]}
          labelColor="#cc3322"
        />
        <WallRecord
          position={[HALF_W - 0.02, WALL_HEIGHT * 0.74, 1.6]}
          rotation={[0, -Math.PI / 2, -0.2]}
          labelColor="#33aaff"
        />
      </group>

      {/* ── Front wall (+Z) — rotated to face inward (-Z) ── */}
      <mesh ref={setWallRef(3)} position={[0, WALL_HEIGHT / 2, HALF_D]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[ROOM_W, WALL_HEIGHT]} />
        <DinerWallMaterial />
      </mesh>

      {/* Front wall attachments: video screen above stage + posters flanking */}
      <group ref={setWallAttachmentRef(3)}>
        {/* Video screen — centered above the stage, facing into the room */}
        <VideoDisplay
          position={[0, WALL_HEIGHT * 0.72, HALF_D - 0.06]}
          rotation={[0, Math.PI, 0]}
          videoTexture={videoTexture}
          slideshowTexture={slideshowTexture}
        />

        <DinerPoster
          position={[-3.0, WALL_HEIGHT * 0.68, HALF_D - 0.02]}
          rotation={[0, Math.PI, 0]}
          bgColor="#080a14"
          accentColor="#1144cc"
          width={0.40}
          height={0.56}
        />
        <DinerPoster
          position={[3.0, WALL_HEIGHT * 0.68, HALF_D - 0.02]}
          rotation={[0, Math.PI, 0.04]}
          bgColor="#0e0808"
          accentColor="#cc2211"
          width={0.38}
          height={0.52}
        />
        <WallRecord
          position={[-2.3, WALL_HEIGHT * 0.72, HALF_D - 0.02]}
          rotation={[Math.PI / 2, 0, 0.4]}
          labelColor="#ffcc00"
        />
        <WallRecord
          position={[2.3, WALL_HEIGHT * 0.60, HALF_D - 0.02]}
          rotation={[Math.PI / 2, 0, -0.3]}
          labelColor="#44ddff"
        />
      </group>

      {/* ── Island bar — L-shaped, front faces room center (-X), bartender space behind (+X toward wall) ── */}
      <BarIsland position={[2.5, 0, -1.5]} />

      {/* ── Back shelf with bottles — flat against right wall, rotated 90° so shelves run along Z ── */}
      <BackShelf position={[HALF_W - 0.15, 0, -1.5]} rotation={[0, -Math.PI / 2, 0]} />

      {/* ── Counter stools — in front of the island bar (on -X side facing room center) ── */}
      <CounterStool position={[1.5, 0, -2.8]} />
      <CounterStool position={[1.5, 0, -1.5]} />
      <CounterStool position={[1.5, 0, -0.2]} />

      {/* Counter props on bar top — lowered to match H=0.38 */}
      <CounterProps position={[2.5, 0.38, -0.5]} />
      <CounterProps position={[2.5, 0.38, -2.2]} />

      {/* ── Arcade Machines ── */}
      <InteractableObject onInteract={() => useUIStore.getState().setComputerIframeOpen(true)} occludeHighlight={false} interactDistance={2.5}>
        <ArcadeMachine position={[-HALF_W + 0.6, 0.05, 2.5]} rotation={[0, Math.PI / 5, 0]} theme="fighter" />
      </InteractableObject>
      <InteractableObject onInteract={() => useUIStore.getState().setComputerIframeOpen(true)} occludeHighlight={false} interactDistance={2.5}>
        <ArcadeMachine position={[-HALF_W + 0.6, 0.05, 1.5]} rotation={[0, Math.PI / 4, 0]} theme="racer" />
      </InteractableObject>

      {/* ── Booth seating — along left wall (no tables, open floor) ── */}
      <DinerBooth
        position={[-HALF_W + 0.35, 0, -2.2]}
        rotation={[0, Math.PI / 2, 0]}
        width={1.6}
      />
      <DinerBooth
        position={[-HALF_W + 0.35, 0, 0.0]}
        rotation={[0, Math.PI / 2, 0]}
        width={1.6}
      />

      {/* ── Stage — along front wall (+Z), facing into room ── */}
      <group position={[0, 0, HALF_D - STAGE_D / 2 - 0.05]}>
        <Stage />
      </group>

      {/* ── Jukebox — back-center wall, slightly left ── */}
      <InteractableObject
        interactDistance={2.5}
        onInteract={() => useUIStore.getState().setPlaylistOpen(true)}
      >
        <JukeboxMachine position={[-0.6, 0, -(HALF_D - 0.3)]} />
      </InteractableObject>

      {/* ── Lighting ── bright cheerful 60s diner ── */}

      {/* Ambient — warmer and brighter for retro feel */}
      <ambientLight intensity={0.35} color="#ffeecc" />

      {/* Main ceiling light — centre of room */}
      <pointLight position={[0, WALL_HEIGHT - 0.2, 0]} intensity={1.0} color="#ffddbb" distance={9} decay={2} />

      {/* Bar island area — warm bright overhead */}
      <pointLight position={[2.5, WALL_HEIGHT - 0.2, -1.5]} intensity={1.3} color="#ffddaa" distance={5} decay={2} />

      {/* Back shelf area — warm glow to show off bottles */}
      <pointLight position={[HALF_W - 0.3, 1.2, -1.5]} intensity={0.7} color="#ffcc88" distance={3} decay={2} />

      {/* Stage wash — single warm overhead fill at stage center */}
      <pointLight
        position={[0.3, WALL_HEIGHT - 0.2, HALF_D - STAGE_D / 2 - 0.05]}
        intensity={2.5}
        color="#fff4cc"
        distance={4.0}
        decay={2}
      />

      {/* Jukebox glow — warm amber + pink */}
      <pointLight position={[-0.6, 1.2, -(HALF_D - 0.8)]} intensity={1.8} color="#ffaa22" distance={4} decay={2} />
      <pointLight position={[-0.6, 0.6, -(HALF_D - 0.6)]} intensity={0.8} color="#ff44aa" distance={2.5} decay={2} />

      {/* Neon sign glow — pink spill from right wall above shelf */}
      <pointLight position={[HALF_W - 0.6, WALL_HEIGHT * 0.72, -1.5]} intensity={2.0} color="#ff3388" distance={4.5} decay={2} />

      {/* Screen glow — blue-white */}
      <pointLight position={[1.8, WALL_HEIGHT * 0.68, -(HALF_D - 0.5)]} intensity={0.4} color="#88aaff" distance={3} decay={2} />
    </group>
  )
}
