import { useRef, useState, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { useGameStore, getPlayerPosition } from '../stores/gameStore'
import { useBoothStore } from '../stores/boothStore'
import { useUIStore } from '../stores/uiStore'
import { TvStaticFloorMaterial, FLOOR_SEGMENTS } from '../shaders/TvStaticFloor'
import { TrampolineGrid } from '../shaders/TrampolineGrid'
import { TrippySky } from '../shaders/TrippySky'
import { BrickWallMaterial } from '../shaders/BrickWallMaterial'
import { getDisplacementAt } from './TrampolineRipples'
import { InteractableObject } from './InteractableObject'
import './SpottedEggMaterial'

interface RoomProps {
  videoTexture?: THREE.VideoTexture | null
  slideshowTexture?: THREE.Texture | null
}

const ROOM_SIZE = 12
const WALL_HEIGHT = 3
const FLOOR_COLOR = '#f5d442'
const WORLD_SCALE = 0.01

// Booth position in world coords (exported for interaction logic)
const HALF = ROOM_SIZE / 2
export const BOOTH_WORLD_Z = -(HALF - 2.5)
export const BOOTH_WORLD_X = 0

// 3 fixed DJ slot positions (world-X offsets from booth center)
// Slot 0 = left, Slot 1 = center, Slot 2 = right
export const DJ_SLOT_OFFSETS_X = [-1.0, 0, 1.0] as const
export const MAX_DJ_SLOTS = 3

// Spot colors per egg (different color spots on each white egg)
const EGG_SPOT_COLORS = ['#22aa44', '#cc3388', '#3388dd'] as const

// Z offset behind booth for the orbs (booth is rotated 180°, so +Z local = behind = toward back wall)
const ORB_BEHIND_Z = 0.8
const ORB_FLOAT_Y = 0.25

// Returns world-X offset for teleporting. Booth is rotated 180° so local X is negated in world space.
export function getDJSlotWorldX(slotIndex: number): number {
  return -(DJ_SLOT_OFFSETS_X[slotIndex] ?? 0)
}

const FADE_SPEED = 6 // opacity lerp speed
const OCCLUDE_OPACITY = 0.08 // near-invisible when blocking

const raycaster = new THREE.Raycaster()
const playerWorldPos = new THREE.Vector3()
const _scratchDir = new THREE.Vector3()

// Single laptop on the desk at a given X offset
function Laptop({
  xOffset,
  screenColor = '#3344aa',
  bodyColor = '#222222',
}: {
  xOffset: number
  screenColor?: string
  bodyColor?: string
}) {
  const TABLE_Y = 0.38

  return (
    <group position={[xOffset, TABLE_Y + 0.01, 0.02]}>
      {/* Base / palmrest */}
      <mesh>
        <boxGeometry args={[0.36, 0.015, 0.25]} />
        <meshStandardMaterial color={bodyColor} metalness={0.3} roughness={0.6} />
      </mesh>

      {/* Keyboard inset */}
      <mesh position={[0, 0.009, 0.02]}>
        <boxGeometry args={[0.28, 0.002, 0.14]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* Screen lid — hinged at the rear edge, angled ~105° open */}
      <group position={[0, 0.008, -0.12]} rotation={[-0.5, 0, 0]}>
        {/* Lid back */}
        <mesh position={[0, 0.11, 0]}>
          <boxGeometry args={[0.36, 0.22, 0.012]} />
          <meshStandardMaterial color={bodyColor} metalness={0.3} roughness={0.6} />
        </mesh>

        {/* Screen face */}
        <mesh position={[0, 0.11, 0.007]}>
          <planeGeometry args={[0.3, 0.18]} />
          <meshStandardMaterial
            color={screenColor}
            emissive={screenColor}
            emissiveIntensity={0.4}
          />
        </mesh>
      </group>
    </group>
  )
}

// Spotted egg for a DJ slot — uses InteractableObject for highlight + click.
// Hidden entirely when a player occupies this slot.
function DJSlotOrb({
  slotIndex,
  xOffset,
  spotColor,
  occupied,
}: {
  slotIndex: number
  xOffset: number
  spotColor: string
  occupied: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const baseY = ORB_FLOAT_Y

  // Gentle bob + slow rotation
  useFrame((_, delta) => {
    if (!meshRef.current) return

    const t = performance.now() * 0.001
    meshRef.current.position.y = baseY + Math.sin(t * 1.5 + slotIndex * 2.1) * 0.03
    meshRef.current.rotation.y += delta * 0.3
  })

  const handleInteract = useCallback(() => {
    const booth = useBoothStore.getState()

    // Already connected / in queue
    if (booth.isConnected || booth.isInQueue) return

    // Queue full
    if (booth.djQueue.length >= MAX_DJ_SLOTS) return

    // Slot already taken
    if (booth.djQueue.some((e) => e.slotIndex === slotIndex)) return

    useUIStore.getState().setBoothPromptOpen(true, slotIndex)
  }, [slotIndex])

  // Hide egg when a player is sitting here
  if (occupied) return null

  return (
    <InteractableObject interactDistance={2.2} onInteract={handleInteract}>
      <group position={[xOffset, 0, ORB_BEHIND_Z]}>
        <mesh ref={meshRef} position={[0, baseY, 0]}>
          <sphereGeometry args={[0.2, 20, 16]} />
          <spottedEggMaterial spotColor={spotColor} />
        </mesh>
      </group>
    </InteractableObject>
  )
}

// DJ booth — light gray desk with 3 laptops, mixer, speaker amp stacks, spotted egg slot orbs
function DJBooth({ position }: { position: [number, number, number] }) {
  const TABLE_Y = 0.38
  const TABLE_W = 2.8
  const TABLE_D = 0.7

  const AMP_X = 1.85 // amp stacks placed outside the table
  const AMP_D = 0.55

  const djQueue = useBoothStore((s) => s.djQueue)
  const occupiedSlots = new Set(djQueue.map((e) => e.slotIndex))

  return (
    <group position={position}>
      {/* === Foldable table (light gray) === */}
      <mesh position={[0, TABLE_Y, 0]}>
        <boxGeometry args={[TABLE_W, 0.03, TABLE_D]} />
        <meshStandardMaterial color="#b0b0b0" roughness={0.6} metalness={0.05} />
      </mesh>

      {/* Table legs */}
      {[
        [-TABLE_W / 2 + 0.06, 0, -TABLE_D / 2 + 0.06],
        [TABLE_W / 2 - 0.06, 0, -TABLE_D / 2 + 0.06],
        [-TABLE_W / 2 + 0.06, 0, TABLE_D / 2 - 0.06],
        [TABLE_W / 2 - 0.06, 0, TABLE_D / 2 - 0.06],
      ].map(([lx, _, lz], i) => (
        <mesh key={`leg-${i}`} position={[lx, TABLE_Y / 2, lz]}>
          <boxGeometry args={[0.04, TABLE_Y, 0.04]} />
          <meshStandardMaterial color="#777777" metalness={0.3} roughness={0.6} />
        </mesh>
      ))}

      {/* Cross brace under table */}
      <mesh position={[0, TABLE_Y * 0.3, 0]}>
        <boxGeometry args={[TABLE_W - 0.2, 0.02, 0.02]} />
        <meshStandardMaterial color="#888888" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* === 3 Laptops (left, center, right) === */}
      <Laptop xOffset={-0.85} screenColor="#3344aa" />
      <Laptop xOffset={0.35} screenColor="#3344aa" bodyColor="#c0c0c8" />
      <Laptop xOffset={1.1} screenColor="#3344aa" />

      {/* === Mixer — on the desk, left side === */}
      <group position={[-0.2, 0, 0]}>
        <mesh position={[0, TABLE_Y + 0.03, 0]}>
          <boxGeometry args={[0.35, 0.04, 0.28]} />
          <meshStandardMaterial color="#1a1a2e" />
        </mesh>

        {/* Mixer faders */}
        {[-0.07, 0, 0.07].map((fx, i) => (
          <mesh key={`fader-${i}`} position={[fx, TABLE_Y + 0.054, 0]}>
            <boxGeometry args={[0.025, 0.006, 0.18]} />
            <meshStandardMaterial color="#444466" />
          </mesh>
        ))}

        {/* Mixer knobs */}
        {[
          [-0.1, 0.1],
          [0, 0.1],
          [0.1, 0.1],
          [-0.1, -0.08],
          [0.1, -0.08],
        ].map(([kx, kz], i) => (
          <mesh
            key={`knob-${i}`}
            position={[kx, TABLE_Y + 0.058, kz]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.015, 0.015, 0.012, 8]} />
            <meshStandardMaterial color="#666688" metalness={0.5} roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* === Headphones (draped on right table edge) === */}
      <mesh position={[-1.15, TABLE_Y + 0.05, 0.12]} rotation={[0, 0.3, Math.PI / 2]}>
        <torusGeometry args={[0.07, 0.01, 8, 12, Math.PI]} />
        <meshStandardMaterial color="#222222" />
      </mesh>

      <mesh position={[-1.15, TABLE_Y + 0.01, 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.02, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      <mesh position={[-1.15, TABLE_Y + 0.01, 0.19]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.02, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* === Speaker amp stack (left) === */}
      {/* Bottom cabinet (larger) */}
      <mesh position={[-AMP_X, 0.35, 0]}>
        <boxGeometry args={[0.65, 0.7, AMP_D]} />
        <meshStandardMaterial color="#0d0d1a" />
      </mesh>

      {/* Top cabinet (smaller) */}
      <mesh position={[-AMP_X, 0.85, 0]}>
        <boxGeometry args={[0.65, 0.4, AMP_D]} />
        <meshStandardMaterial color="#111122" />
      </mesh>

      {/* Speaker cones — bottom cab */}
      <mesh position={[-AMP_X, 0.35, AMP_D / 2 + 0.01]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.24, 0.03, 12]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      {/* Speaker cone — top cab */}
      <mesh position={[-AMP_X, 0.85, AMP_D / 2 + 0.01]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.03, 12]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      {/* === Speaker amp stack (right) === */}
      <mesh position={[AMP_X, 0.35, 0]}>
        <boxGeometry args={[0.65, 0.7, AMP_D]} />
        <meshStandardMaterial color="#0d0d1a" />
      </mesh>

      <mesh position={[AMP_X, 0.85, 0]}>
        <boxGeometry args={[0.65, 0.4, AMP_D]} />
        <meshStandardMaterial color="#111122" />
      </mesh>

      <mesh position={[AMP_X, 0.35, AMP_D / 2 + 0.01]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.24, 0.03, 12]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      <mesh position={[AMP_X, 0.85, AMP_D / 2 + 0.01]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.03, 12]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      {/* === Spotted egg DJ slot markers (behind booth) === */}
      {DJ_SLOT_OFFSETS_X.map((xOff, i) => (
        <DJSlotOrb
          key={`orb-${i}`}
          slotIndex={i}
          xOffset={xOff}
          spotColor={EGG_SPOT_COLORS[i]}
          occupied={occupiedSlots.has(i)}
        />
      ))}
    </group>
  )
}

// Sofa — chunky couch with seat cushions, back rest, and arm rests
function Sofa({
  position,
  rotation = [0, 0, 0],
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
}) {
  const SEAT_H = 0.38
  const SEAT_W = 1.8
  const SEAT_D = 0.7
  const BACK_H = 0.5
  const ARM_W = 0.15

  return (
    <group position={position} rotation={rotation}>
      {/* Seat base */}
      <mesh position={[0, SEAT_H / 2, 0]}>
        <boxGeometry args={[SEAT_W, SEAT_H, SEAT_D]} />
        <meshStandardMaterial color="#4a2040" />
      </mesh>

      {/* Seat cushions (two side-by-side) */}
      <mesh position={[-0.4, SEAT_H + 0.06, 0.02]}>
        <boxGeometry args={[0.75, 0.12, SEAT_D - 0.08]} />
        <meshStandardMaterial color="#5c2850" />
      </mesh>

      <mesh position={[0.4, SEAT_H + 0.06, 0.02]}>
        <boxGeometry args={[0.75, 0.12, SEAT_D - 0.08]} />
        <meshStandardMaterial color="#5c2850" />
      </mesh>

      {/* Back rest */}
      <mesh position={[0, SEAT_H + BACK_H / 2, -SEAT_D / 2 + 0.08]}>
        <boxGeometry args={[SEAT_W - 0.04, BACK_H, 0.18]} />
        <meshStandardMaterial color="#4a2040" />
      </mesh>

      {/* Back cushions */}
      <mesh position={[-0.4, SEAT_H + BACK_H / 2, -SEAT_D / 2 + 0.18]}>
        <boxGeometry args={[0.7, BACK_H - 0.1, 0.08]} />
        <meshStandardMaterial color="#5c2850" />
      </mesh>

      <mesh position={[0.4, SEAT_H + BACK_H / 2, -SEAT_D / 2 + 0.18]}>
        <boxGeometry args={[0.7, BACK_H - 0.1, 0.08]} />
        <meshStandardMaterial color="#5c2850" />
      </mesh>

      {/* Left arm rest */}
      <mesh position={[-SEAT_W / 2 + ARM_W / 2, SEAT_H + 0.15, 0]}>
        <boxGeometry args={[ARM_W, 0.3, SEAT_D]} />
        <meshStandardMaterial color="#3d1a35" />
      </mesh>

      {/* Right arm rest */}
      <mesh position={[SEAT_W / 2 - ARM_W / 2, SEAT_H + 0.15, 0]}>
        <boxGeometry args={[ARM_W, 0.3, SEAT_D]} />
        <meshStandardMaterial color="#3d1a35" />
      </mesh>

      {/* Stubby legs (4) */}
      {[
        [-SEAT_W / 2 + 0.1, -SEAT_D / 2 + 0.08],
        [SEAT_W / 2 - 0.1, -SEAT_D / 2 + 0.08],
        [-SEAT_W / 2 + 0.1, SEAT_D / 2 - 0.08],
        [SEAT_W / 2 - 0.1, SEAT_D / 2 - 0.08],
      ].map(([lx, lz], i) => (
        <mesh key={`sofa-leg-${i}`} position={[lx, 0.04, lz]}>
          <cylinderGeometry args={[0.03, 0.04, 0.08, 6]} />
          <meshStandardMaterial color="#1a0a15" />
        </mesh>
      ))}
    </group>
  )
}

// Potted plant — terracotta pot with leafy sphere
function PottedPlant({
  position,
  scale = 1,
}: {
  position: [number, number, number]
  scale?: number
}) {
  return (
    <group position={position} scale={[scale, scale, scale]}>
      {/* Pot */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.15, 0.12, 0.3, 8]} />
        <meshStandardMaterial color="#b35c2a" />
      </mesh>

      {/* Pot rim */}
      <mesh position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.17, 0.15, 0.04, 8]} />
        <meshStandardMaterial color="#c46830" />
      </mesh>

      {/* Soil */}
      <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.13, 8]} />
        <meshStandardMaterial color="#2a1a0e" />
      </mesh>

      {/* Stem */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.015, 0.02, 0.3, 4]} />
        <meshStandardMaterial color="#2d5a1e" />
      </mesh>

      {/* Foliage — cluster of spheres */}
      <mesh position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.2, 8, 6]} />
        <meshStandardMaterial color="#2e6e1a" />
      </mesh>

      <mesh position={[0.12, 0.62, 0.08]}>
        <sphereGeometry args={[0.14, 6, 5]} />
        <meshStandardMaterial color="#3a7a22" />
      </mesh>

      <mesh position={[-0.1, 0.65, -0.06]}>
        <sphereGeometry args={[0.13, 6, 5]} />
        <meshStandardMaterial color="#267018" />
      </mesh>

      <mesh position={[0.04, 0.78, -0.04]}>
        <sphereGeometry args={[0.11, 6, 5]} />
        <meshStandardMaterial color="#3a8025" />
      </mesh>
    </group>
  )
}

