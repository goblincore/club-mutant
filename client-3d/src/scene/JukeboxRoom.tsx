import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

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
  vec3 lower  = vec3(0.48, 0.07, 0.09);
  // Upper: dark warm maroon/wine
  vec3 upper  = vec3(0.32, 0.05, 0.07);
  // Chrome/brass rail
  vec3 chrome = vec3(0.78, 0.68, 0.44);
  // Dark baseboard
  vec3 base   = vec3(0.10, 0.04, 0.04);

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

// ── Diner counter — long chrome + formica service counter ──
function DinerCounter({
  position,
  rotation = [0, 0, 0],
  length = 4.0,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  length?: number
}) {
  const H = 0.92
  const D = 0.55

  return (
    <group position={position} rotation={rotation}>
      {/* Counter top */}
      <mesh position={[0, H, 0]}>
        <boxGeometry args={[length, 0.045, D]} />
        <meshStandardMaterial color="#e0dbd0" roughness={0.35} metalness={0.05} />
      </mesh>

      {/* Chrome edge on counter top */}
      <mesh position={[0, H - 0.008, D / 2 - 0.01]}>
        <boxGeometry args={[length + 0.01, 0.028, 0.018]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.85} roughness={0.15} />
      </mesh>

      {/* Front face — red vinyl panel */}
      <mesh position={[0, H / 2, D / 2]}>
        <boxGeometry args={[length, H, 0.05]} />
        <meshStandardMaterial color="#b81218" roughness={0.7} />
      </mesh>

      {/* Back panel */}
      <mesh position={[0, H / 2, -D / 2]}>
        <boxGeometry args={[length, H, 0.05]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.85} />
      </mesh>

      {/* Chrome foot rail */}
      <mesh position={[0, 0.12, D / 2 + 0.04]}>
        <boxGeometry args={[length - 0.1, 0.022, 0.022]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.85} roughness={0.15} />
      </mesh>
    </group>
  )
}

// ── Counter stool — chrome post + red vinyl seat ──
function CounterStool({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Seat cushion */}
      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.06, 10]} />
        <meshStandardMaterial color="#c0151a" roughness={0.6} />
      </mesh>

      {/* Post */}
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.72, 8]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.85} roughness={0.15} />
      </mesh>

      {/* Foot ring */}
      <mesh position={[0, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.13, 0.012, 6, 14]} />
        <meshStandardMaterial color="#aaaaaa" metalness={0.7} roughness={0.2} />
      </mesh>

      {/* Base */}
      <mesh position={[0, 0.025, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.04, 10]} />
        <meshStandardMaterial color="#c0c2c4" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  )
}

// ── Retro jukebox — tall curved cabinet ──
function JukeboxMachine({ position }: { position: [number, number, number] }) {
  const W = 0.82
  const H = 1.75
  const D = 0.5

  return (
    <group position={position}>
      {/* Main cabinet — warm cherry/wood */}
      <mesh position={[0, H / 2, 0]}>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color="#7a1f10" roughness={0.7} />
      </mesh>

      {/* Rounded dome top */}
      <mesh position={[0, H + 0.12, 0]}>
        <sphereGeometry args={[W * 0.52, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#6a1808" roughness={0.7} />
      </mesh>

      {/* Glowing display arch — yellow/amber */}
      <mesh position={[0, H * 0.78, D / 2 + 0.01]}>
        <planeGeometry args={[W * 0.78, H * 0.22]} />
        <meshStandardMaterial
          color="#ffdd44"
          emissive="#ffaa00"
          emissiveIntensity={1.2}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Chrome trim — top arch */}
      <mesh position={[0, H * 0.9, D / 2 + 0.012]}>
        <boxGeometry args={[W * 0.82, 0.03, 0.01]} />
        <meshStandardMaterial color="#cccccc" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Chrome trim — mid divider */}
      <mesh position={[0, H * 0.62, D / 2 + 0.012]}>
        <boxGeometry args={[W * 0.9, 0.025, 0.01]} />
        <meshStandardMaterial color="#cccccc" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Side chrome fins */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 + 0.01), H * 0.76, 0]}>
          <boxGeometry args={[0.025, H * 0.5, D + 0.02]} />
          <meshStandardMaterial color="#cccccc" metalness={0.9} roughness={0.1} />
        </mesh>
      ))}

      {/* Speaker grille — lower front */}
      <mesh position={[0, H * 0.28, D / 2 + 0.01]}>
        <planeGeometry args={[W * 0.72, H * 0.3]} />
        <meshStandardMaterial color="#1a0808" roughness={0.95} />
      </mesh>

      {/* Grille bars */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[0, H * 0.17 + i * 0.055, D / 2 + 0.018]}>
          <boxGeometry args={[W * 0.62, 0.007, 0.003]} />
          <meshStandardMaterial color="#0d0404" />
        </mesh>
      ))}

      {/* Selection buttons */}
      {[-0.18, -0.06, 0.06, 0.18].map((xOff, i) => (
        <mesh key={i} position={[xOff, H * 0.53, D / 2 + 0.015]}>
          <circleGeometry args={[0.022, 8]} />
          <meshStandardMaterial
            color={['#ff3333', '#33aaff', '#33ff55', '#ffcc00'][i]}
            emissive={['#ff3333', '#33aaff', '#33ff55', '#ffcc00'][i]}
            emissiveIntensity={0.5}
          />
        </mesh>
      ))}

      {/* Coin slot */}
      <mesh position={[W * 0.28, H * 0.53, D / 2 + 0.015]}>
        <boxGeometry args={[0.055, 0.012, 0.008]} />
        <meshStandardMaterial color="#999" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Vinyl record visible through top window */}
      <mesh position={[0, H * 0.78 + 0.01, D / 2 + 0.02]}>
        <circleGeometry args={[0.12, 16]} />
        <meshStandardMaterial color="#111" roughness={0.3} />
      </mesh>
      <mesh position={[0, H * 0.78 + 0.022, D / 2 + 0.02]}>
        <circleGeometry args={[0.035, 12]} />
        <meshStandardMaterial color="#dd3322" roughness={0.7} />
      </mesh>

      {/* Base */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[W + 0.06, 0.1, D + 0.06]} />
        <meshStandardMaterial color="#1a0808" roughness={0.85} />
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