// Water station — stand with a big water jug on top and a tap
function WaterStation({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Base stand */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.35, 0.8, 0.35]} />
        <meshStandardMaterial color="#d8d8d8" />
      </mesh>

      {/* Drip tray */}
      <mesh position={[0, 0.02, 0.12]}>
        <boxGeometry args={[0.22, 0.04, 0.12]} />
        <meshStandardMaterial color="#888888" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Tap nozzle */}
      <mesh position={[0, 0.55, 0.18]}>
        <boxGeometry args={[0.06, 0.04, 0.06]} />
        <meshStandardMaterial color="#aaaaaa" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Water jug (inverted — wide top, narrow neck into stand) */}
      {/* Jug body */}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.6, 10]} />
        <meshStandardMaterial color="#c8e8ff" transparent opacity={0.5} />
      </mesh>

      {/* Jug cap */}
      <mesh position={[0, 1.42, 0]}>
        <sphereGeometry args={[0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#c0e0f8" transparent opacity={0.45} />
      </mesh>

      {/* Jug neck (narrow, going into stand) */}
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.08, 8]} />
        <meshStandardMaterial color="#b8d8f0" transparent opacity={0.4} />
      </mesh>

      {/* Water level inside */}
      <mesh position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.38, 10]} />
        <meshStandardMaterial color="#4488cc" transparent opacity={0.3} />
      </mesh>
    </group>
  )
}