// ── Video display — mounted above the counter like a diner TV ──
function VideoDisplay({
  position,
  videoTexture,
  slideshowTexture,
}: {
  position: [number, number, number]
  videoTexture?: THREE.VideoTexture | null
  slideshowTexture?: THREE.Texture | null
}) {
  const SCREEN_W = 2.2
  const SCREEN_H = SCREEN_W * (9 / 16)
  const displayTexture = videoTexture ?? slideshowTexture

  return (
    <group position={position}>
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
      {/* Boom arm */}
      <mesh position={[0.18, 1.05, 0]} rotation={[0, 0, -Math.PI * 0.12]}>
        <cylinderGeometry args={[0.008, 0.008, 0.45, 6]} />
        <meshStandardMaterial color="#999" metalness={0.8} roughness={0.25} />
      </mesh>
      {/* Mic capsule */}
      <mesh position={[0.35, 1.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.018, 0.07, 10]} />
        <meshStandardMaterial color="#333" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Mic head grille */}
      <mesh position={[0.35, 1.08, -0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <sphereGeometry args={[0.025, 10, 8, 0, Math.PI]} />
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

function SpotlightCone({
  position,
  targetPos,
  color = '#ffffff',
}: {
  position: [number, number, number]
  targetPos: [number, number, number]
  color?: string
}) {
  // Hanging lamp housing
  const lampPos = new THREE.Vector3(...position)
  const tgt = new THREE.Vector3(...targetPos)
  const dir = tgt.clone().sub(lampPos).normalize()
  const up = new THREE.Vector3(0, -1, 0)
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir)
  const euler = new THREE.Euler().setFromQuaternion(q)

  return (
    <group position={position}>
      {/* Lamp housing — can-shaped, depthWrite off so it never occludes characters */}
      <mesh rotation={[euler.x, euler.y, euler.z]} position={[0, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.13, 0.22, 10, 1, true]} />
        <meshStandardMaterial color="#222" roughness={0.7} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Lamp cap */}
      <mesh>
        <cylinderGeometry args={[0.095, 0.095, 0.04, 10]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.8} depthWrite={false} />
      </mesh>
      {/* Emissive light face */}
      <mesh rotation={[euler.x, euler.y, euler.z]} position={[dir.x * 0.11, dir.y * 0.11, dir.z * 0.11]}>
        <circleGeometry args={[0.085, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3.0} depthWrite={false} />
      </mesh>
      {/* Hanging cable */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.4, 4]} />
        <meshStandardMaterial color="#111" roughness={0.9} depthWrite={false} />
      </mesh>
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

      {/* Spotlight rigs — two can lights hanging from ceiling, angled at stage */}
      <SpotlightCone
        position={[-0.8, WALL_HEIGHT - 0.05, HALF_D - 1.8]}
        targetPos={[0.3, STAGE_H + 1.1, HALF_D - STAGE_D * 0.4]}
        color="#fff8cc"
      />
      <SpotlightCone
        position={[0.8, WALL_HEIGHT - 0.05, HALF_D - 1.8]}
        targetPos={[0.3, STAGE_H + 1.1, HALF_D - STAGE_D * 0.4]}
        color="#ffccee"
      />
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
      const isBlocking = raycaster
        .intersectObject(wall)
        .some((hit) => hit.distance < distToPlayer)

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
            m.transparent = true
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

      {/* Back wall attachments: neon sign + video display + posters + vinyl records */}
      <group ref={setWallAttachmentRef(0)}>
        {/* Neon sign — left of center */}
        <NeonSign position={[-2.2, WALL_HEIGHT * 0.72, -HALF_D + 0.04]} />

        {/* Video display — right side of back wall */}
        <VideoDisplay
          position={[1.8, WALL_HEIGHT * 0.68, -HALF_D + 0.05]}
          videoTexture={videoTexture}
          slideshowTexture={slideshowTexture}
        />

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

      {/* Right wall attachments: posters above counter */}
      <group ref={setWallAttachmentRef(2)}>
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

      {/* Front wall attachments: posters flanking the stage */}
      <group ref={setWallAttachmentRef(3)}>
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

      {/* ── Service counter — along right wall, facing room ── */}
      <DinerCounter
        position={[HALF_W - 0.4, 0, -0.5]}
        rotation={[0, Math.PI / 2, 0]}
        length={4.5}
      />

      {/* ── Counter stools — in front of counter ── */}
      <CounterStool position={[HALF_W - 1.3, 0, -2.0]} />
      <CounterStool position={[HALF_W - 1.3, 0, -0.8]} />
      <CounterStool position={[HALF_W - 1.3, 0, 0.4]} />
      <CounterStool position={[HALF_W - 1.3, 0, 1.6]} />

      {/* Counter props */}
      <CounterProps position={[HALF_W - 0.15, 0.92, -1.5]} />
      <CounterProps position={[HALF_W - 0.15, 0.92, 0.8]} />

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

      {/* ── Lighting ── bright cheerful diner ── */}

      {/* Ambient — warm but restrained for moody diner */}
      <ambientLight intensity={0.55} color="#ffeecc" />

      {/* Main ceiling light — centre of room */}
      <pointLight position={[0, WALL_HEIGHT - 0.2, 0]} intensity={2.0} color="#fff5e0" distance={9} decay={2} />

      {/* Counter area overhead */}
      <pointLight position={[HALF_W - 1.0, WALL_HEIGHT - 0.2, -0.5]} intensity={1.5} color="#fff8ec" distance={5} decay={2} />

      {/* Stage spotlights — warm white + rosy pink, aimed at mic stand */}
      <pointLight
        position={[-0.8, WALL_HEIGHT - 0.15, HALF_D - 1.9]}
        intensity={3.5}
        color="#fff8cc"
        distance={4.5}
        decay={2}
      />
      <pointLight
        position={[0.8, WALL_HEIGHT - 0.15, HALF_D - 1.9]}
        intensity={2.5}
        color="#ffccee"
        distance={4.0}
        decay={2}
      />
      {/* Stage floor wash — low warm fill */}
      <pointLight
        position={[0.3, STAGE_H + 0.4, HALF_D - STAGE_D * 0.4]}
        intensity={1.2}
        color="#ffe8aa"
        distance={3.0}
        decay={2}
      />

      {/* Jukebox glow — warm amber + pink */}
      <pointLight position={[-0.6, 1.2, -(HALF_D - 0.8)]} intensity={1.8} color="#ffaa22" distance={4} decay={2} />
      <pointLight position={[-0.6, 0.6, -(HALF_D - 0.6)]} intensity={0.8} color="#ff44aa" distance={2.5} decay={2} />

      {/* Neon sign glow — pink spill */}
      <pointLight position={[-2.2, WALL_HEIGHT * 0.72, -(HALF_D - 0.6)]} intensity={0.6} color="#ff2266" distance={2.5} decay={2} />

      {/* Screen glow — blue-white */}
      <pointLight position={[1.8, WALL_HEIGHT * 0.68, -(HALF_D - 0.5)]} intensity={0.4} color="#88aaff" distance={3} decay={2} />
    </group>
  )
}