// Old beige Dell tower + CRT monitor on a desk
function OldComputerDesk({
  position,
  rotation = [0, 0, 0],
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
}) {
  const DESK_H = 0.7
  const DESK_W = 1.0
  const DESK_D = 0.55

  return (
    <group position={position} rotation={rotation}>
      {/* === Desk === */}
      {/* Desk top */}
      <mesh position={[0, DESK_H, 0]}>
        <boxGeometry args={[DESK_W, 0.03, DESK_D]} />
        <meshStandardMaterial color="#c8b898" />
      </mesh>

      {/* Desk legs (4) */}
      {[
        [-DESK_W / 2 + 0.04, -DESK_D / 2 + 0.04],
        [DESK_W / 2 - 0.04, -DESK_D / 2 + 0.04],
        [-DESK_W / 2 + 0.04, DESK_D / 2 - 0.04],
        [DESK_W / 2 - 0.04, DESK_D / 2 - 0.04],
      ].map(([lx, lz], i) => (
        <mesh key={`desk-leg-${i}`} position={[lx, DESK_H / 2, lz]}>
          <boxGeometry args={[0.04, DESK_H, 0.04]} />
          <meshStandardMaterial color="#a89878" />
        </mesh>
      ))}

      {/* === Dell Tower (beige, on the floor beside desk) === */}
      <mesh position={[DESK_W / 2 + 0.2, 0.28, 0]}>
        <boxGeometry args={[0.2, 0.56, 0.45]} />
        <meshStandardMaterial color="#d4c8a8" />
      </mesh>

      {/* Tower front panel detail */}
      <mesh position={[DESK_W / 2 + 0.2, 0.35, 0.226]}>
        <planeGeometry args={[0.16, 0.3]} />
        <meshStandardMaterial color="#c8bc98" />
      </mesh>

      {/* Floppy drive slot */}
      <mesh position={[DESK_W / 2 + 0.2, 0.48, 0.227]}>
        <planeGeometry args={[0.12, 0.015]} />
        <meshStandardMaterial color="#888880" />
      </mesh>

      {/* CD drive slot */}
      <mesh position={[DESK_W / 2 + 0.2, 0.42, 0.227]}>
        <planeGeometry args={[0.12, 0.02]} />
        <meshStandardMaterial color="#a09888" />
      </mesh>

      {/* Power button */}
      <mesh position={[DESK_W / 2 + 0.2, 0.52, 0.228]}>
        <circleGeometry args={[0.015, 8]} />
        <meshStandardMaterial color="#606060" />
      </mesh>

      {/* Power LED */}
      <mesh position={[DESK_W / 2 + 0.2, 0.5, 0.228]}>
        <circleGeometry args={[0.006, 6]} />
        <meshStandardMaterial color="#44cc44" emissive="#22aa22" emissiveIntensity={0.8} />
      </mesh>

      {/* === CRT Monitor === */}
      {/* Monitor body (deep, boxy) */}
      <mesh position={[0, DESK_H + 0.2, -0.05]}>
        <boxGeometry args={[0.45, 0.38, 0.38]} />
        <meshStandardMaterial color="#d0c4a4" />
      </mesh>

      {/* Screen bezel */}
      <mesh position={[0, DESK_H + 0.22, 0.14]}>
        <boxGeometry args={[0.42, 0.34, 0.02]} />
        <meshStandardMaterial color="#b8ac90" />
      </mesh>

      {/* Screen display (slightly recessed, glowing) */}
      <mesh position={[0, DESK_H + 0.22, 0.151]}>
        <planeGeometry args={[0.34, 0.26]} />
        <meshStandardMaterial color="#1a3322" emissive="#0a2210" emissiveIntensity={0.6} />
      </mesh>

      {/* CRT hump (the bulge at the back) */}
      <mesh position={[0, DESK_H + 0.2, -0.28]}>
        <sphereGeometry args={[0.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#c8bc9c" />
      </mesh>

      {/* Monitor stand/base */}
      <mesh position={[0, DESK_H + 0.015, 0]}>
        <boxGeometry args={[0.28, 0.03, 0.25]} />
        <meshStandardMaterial color="#c0b498" />
      </mesh>

      {/* === Keyboard === */}
      <mesh position={[0, DESK_H + 0.02, 0.2]}>
        <boxGeometry args={[0.38, 0.02, 0.12]} />
        <meshStandardMaterial color="#d4c8a8" />
      </mesh>

      {/* Key area */}
      <mesh position={[0, DESK_H + 0.031, 0.2]}>
        <planeGeometry args={[0.34, 0.09]} />
        <meshStandardMaterial color="#c0b498" />
      </mesh>

      {/* === Mouse === */}
      <mesh position={[0.28, DESK_H + 0.015, 0.2]}>
        <boxGeometry args={[0.05, 0.02, 0.08]} />
        <meshStandardMaterial color="#d4c8a8" />
      </mesh>

      {/* Mouse button line */}
      <mesh position={[0.28, DESK_H + 0.026, 0.18]}>
        <planeGeometry args={[0.04, 0.002]} />
        <meshStandardMaterial color="#b8ac90" />
      </mesh>

      {/* === Office chair === */}
      {/* Seat */}
      <mesh position={[0, 0.42, 0.45]}>
        <boxGeometry args={[0.4, 0.06, 0.38]} />
        <meshStandardMaterial color="#222222" />
      </mesh>

      {/* Back */}
      <mesh position={[0, 0.7, 0.62]}>
        <boxGeometry args={[0.38, 0.5, 0.04]} />
        <meshStandardMaterial color="#222222" />
      </mesh>

      {/* Chair post */}
      <mesh position={[0, 0.24, 0.45]}>
        <cylinderGeometry args={[0.025, 0.025, 0.36, 6]} />
        <meshStandardMaterial color="#444444" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Chair base star (5 legs) */}
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i * Math.PI * 2) / 5
        return (
          <mesh
            key={`chair-leg-${i}`}
            position={[Math.sin(angle) * 0.18, 0.04, 0.45 + Math.cos(angle) * 0.18]}
          >
            <boxGeometry args={[0.03, 0.03, 0.2]} />
            <meshStandardMaterial color="#444444" metalness={0.5} roughness={0.4} />
          </mesh>
        )
      })}

      {/* Casters (5 small spheres) */}
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i * Math.PI * 2) / 5
        return (
          <mesh
            key={`caster-${i}`}
            position={[Math.sin(angle) * 0.22, 0.015, 0.45 + Math.cos(angle) * 0.22]}
          >
            <sphereGeometry args={[0.02, 6, 4]} />
            <meshStandardMaterial color="#333333" />
          </mesh>
        )
      })}
    </group>
  )
}

// Video display — screen on the back wall behind the DJ booth
function VideoDisplay({
  position,
  videoTexture,
  slideshowTexture,
}: {
  position: [number, number, number]
  videoTexture?: THREE.VideoTexture | null
  slideshowTexture?: THREE.Texture | null
}) {
  const SCREEN_W = 4.0
  const SCREEN_H = SCREEN_W * (9 / 16)
  const BEZEL = 0.1
  const FRAME_DEPTH = 0.08

  const displayTexture = videoTexture ?? slideshowTexture

  return (
    <group position={position}>
      {/* Frame / bezel */}
      <mesh position={[0, 0, -FRAME_DEPTH / 2]}>
        <boxGeometry args={[SCREEN_W + BEZEL * 2, SCREEN_H + BEZEL * 2, FRAME_DEPTH]} />
        <meshStandardMaterial color="#0a0a0a" />
      </mesh>

      {/* Screen surface */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        {displayTexture ? (
          <meshBasicMaterial map={displayTexture} toneMapped={false} />
        ) : (
          <meshStandardMaterial color="#080812" emissive="#060610" emissiveIntensity={0.3} />
        )}
      </mesh>
    </group>
  )
}

// Door — recessed rectangle with a frame and handle knob
function Door({ position }: { position: [number, number, number] }) {
  const doorWidth = 1.6
  const doorHeight = 2.4

  return (
    <group position={position}>
      {/* Door frame (slightly larger, dark wood color) */}
      <mesh position={[0, doorHeight / 2, 0]}>
        <planeGeometry args={[doorWidth + 0.15, doorHeight + 0.08]} />
        <meshStandardMaterial color="#1a0e08" />
      </mesh>

      {/* Door panel */}
      <mesh position={[0, doorHeight / 2, 0.01]}>
        <planeGeometry args={[doorWidth, doorHeight]} />
        <meshStandardMaterial color="#3d1f0e" />
      </mesh>

      {/* Upper door panel inset */}
      <mesh position={[0, doorHeight * 0.68, 0.02]}>
        <planeGeometry args={[doorWidth * 0.7, doorHeight * 0.28]} />
        <meshStandardMaterial color="#4a2814" />
      </mesh>

      {/* Lower door panel inset */}
      <mesh position={[0, doorHeight * 0.3, 0.02]}>
        <planeGeometry args={[doorWidth * 0.7, doorHeight * 0.32]} />
        <meshStandardMaterial color="#4a2814" />
      </mesh>

      {/* Door handle */}
      <mesh position={[doorWidth * 0.35, doorHeight * 0.45, 0.04]}>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshStandardMaterial color="#c4a44a" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  )
}

// Picture frame — wooden border with image texture (or gray placeholder)
function PictureFrame({
  position,
  rotation,
  size,
  imagePath,
}: {
  position: [number, number, number]
  rotation: [number, number, number]
  size: [number, number]
  imagePath: string
}) {
  const frameDepth = 0.06
  const borderWidth = 0.08
  const [w, h] = size

  // Try loading the image texture; fall back to null on error
  const texture = useRef<THREE.Texture | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loader = new THREE.TextureLoader()

    loader.load(
      imagePath,
      (tex) => {
        tex.minFilter = THREE.NearestFilter
        tex.magFilter = THREE.NearestFilter
        texture.current = tex
        setLoaded(true)
      },
      undefined,
      () => {
        // Image not found — use placeholder
        setLoaded(true)
      }
    )
  }, [imagePath])

  return (
    <group position={position} rotation={rotation}>
      {/* Frame border */}
      <mesh position={[0, 0, -frameDepth / 2]}>
        <boxGeometry args={[w + borderWidth * 2, h + borderWidth * 2, frameDepth]} />
        <meshStandardMaterial color="#2a1506" />
      </mesh>

      {/* Inner image or placeholder */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[w, h]} />
        {texture.current ? (
          <meshBasicMaterial map={texture.current} toneMapped={false} />
        ) : (
          <meshStandardMaterial color={loaded ? '#333' : '#222'} />
        )}
      </mesh>
    </group>
  )
}

// Wrapper that bobs its children with the trampoline ripple at (baseX, baseZ)
function BobbingGroup({
  baseX,
  baseZ,
  children,
}: {
  baseX: number
  baseZ: number
  children: React.ReactNode
}) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!groupRef.current) return

    const dy = getDisplacementAt(baseX, baseZ)
    groupRef.current.position.y = dy

    // Subtle tilt from slope (sample nearby points)
    const eps = 0.3
    const dxSlope = getDisplacementAt(baseX + eps, baseZ) - getDisplacementAt(baseX - eps, baseZ)
    const dzSlope = getDisplacementAt(baseX, baseZ + eps) - getDisplacementAt(baseX, baseZ - eps)

    groupRef.current.rotation.x = -dzSlope * 0.5
    groupRef.current.rotation.z = dxSlope * 0.5
  })

  return <group ref={groupRef}>{children}</group>
}

export function Room({ videoTexture, slideshowTexture }: RoomProps) {
  const half = ROOM_SIZE / 2
  const { camera } = useThree()

  const wallRefs = useRef<THREE.Mesh[]>([])
  const wallOpacities = useRef<number[]>([1, 1, 1, 1])
  const wallAttachmentRefs = useRef<(THREE.Group | null)[]>([null, null, null, null])

  const setWallRef = (index: number) => (mesh: THREE.Mesh | null) => {
    if (mesh) {
      wallRefs.current[index] = mesh
    }
  }

  const setWallAttachmentRef = (index: number) => (group: THREE.Group | null) => {
    wallAttachmentRefs.current[index] = group
  }

  useFrame((_, delta) => {
    const state = useGameStore.getState()
    const myId = state.mySessionId
    if (!myId) return

    const me = state.players.get(myId)
    if (!me) return

    // Player world position
    const pos = getPlayerPosition(myId)
    if (!pos) return
    playerWorldPos.set(pos.x * WORLD_SCALE, 0.5, -pos.y * WORLD_SCALE)

    // Direction from camera to player
    const dir = _scratchDir.copy(playerWorldPos).sub(camera.position).normalize()
    raycaster.set(camera.position, dir)

    const distToPlayer = camera.position.distanceTo(playerWorldPos)

    // Test each wall
    const walls = wallRefs.current

    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i]
      if (!wall) continue

      const mat = wall.material as THREE.ShaderMaterial | THREE.MeshStandardMaterial
      const intersects = raycaster.intersectObject(wall)

      // Wall is blocking if any intersection is between camera and player
      const isBlocking = intersects.some((hit) => hit.distance < distToPlayer)

      const targetOpacity = isBlocking ? OCCLUDE_OPACITY : 1
      const t = 1 - Math.exp(-FADE_SPEED * delta)

      wallOpacities.current[i] += (targetOpacity - wallOpacities.current[i]) * t

      // Support both ShaderMaterial (uOpacity uniform) and MeshStandardMaterial (.opacity)
      if ('uniforms' in mat && mat.uniforms.uOpacity) {
        mat.uniforms.uOpacity.value = wallOpacities.current[i]
      } else {
        ;(mat as THREE.MeshStandardMaterial).opacity = wallOpacities.current[i]
      }

      // Fade wall-mounted objects (TV, picture frames, door) to match
      const attachments = wallAttachmentRefs.current[i]
      if (attachments) {
        const opacity = wallOpacities.current[i]
        attachments.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const m = child.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial
            m.transparent = true
            m.opacity = opacity
          }
        })
      }
    }
  })

  return (
    <group>
      {/* Floor — subdivided for trampoline ripple vertex displacement */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[ROOM_SIZE, ROOM_SIZE, FLOOR_SEGMENTS, FLOOR_SEGMENTS]} />
        <TvStaticFloorMaterial />
      </mesh>

      {/* Grid overlay — custom deforming grid that rides the ripples */}
      <TrampolineGrid roomSize={ROOM_SIZE} />

      {/* Back wall (-Z) */}
      <mesh ref={setWallRef(0)} position={[0, WALL_HEIGHT / 2, -half]}>
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <BrickWallMaterial repeat={[8, 4]} />
      </mesh>

      {/* Wall-mounted objects on back wall */}
      <group ref={setWallAttachmentRef(0)}>
        <VideoDisplay
          position={[0, WALL_HEIGHT * 0.55, -half + 0.02]}
          videoTexture={videoTexture}
          slideshowTexture={slideshowTexture}
        />
      </group>

      {/* Left wall (-X) */}
      <mesh
        ref={setWallRef(1)}
        position={[-half, WALL_HEIGHT / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <BrickWallMaterial repeat={[8, 4]} />
      </mesh>

      {/* Wall-mounted objects on left wall */}
      <group ref={setWallAttachmentRef(1)}>
        <PictureFrame
          position={[-half + 0.01, WALL_HEIGHT * 0.6, -2]}
          rotation={[0, Math.PI / 2, 0]}
          size={[1.2, 0.9]}
          imagePath="/textures/frames/frame1.png"
        />
        <PictureFrame
          position={[-half + 0.01, WALL_HEIGHT * 0.6, 2]}
          rotation={[0, Math.PI / 2, 0]}
          size={[1.2, 0.9]}
          imagePath="/textures/frames/frame2.png"
        />
      </group>

      {/* Right wall (+X) */}
      <mesh
        ref={setWallRef(2)}
        position={[half, WALL_HEIGHT / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <BrickWallMaterial repeat={[8, 4]} />
      </mesh>

      {/* Wall-mounted objects on right wall */}
      <group ref={setWallAttachmentRef(2)}>
        <PictureFrame
          position={[half - 0.01, WALL_HEIGHT * 0.6, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          size={[1.5, 1.0]}
          imagePath="/textures/frames/frame3.png"
        />
      </group>

      {/* Front wall (+Z) — has a door */}
      <mesh ref={setWallRef(3)} position={[0, WALL_HEIGHT / 2, half]}>
        <planeGeometry args={[ROOM_SIZE, WALL_HEIGHT]} />
        <BrickWallMaterial repeat={[8, 4]} />
      </mesh>

      {/* Wall-mounted objects on front wall */}
      <group ref={setWallAttachmentRef(3)}>
        <Door position={[0, 0, half - 0.01]} />
      </group>

      {/* DJ Booth — forward from back wall, rotated to face room */}
      <BobbingGroup baseX={0} baseZ={-(half - 2.5)}>
        <group position={[0, 0, -(half - 2.5)]} rotation={[0, Math.PI, 0]}>
          <DJBooth position={[0, 0, 0]} />
        </group>
      </BobbingGroup>

      {/* Sofa — along right wall, facing inward */}
      <BobbingGroup baseX={half - 0.8} baseZ={1}>
        <Sofa position={[half - 0.8, 0, 1]} rotation={[0, -Math.PI / 2, 0]} />
      </BobbingGroup>

      {/* Potted plants */}
      <BobbingGroup baseX={-half + 0.5} baseZ={half - 0.5}>
        <PottedPlant position={[-half + 0.5, 0, half - 0.5]} scale={1.1} />
      </BobbingGroup>
      <BobbingGroup baseX={half - 0.5} baseZ={-(half - 0.5)}>
        <PottedPlant position={[half - 0.5, 0, -(half - 0.5)]} scale={0.9} />
      </BobbingGroup>
      <BobbingGroup baseX={-half + 0.5} baseZ={-1.5}>
        <PottedPlant position={[-half + 0.5, 0, -1.5]} scale={0.75} />
      </BobbingGroup>

      {/* Water station — left wall, toward front */}
      <BobbingGroup baseX={-half + 0.5} baseZ={2.5}>
        <WaterStation position={[-half + 0.5, 0, 2.5]} />
      </BobbingGroup>

      {/* Old Dell computer desk — back-left corner, facing into room */}
      <BobbingGroup baseX={-(half - 1.2)} baseZ={-(half - 0.8)}>
        <InteractableObject
          interactDistance={2.5}
          onInteract={() => console.log('[Interactable] Computer desk clicked!')}
        >
          <OldComputerDesk
            position={[-(half - 1.2), 0, -(half - 0.8)]}
            rotation={[0, Math.PI / 4, 0]}
          />
        </InteractableObject>
      </BobbingGroup>

      {/* Skybox */}
      <TrippySky />

      {/* Ambient light */}
      <ambientLight intensity={1.0} />

      {/* Directional light */}
      <directionalLight position={[3, 8, 5]} intensity={0.6} />
    </group>
  )
}
