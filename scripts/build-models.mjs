#!/usr/bin/env node
/**
 * Build GLB model files from procedural geometry definitions.
 *
 * Usage:  node scripts/build-models.mjs
 * Output: client-3d/public/models/*.glb
 *
 * Uses @gltf-transform/core to programmatically create GLTF documents.
 * This is the "code → GLB" path. For artist-created models, just export
 * GLB from Blender and drop into client-3d/public/models/.
 */

import { Document, NodeIO, PropertyType } from '@gltf-transform/core'
import { dedup, flatten, join } from '@gltf-transform/functions'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../client-3d/public/models')

// ── Geometry helpers ──

function hexToRGBA(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b, 1.0]
}

/** Generate box vertex data (24 verts, 36 indices) centered at origin. */
function boxGeometry(w, h, d) {
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2

  // prettier-ignore
  const positions = new Float32Array([
    // +Z face
    -hw,-hh, hd,  hw,-hh, hd,  hw, hh, hd, -hw, hh, hd,
    // -Z face
     hw,-hh,-hd, -hw,-hh,-hd, -hw, hh,-hd,  hw, hh,-hd,
    // +Y face
    -hw, hh, hd,  hw, hh, hd,  hw, hh,-hd, -hw, hh,-hd,
    // -Y face
    -hw,-hh,-hd,  hw,-hh,-hd,  hw,-hh, hd, -hw,-hh, hd,
    // +X face
     hw,-hh, hd,  hw,-hh,-hd,  hw, hh,-hd,  hw, hh, hd,
    // -X face
    -hw,-hh,-hd, -hw,-hh, hd, -hw, hh, hd, -hw, hh,-hd,
  ])

  // prettier-ignore
  const normals = new Float32Array([
    0,0,1, 0,0,1, 0,0,1, 0,0,1,
    0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
    0,1,0, 0,1,0, 0,1,0, 0,1,0,
    0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
    1,0,0, 1,0,0, 1,0,0, 1,0,0,
    -1,0,0, -1,0,0, -1,0,0, -1,0,0,
  ])

  // prettier-ignore
  const indices = new Uint16Array([
    0,1,2, 0,2,3,
    4,5,6, 4,6,7,
    8,9,10, 8,10,11,
    12,13,14, 12,14,15,
    16,17,18, 16,18,19,
    20,21,22, 20,22,23,
  ])

  return { positions, normals, indices }
}

/** Generate cylinder vertex data (radialSegments faces). */
function cylinderGeometry(radiusTop, radiusBot, height, segments = 8) {
  const positions = []
  const normals = []
  const indices = []

  const hh = height / 2

  // Side vertices: 2 rings
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)

    // Top ring
    positions.push(radiusTop * sin, hh, radiusTop * cos)
    normals.push(sin, 0, cos)

    // Bottom ring
    positions.push(radiusBot * sin, -hh, radiusBot * cos)
    normals.push(sin, 0, cos)
  }

  // Side indices
  for (let i = 0; i < segments; i++) {
    const a = i * 2
    const b = i * 2 + 1
    const c = i * 2 + 2
    const d = i * 2 + 3
    indices.push(a, b, d, a, d, c)
  }

  // Top cap
  const topCenter = positions.length / 3
  positions.push(0, hh, 0)
  normals.push(0, 1, 0)

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    positions.push(radiusTop * Math.sin(theta), hh, radiusTop * Math.cos(theta))
    normals.push(0, 1, 0)
  }

  for (let i = 0; i < segments; i++) {
    indices.push(topCenter, topCenter + 1 + i, topCenter + 2 + i)
  }

  // Bottom cap
  const botCenter = positions.length / 3
  positions.push(0, -hh, 0)
  normals.push(0, -1, 0)

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    positions.push(radiusBot * Math.sin(theta), -hh, radiusBot * Math.cos(theta))
    normals.push(0, -1, 0)
  }

  for (let i = 0; i < segments; i++) {
    indices.push(botCenter, botCenter + 2 + i, botCenter + 1 + i)
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  }
}

/** Generate a low-poly sphere (UV sphere). thetaStart/thetaLength control vertical range (0→PI = full, 0→PI/2 = top half). */
function sphereGeometry(radius, wSeg = 8, hSeg = 6, thetaStart = 0, thetaLength = Math.PI) {
  const positions = []
  const normals = []
  const indices = []

  for (let y = 0; y <= hSeg; y++) {
    const phi = thetaStart + (y / hSeg) * thetaLength

    for (let x = 0; x <= wSeg; x++) {
      const theta = (x / wSeg) * Math.PI * 2

      const nx = Math.sin(phi) * Math.sin(theta)
      const ny = Math.cos(phi)
      const nz = Math.sin(phi) * Math.cos(theta)

      positions.push(radius * nx, radius * ny, radius * nz)
      normals.push(nx, ny, nz)
    }
  }

  for (let y = 0; y < hSeg; y++) {
    for (let x = 0; x < wSeg; x++) {
      const a = y * (wSeg + 1) + x
      const b = a + wSeg + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  }
}

/** Generate a torus (or partial torus for arc < 2PI). */
function torusGeometry(radius, tube, radialSeg = 8, tubularSeg = 12, arc = Math.PI * 2) {
  const positions = []
  const normals = []
  const indices = []

  for (let j = 0; j <= radialSeg; j++) {
    for (let i = 0; i <= tubularSeg; i++) {
      const u = (i / tubularSeg) * arc
      const v = (j / radialSeg) * Math.PI * 2

      const x = (radius + tube * Math.cos(v)) * Math.cos(u)
      const y = (radius + tube * Math.cos(v)) * Math.sin(u)
      const z = tube * Math.sin(v)

      positions.push(x, y, z)

      const cx = radius * Math.cos(u)
      const cy = radius * Math.sin(u)
      const nx = x - cx,
        ny = y - cy,
        nz = z
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      normals.push(nx / len, ny / len, nz / len)
    }
  }

  for (let j = 0; j < radialSeg; j++) {
    for (let i = 0; i < tubularSeg; i++) {
      const a = j * (tubularSeg + 1) + i
      const b = a + tubularSeg + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  }
}

/** Convert Euler angles (XYZ order) to quaternion [x, y, z, w]. */
function eulerToQuat(rx, ry, rz) {
  const cx = Math.cos(rx / 2),
    sx = Math.sin(rx / 2)
  const cy = Math.cos(ry / 2),
    sy = Math.sin(ry / 2)
  const cz = Math.cos(rz / 2),
    sz = Math.sin(rz / 2)

  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ]
}

// ── GLTF builder helpers ──

function createMeshPrimitive(doc, buffer, geo, material) {
  const posAccessor = doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(geo.positions)

  const normAccessor = doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(geo.normals)

  const idxAccessor = doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(geo.indices)

  return doc
    .createPrimitive()
    .setAttribute('POSITION', posAccessor)
    .setAttribute('NORMAL', normAccessor)
    .setIndices(idxAccessor)
    .setMaterial(material)
}

function addMeshNode(doc, buffer, scene, parent, geo, material, translation, name, rotation) {
  const prim = createMeshPrimitive(doc, buffer, geo, material)
  const mesh = doc.createMesh(name).addPrimitive(prim)

  const node = doc.createNode(name).setMesh(mesh).setTranslation(translation)

  if (rotation) {
    node.setRotation(eulerToQuat(rotation[0], rotation[1], rotation[2]))
  }

  if (parent) {
    parent.addChild(node)
  } else {
    scene.addChild(node)
  }

  return node
}

/** Create an empty group node (no mesh) — for nesting rotated sub-groups. */
function addGroupNode(doc, scene, parent, translation, name, rotation) {
  const node = doc.createNode(name).setTranslation(translation)

  if (rotation) {
    node.setRotation(eulerToQuat(rotation[0], rotation[1], rotation[2]))
  }

  if (parent) {
    parent.addChild(node)
  } else {
    scene.addChild(node)
  }

  return node
}

function makeMaterial(doc, name, hex, opts = {}) {
  const mat = doc
    .createMaterial(name)
    .setBaseColorFactor(hexToRGBA(hex))
    .setMetallicFactor(opts.metallic ?? 0)
    .setRoughnessFactor(opts.roughness ?? 0.9)

  if (opts.emissive) {
    mat.setEmissiveFactor(hexToRGBA(opts.emissive).slice(0, 3))
  }

  return mat
}

/**
 * Generate a hemisphere — the back half of a sphere (z <= 0) with a flat disc cap.
 * The flat face is at z=0, the dome bulges toward -z.
 * Use rotation to orient the flat face in the desired direction.
 */
function hemisphereGeometry(radius, segments = 10, rings = 6) {
  const positions = []
  const normals = []
  const indices = []

  // ── Dome part: half-sphere (theta goes 0→2π, phi goes 0→π/2 from +z pole to equator) ──
  // But we want the dome on -z side and flat face on +z side.
  // Generate a standard half-sphere then the cap.

  // Dome vertices: iterate phi from 0 (north pole, pointing +y? No...)
  // Let's think in terms of: dome center at origin, dome opens toward +z
  // Actually let's just parametrize directly:
  // For each ring (latitude), for each segment (longitude):
  //   x = r * sin(phi) * cos(theta)
  //   y = r * sin(phi) * sin(theta)  [but we want y = up]
  //   z = -r * cos(phi)  [negative so dome goes backward]
  // phi from 0 (back pole) to pi/2 (equator = flat face at z=0)

  for (let ring = 0; ring <= rings; ring++) {
    const phi = (ring / rings) * (Math.PI / 2) // 0 to π/2
    const cosPhi = Math.cos(phi)
    const sinPhi = Math.sin(phi)

    for (let seg = 0; seg <= segments; seg++) {
      const theta = (seg / segments) * Math.PI * 2

      const x = radius * sinPhi * Math.cos(theta)
      const y = radius * sinPhi * Math.sin(theta)
      const z = -radius * cosPhi // dome goes toward -z

      // Normal points outward from sphere center
      const nx = sinPhi * Math.cos(theta)
      const ny = sinPhi * Math.sin(theta)
      const nz = -cosPhi

      positions.push(x, y, z)
      normals.push(nx, ny, nz)
    }
  }

  // Dome indices
  for (let ring = 0; ring < rings; ring++) {
    for (let seg = 0; seg < segments; seg++) {
      const a = ring * (segments + 1) + seg
      const b = a + segments + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  // ── Flat cap disc at z=0 (the equator ring) ──
  const capCenterIdx = positions.length / 3
  // Center vertex
  positions.push(0, 0, 0)
  normals.push(0, 0, 1) // normal points +z (forward, toward viewer)

  // Ring vertices at equator (reuse positions but with +z normal)
  const capRingStart = positions.length / 3
  for (let seg = 0; seg <= segments; seg++) {
    const theta = (seg / segments) * Math.PI * 2
    const x = radius * Math.cos(theta)
    const y = radius * Math.sin(theta)
    positions.push(x, y, 0)
    normals.push(0, 0, 1)
  }

  // Cap triangles (fan from center)
  for (let seg = 0; seg < segments; seg++) {
    indices.push(capCenterIdx, capRingStart + seg + 1, capRingStart + seg)
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  }
}

// ── Model definitions ──

function buildOldComputerDesk(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('OldComputerDesk')
  const root = doc.createNode('Root')
  scene.addChild(root)

  // Constants (matching Room.tsx)
  const DESK_H = 0.7
  const DESK_W = 1.0
  const DESK_D = 0.55

  // Materials
  const deskTop = makeMaterial(doc, 'desk-top', '#c8b898')
  const deskLeg = makeMaterial(doc, 'desk-leg', '#a89878')
  const beige = makeMaterial(doc, 'beige', '#d4c8a8')
  const beigePanel = makeMaterial(doc, 'beige-panel', '#c8bc98')
  const metalGrey = makeMaterial(doc, 'metal-grey', '#888880')
  const driveSlot = makeMaterial(doc, 'drive-slot', '#a09888')
  const darkGrey = makeMaterial(doc, 'dark-grey', '#606060')
  const powerLed = makeMaterial(doc, 'power-led', '#44cc44', { emissive: '#22aa22' })
  const monitorBody = makeMaterial(doc, 'monitor-body', '#d0c4a4')
  const bezel = makeMaterial(doc, 'bezel', '#b8ac90')
  const screen = makeMaterial(doc, 'screen', '#1a3322', { emissive: '#0a2210' })
  const crtHump = makeMaterial(doc, 'crt-hump', '#c8bc9c')
  const stand = makeMaterial(doc, 'stand', '#c0b498')
  const chairBlack = makeMaterial(doc, 'chair-black', '#222222')
  const chairMetal = makeMaterial(doc, 'chair-metal', '#444444', { metallic: 0.5, roughness: 0.4 })
  const casterMat = makeMaterial(doc, 'caster', '#333333')

  // ── Desk ──
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(DESK_W, 0.03, DESK_D),
    deskTop,
    [0, DESK_H, 0],
    'desk-top'
  )

  // Desk legs
  const legOffsets = [
    [-DESK_W / 2 + 0.04, -DESK_D / 2 + 0.04],
    [DESK_W / 2 - 0.04, -DESK_D / 2 + 0.04],
    [-DESK_W / 2 + 0.04, DESK_D / 2 - 0.04],
    [DESK_W / 2 - 0.04, DESK_D / 2 - 0.04],
  ]

  legOffsets.forEach(([lx, lz], i) => {
    addMeshNode(
      doc,
      buffer,
      scene,
      root,
      boxGeometry(0.04, DESK_H, 0.04),
      deskLeg,
      [lx, DESK_H / 2, lz],
      `desk-leg-${i}`
    )
  })

  // ── Dell Tower ──
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.2, 0.56, 0.45),
    beige,
    [DESK_W / 2 + 0.2, 0.28, 0],
    'tower'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.16, 0.3, 0.005),
    beigePanel,
    [DESK_W / 2 + 0.2, 0.35, 0.226],
    'tower-panel'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.12, 0.015, 0.005),
    metalGrey,
    [DESK_W / 2 + 0.2, 0.48, 0.227],
    'floppy-slot'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.12, 0.02, 0.005),
    driveSlot,
    [DESK_W / 2 + 0.2, 0.42, 0.227],
    'cd-slot'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    cylinderGeometry(0.015, 0.015, 0.005, 8),
    darkGrey,
    [DESK_W / 2 + 0.2, 0.52, 0.228],
    'power-btn'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    cylinderGeometry(0.006, 0.006, 0.005, 6),
    powerLed,
    [DESK_W / 2 + 0.2, 0.5, 0.228],
    'power-led'
  )

  // ── CRT Monitor ──
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.45, 0.38, 0.38),
    monitorBody,
    [0, DESK_H + 0.2, -0.05],
    'monitor'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.42, 0.34, 0.02),
    bezel,
    [0, DESK_H + 0.22, 0.14],
    'bezel'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.34, 0.26, 0.005),
    screen,
    [0, DESK_H + 0.22, 0.151],
    'screen'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    sphereGeometry(0.2, 8, 6, 0, Math.PI / 2),
    crtHump,
    [0, DESK_H + 0.2, -0.28],
    'crt-hump'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.28, 0.03, 0.25),
    stand,
    [0, DESK_H + 0.015, 0],
    'monitor-stand'
  )

  // ── Keyboard + Mouse ──
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.38, 0.02, 0.12),
    beige,
    [0, DESK_H + 0.02, 0.2],
    'keyboard'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.34, 0.005, 0.09),
    stand,
    [0, DESK_H + 0.031, 0.2],
    'keys'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.05, 0.02, 0.08),
    beige,
    [0.28, DESK_H + 0.015, 0.2],
    'mouse'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.04, 0.005, 0.002),
    bezel,
    [0.28, DESK_H + 0.026, 0.18],
    'mouse-btn'
  )

  // ── Office Chair ──
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.4, 0.06, 0.38),
    chairBlack,
    [0, 0.42, 0.45],
    'chair-seat'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(0.38, 0.5, 0.04),
    chairBlack,
    [0, 0.7, 0.62],
    'chair-back'
  )
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    cylinderGeometry(0.025, 0.025, 0.36, 6),
    chairMetal,
    [0, 0.24, 0.45],
    'chair-post'
  )

  // Chair base legs
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5
    addMeshNode(
      doc,
      buffer,
      scene,
      root,
      boxGeometry(0.03, 0.03, 0.2),
      chairMetal,
      [Math.sin(angle) * 0.18, 0.04, 0.45 + Math.cos(angle) * 0.18],
      `chair-leg-${i}`
    )
  }

  // Casters
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5
    addMeshNode(
      doc,
      buffer,
      scene,
      root,
      sphereGeometry(0.02, 6, 4),
      casterMat,
      [Math.sin(angle) * 0.22, 0.015, 0.45 + Math.cos(angle) * 0.22],
      `caster-${i}`
    )
  }

  return doc
}

function buildDJBooth(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('DJBooth')
  const root = doc.createNode('Root')
  scene.addChild(root)

  const TABLE_Y = 0.38
  const TABLE_W = 2.8
  const TABLE_D = 0.7
  const AMP_X = 1.85
  const AMP_D = 0.55

  // Materials
  const tableTop = makeMaterial(doc, 'table-top', '#b0b0b0', { roughness: 0.6, metallic: 0.05 })
  const tableLeg = makeMaterial(doc, 'table-leg', '#777777', { metallic: 0.3, roughness: 0.6 })
  const laptopBlack = makeMaterial(doc, 'laptop-black', '#222222', {
    metallic: 0.3,
    roughness: 0.6,
  })
  const laptopSilver = makeMaterial(doc, 'laptop-silver', '#c0c0c8', {
    metallic: 0.3,
    roughness: 0.6,
  })
  const laptopKeys = makeMaterial(doc, 'laptop-keys', '#1a1a1a')
  const laptopScreen = makeMaterial(doc, 'laptop-screen', '#3344aa', { emissive: '#3344aa' })
  const mixerBody = makeMaterial(doc, 'mixer-body', '#1a1a2e')
  const mixerFader = makeMaterial(doc, 'mixer-fader', '#444466')
  const mixerKnob = makeMaterial(doc, 'mixer-knob', '#666688', { metallic: 0.5, roughness: 0.3 })
  const headphoneBlack = makeMaterial(doc, 'hp-black', '#222222')
  const earCup = makeMaterial(doc, 'ear-cup', '#1a1a1a')
  const ampBottom = makeMaterial(doc, 'amp-bottom', '#0d0d1a')
  const ampTop = makeMaterial(doc, 'amp-top', '#111122')
  const speakerCone = makeMaterial(doc, 'speaker-cone', '#1a1a2e')

  // ── Table ──
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(TABLE_W, 0.03, TABLE_D),
    tableTop,
    [0, TABLE_Y, 0],
    'table-top'
  )

  const legPositions = [
    [-TABLE_W / 2 + 0.06, -TABLE_D / 2 + 0.06],
    [TABLE_W / 2 - 0.06, -TABLE_D / 2 + 0.06],
    [-TABLE_W / 2 + 0.06, TABLE_D / 2 - 0.06],
    [TABLE_W / 2 - 0.06, TABLE_D / 2 - 0.06],
  ]

  legPositions.forEach(([lx, lz], i) => {
    addMeshNode(
      doc,
      buffer,
      scene,
      root,
      boxGeometry(0.04, TABLE_Y, 0.04),
      tableLeg,
      [lx, TABLE_Y / 2, lz],
      `table-leg-${i}`
    )
  })

  // ── Laptops ──
  const laptopConfigs = [
    { xOff: 0.85, body: laptopBlack },
    { xOff: -0.35, body: laptopSilver },
    { xOff: -1.1, body: laptopBlack },
  ]

  laptopConfigs.forEach(({ xOff, body }, li) => {
    const laptopGroup = addGroupNode(
      doc,
      scene,
      root,
      [xOff, TABLE_Y + 0.01, -0.02],
      `laptop-${li}`
    )

    // Base / palmrest
    addMeshNode(
      doc,
      buffer,
      scene,
      laptopGroup,
      boxGeometry(0.36, 0.015, 0.25),
      body,
      [0, 0, 0],
      `laptop-base-${li}`
    )

    // Keyboard inset
    addMeshNode(
      doc,
      buffer,
      scene,
      laptopGroup,
      boxGeometry(0.28, 0.002, 0.14),
      laptopKeys,
      [0, 0.009, -0.02],
      `laptop-keys-${li}`
    )

    // Screen lid group (hinged, angled open)
    const lidGroup = addGroupNode(
      doc,
      scene,
      laptopGroup,
      [0, 0.008, 0.12],
      `laptop-lid-${li}`,
      [0.5, 0, 0]
    )

    // Lid back
    addMeshNode(
      doc,
      buffer,
      scene,
      lidGroup,
      boxGeometry(0.36, 0.22, 0.012),
      body,
      [0, 0.11, 0],
      `laptop-lid-back-${li}`
    )

    // Screen face
    addMeshNode(
      doc,
      buffer,
      scene,
      lidGroup,
      boxGeometry(0.3, 0.18, 0.003),
      laptopScreen,
      [0, 0.11, -0.007],
      `laptop-screen-${li}`
    )
  })

  // ── Mixer ──
  const mixerGroup = addGroupNode(doc, scene, root, [0.2, 0, 0], 'mixer-group')

  addMeshNode(
    doc,
    buffer,
    scene,
    mixerGroup,
    boxGeometry(0.35, 0.04, 0.28),
    mixerBody,
    [0, TABLE_Y + 0.03, 0],
    'mixer-body'
  )

  // Faders
  ;[-0.07, 0, 0.07].forEach((fx, i) => {
    addMeshNode(
      doc,
      buffer,
      scene,
      mixerGroup,
      boxGeometry(0.025, 0.006, 0.18),
      mixerFader,
      [fx, TABLE_Y + 0.054, 0],
      `fader-${i}`
    )
  })

  // Knobs
  const knobPositions = [
    [-0.1, -0.1],
    [0, -0.1],
    [0.1, -0.1],
    [-0.1, 0.08],
    [0.1, 0.08],
  ]

  knobPositions.forEach(([kx, kz], i) => {
    addMeshNode(
      doc,
      buffer,
      scene,
      mixerGroup,
      cylinderGeometry(0.015, 0.015, 0.012, 8),
      mixerKnob,
      [kx, TABLE_Y + 0.058, kz],
      `knob-${i}`,
      [-Math.PI / 2, 0, 0]
    )
  })

  // ── Headphones ──
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    torusGeometry(0.07, 0.01, 8, 12, Math.PI),
    headphoneBlack,
    [1.15, TABLE_Y + 0.05, -0.12],
    'hp-band',
    [0, -0.3, Math.PI / 2]
  )

  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    cylinderGeometry(0.035, 0.035, 0.02, 8),
    earCup,
    [1.15, TABLE_Y + 0.01, -0.05],
    'hp-ear-l',
    [-Math.PI / 2, 0, 0]
  )

  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    cylinderGeometry(0.035, 0.035, 0.02, 8),
    earCup,
    [1.15, TABLE_Y + 0.01, -0.19],
    'hp-ear-r',
    [-Math.PI / 2, 0, 0]
  )

  // ── Speaker stacks ──
  ;[AMP_X, -AMP_X].forEach((ampX, si) => {
    const side = si === 0 ? 'L' : 'R'

    // Bottom cabinet
    addMeshNode(
      doc,
      buffer,
      scene,
      root,
      boxGeometry(0.65, 0.7, AMP_D),
      ampBottom,
      [ampX, 0.35, 0],
      `amp-bot-${side}`
    )

    // Top cabinet
    addMeshNode(
      doc,
      buffer,
      scene,
      root,
      boxGeometry(0.65, 0.4, AMP_D),
      ampTop,
      [ampX, 0.85, 0],
      `amp-top-${side}`
    )

    // Bottom speaker cone
    addMeshNode(
      doc,
      buffer,
      scene,
      root,
      cylinderGeometry(0.2, 0.24, 0.03, 12),
      speakerCone,
      [ampX, 0.35, AMP_D / 2 + 0.01],
      `cone-bot-${side}`,
      [-Math.PI / 2, 0, 0]
    )

    // Top speaker cone
    addMeshNode(
      doc,
      buffer,
      scene,
      root,
      cylinderGeometry(0.12, 0.15, 0.03, 12),
      speakerCone,
      [ampX, 0.85, AMP_D / 2 + 0.01],
      `cone-top-${side}`,
      [-Math.PI / 2, 0, 0]
    )
  })

  return doc
}

function buildMagazineRack(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('MagazineRack')
  const root = doc.createNode('Root')
  scene.addChild(root)

  // Rack dimensions
  const RACK_W = 0.85
  const RACK_H = 1.15
  const RACK_D = 0.45
  const SIDE_T = 0.025
  const BACK_T = 0.02
  const SHELF_T = 0.02
  const LIP_H = 0.06
  const LIP_T = 0.015
  const INNER_W = RACK_W - SIDE_T * 2

  const BACK_Z = -RACK_D / 2 + BACK_T / 2

  // Materials — warm wood tones
  const woodDark = makeMaterial(doc, 'wood-dark', '#6B4226', { roughness: 0.75 })
  const woodMed = makeMaterial(doc, 'wood-med', '#8B5E3C', { roughness: 0.7 })
  const woodLight = makeMaterial(doc, 'wood-light', '#A0714F', { roughness: 0.65 })

  // ── Side panels ──
  const sideX = RACK_W / 2 - SIDE_T / 2

  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(SIDE_T, RACK_H, RACK_D),
    woodDark,
    [-sideX, RACK_H / 2, 0],
    'side-L'
  )

  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(SIDE_T, RACK_H, RACK_D),
    woodDark,
    [sideX, RACK_H / 2, 0],
    'side-R'
  )

  // ── Back panel ──
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(RACK_W, RACK_H, BACK_T),
    woodDark,
    [0, RACK_H / 2, BACK_Z],
    'back'
  )

  // ── Base ──
  addMeshNode(
    doc,
    buffer,
    scene,
    root,
    boxGeometry(RACK_W, 0.06, RACK_D),
    woodDark,
    [0, 0.03, 0],
    'base'
  )

  // ── Shelf rows (4 tiers, stepping back progressively) ──
  const shelfRows = [
    { y: 0.1, frontZ: 0.18 },
    { y: 0.36, frontZ: 0.1 },
    { y: 0.62, frontZ: 0.01 },
    { y: 0.88, frontZ: -0.08 },
  ]

  shelfRows.forEach(({ y, frontZ }, i) => {
    const shelfDepth = frontZ - BACK_Z + BACK_T / 2
    const shelfCenterZ = frontZ - shelfDepth / 2

    // Shelf platform
    addMeshNode(
      doc,
      buffer,
      scene,
      root,
      boxGeometry(INNER_W, SHELF_T, shelfDepth),
      woodMed,
      [0, y, shelfCenterZ],
      `shelf-${i}`
    )

    // Lip at front edge
    addMeshNode(
      doc,
      buffer,
      scene,
      root,
      boxGeometry(INNER_W, LIP_H, LIP_T),
      woodLight,
      [0, y + LIP_H / 2, frontZ],
      `lip-${i}`
    )
  })

  return doc
}

// ── Japanese room models ──

function buildWoodenShelf(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('WoodenShelf')
  const root = doc.createNode('Root')
  scene.addChild(root)

  // 3-tier open shelf with desk portion, dark wood
  const SHELF_W = 2.8
  const SHELF_H = 1.8
  const SHELF_D = 0.45
  const POST_T = 0.06
  const PLANK_T = 0.03

  const darkWood = makeMaterial(doc, 'shelf-dark', '#4a2a1a', { roughness: 0.75 })
  const medWood = makeMaterial(doc, 'shelf-med', '#6b4226', { roughness: 0.7 })
  const topWood = makeMaterial(doc, 'shelf-top', '#5c3620', { roughness: 0.72 })

  // 4 vertical posts
  const postX = SHELF_W / 2 - POST_T / 2
  const postZ = SHELF_D / 2 - POST_T / 2
  const postPositions = [
    [-postX, 0, -postZ],
    [postX, 0, -postZ],
    [-postX, 0, postZ],
    [postX, 0, postZ],
  ]

  postPositions.forEach(([px, , pz], i) => {
    addMeshNode(doc, buffer, scene, root,
      boxGeometry(POST_T, SHELF_H, POST_T), darkWood,
      [px, SHELF_H / 2, pz], `post-${i}`)
  })

  // 3 horizontal shelves + top
  const shelfYs = [0.02, 0.55, 1.05, SHELF_H - 0.02]
  shelfYs.forEach((sy, i) => {
    const mat = i === shelfYs.length - 1 ? topWood : medWood
    addMeshNode(doc, buffer, scene, root,
      boxGeometry(SHELF_W - POST_T * 2, PLANK_T, SHELF_D), mat,
      [0, sy, 0], `shelf-${i}`)
  })

  // Back panel (thin board)
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(SHELF_W, SHELF_H, 0.015), darkWood,
    [0, SHELF_H / 2, -SHELF_D / 2 + 0.007], 'back-panel')

  // Desk section: a slightly wider/thicker shelf at desk height (~0.38)
  // This is where the computer sits — already covered by the 0.55 shelf

  return doc
}

function buildRetroComputer(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('RetroComputer')
  const root = doc.createNode('Root')
  scene.addChild(root)

  // Bisected sphere computer — cute pink/purple egg computer
  const shellPink = makeMaterial(doc, 'shell-pink', '#cc66aa', { roughness: 0.3 })
  // Screen: dark base + soft purple-pink emissive glow
  const screenMat = makeMaterial(doc, 'screen', '#110022', { emissive: '#cc88ff', roughness: 0.2 })
  const screenFrame = makeMaterial(doc, 'screen-frame', '#222222', { roughness: 0.8 })
  const slotMat = makeMaterial(doc, 'slot', '#555566', { roughness: 0.7 })
  const baseMat = makeMaterial(doc, 'base', '#ddaacc', { roughness: 0.5 })
  const keyWhite = makeMaterial(doc, 'key-white', '#e8e0e8', { roughness: 0.7 })
  const keyDark = makeMaterial(doc, 'key-dark', '#665566', { roughness: 0.7 })
  const mouseMat = makeMaterial(doc, 'mouse', '#e0d8e0', { roughness: 0.5 })
  const mouseAccent = makeMaterial(doc, 'mouse-btn', '#bb66aa', { roughness: 0.4 })

  // ── Hemisphere body — bisected sphere ──
  // hemisphereGeometry: dome goes toward -z, flat face at z=0
  // We rotate it so flat face points toward +z (toward the viewer/front)
  const R = 0.17
  const CY = R + 0.005 // center height — sits just above ground

  // The dome shell (teal, back half of sphere)
  // hemisphereGeometry generates dome toward -z with flat cap at z=0
  // We want flat face toward +z, so no rotation needed — it already has flat at z=0
  addMeshNode(doc, buffer, scene, root,
    hemisphereGeometry(R, 14, 8), shellPink,
    [0, CY, 0], 'dome')

  // ── Screen: rectangle on the flat front face (z ≈ 0) ──
  // Rectangular screen sits proud on the flat face, slightly in front
  const SCR_W = 0.18
  const SCR_H = 0.14
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(SCR_W, SCR_H, 0.008), screenMat,
    [0, CY + 0.01, 0.005], 'screen')

  // Dark frame/bezel around the screen
  const BEZEL = 0.015
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(SCR_W + BEZEL * 2, SCR_H + BEZEL * 2, 0.004), screenFrame,
    [0, CY + 0.01, 0.001], 'bezel')

  // Disc drive slot below the screen
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.06, 0.003, 0.004), slotMat,
    [0, CY - 0.09, 0.003], 'drive-slot')

  // ── Small foot/stand ──
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(R * 0.45, R * 0.55, 0.012, 8), baseMat,
    [0, 0.006, 0.02], 'base')

  // ── Keyboard ──
  const KB_W = 0.24
  const KB_D = 0.08
  const KB_H = 0.01
  const KB_Z = R + 0.08

  addMeshNode(doc, buffer, scene, root,
    boxGeometry(KB_W, KB_H, KB_D), keyWhite,
    [0, KB_H / 2, KB_Z], 'keyboard')

  for (let r = 0; r < 4; r++) {
    const rowZ = KB_Z - KB_D / 2 + 0.012 + r * 0.016
    addMeshNode(doc, buffer, scene, root,
      boxGeometry(KB_W - 0.04, 0.003, 0.010), keyDark,
      [0, KB_H + 0.001, rowZ], `key-row-${r}`)
  }

  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.08, 0.003, 0.010), keyDark,
    [0, KB_H + 0.001, KB_Z + KB_D / 2 - 0.010], 'spacebar')

  // ── Mouse (hockey puck) ──
  const MOUSE_X = KB_W / 2 + 0.06
  const MOUSE_Z = KB_Z

  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.022, 0.022, 0.012, 8), mouseMat,
    [MOUSE_X, 0.006, MOUSE_Z], 'mouse')

  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.016, 0.012, 0.004, 6), mouseAccent,
    [MOUSE_X, 0.014, MOUSE_Z - 0.003], 'mouse-btn')

  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.004, 0.003, 0.09), slotMat,
    [MOUSE_X - 0.025, 0.003, MOUSE_Z - 0.07], 'mouse-cord')

  return doc
}

function buildTrophy(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('Trophy')
  const root = doc.createNode('Root')
  scene.addChild(root)

  const gold = makeMaterial(doc, 'gold', '#d4a828', { metallic: 0.7, roughness: 0.3 })
  const darkGold = makeMaterial(doc, 'dark-gold', '#a08020', { metallic: 0.6, roughness: 0.4 })

  // Base (wide, flat cylinder)
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.05, 0.06, 0.02, 8), darkGold,
    [0, 0.01, 0], 'base')

  // Neck (thin cylinder)
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.015, 0.025, 0.1, 6), gold,
    [0, 0.07, 0], 'neck')

  // Cup (wider cylinder, tapered)
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.04, 0.02, 0.06, 8), gold,
    [0, 0.15, 0], 'cup')

  // Ball on top
  addMeshNode(doc, buffer, scene, root,
    sphereGeometry(0.02, 6, 4), gold,
    [0, 0.2, 0], 'ball')

  // Small handles (two tiny boxes)
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.01, 0.03, 0.015), gold,
    [-0.05, 0.15, 0], 'handle-L')
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.01, 0.03, 0.015), gold,
    [0.05, 0.15, 0], 'handle-R')

  return doc
}

function buildLowTableVase(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('LowTableVase')
  const root = doc.createNode('Root')
  scene.addChild(root)

  const tableWood = makeMaterial(doc, 'table-wood', '#5c3a1a', { roughness: 0.75 })
  const tableLeg = makeMaterial(doc, 'table-leg', '#4a2e14', { roughness: 0.8 })
  const ceramic = makeMaterial(doc, 'ceramic', '#e8d8c8', { roughness: 0.6 })
  const stem = makeMaterial(doc, 'stem', '#2d5a1e')
  const flowerYellow = makeMaterial(doc, 'flower-yellow', '#f0d020')
  const flowerPink = makeMaterial(doc, 'flower-pink', '#e06080')
  const flowerRed = makeMaterial(doc, 'flower-red', '#cc3344')

  // Low chabudai table
  const TABLE_H = 0.18
  const TABLE_W = 0.7
  const TABLE_D = 0.5
  const LEG_H = TABLE_H - 0.025

  // Table top
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(TABLE_W, 0.025, TABLE_D), tableWood,
    [0, TABLE_H, 0], 'table-top')

  // 4 short legs
  const legX = TABLE_W / 2 - 0.04
  const legZ = TABLE_D / 2 - 0.04
  const legPositions = [[-legX, legZ], [legX, legZ], [-legX, -legZ], [legX, -legZ]]
  legPositions.forEach(([lx, lz], i) => {
    addMeshNode(doc, buffer, scene, root,
      boxGeometry(0.035, LEG_H, 0.035), tableLeg,
      [lx, LEG_H / 2, lz], `leg-${i}`)
  })

  // Ceramic vase (tapered cylinder)
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.03, 0.045, 0.14, 8), ceramic,
    [0.05, TABLE_H + 0.07 + 0.013, 0], 'vase')

  // Vase rim
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.035, 0.03, 0.01, 8), ceramic,
    [0.05, TABLE_H + 0.14 + 0.013, 0], 'vase-rim')

  // Flower stems (thin cylinders)
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.004, 0.004, 0.12, 4), stem,
    [0.05, TABLE_H + 0.2 + 0.013, 0], 'stem-1')
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.004, 0.004, 0.1, 4), stem,
    [0.03, TABLE_H + 0.19 + 0.013, 0.02], 'stem-2')

  // Flower heads (small spheres)
  addMeshNode(doc, buffer, scene, root,
    sphereGeometry(0.025, 6, 4), flowerYellow,
    [0.05, TABLE_H + 0.27 + 0.013, 0], 'flower-1')
  addMeshNode(doc, buffer, scene, root,
    sphereGeometry(0.02, 6, 4), flowerPink,
    [0.03, TABLE_H + 0.25 + 0.013, 0.02], 'flower-2')
  addMeshNode(doc, buffer, scene, root,
    sphereGeometry(0.018, 6, 4), flowerRed,
    [0.07, TABLE_H + 0.24 + 0.013, -0.01], 'flower-3')

  return doc
}

function buildZabuton(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('Zabuton')
  const root = doc.createNode('Root')
  scene.addChild(root)

  const fabric = makeMaterial(doc, 'fabric', '#8b2020', { roughness: 0.95 })
  const border = makeMaterial(doc, 'border', '#6b1818', { roughness: 0.85 })

  // Main cushion body
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.5, 0.06, 0.5), fabric,
    [0, 0.03, 0], 'cushion')

  // Border/piping edges (4 thin strips)
  const halfW = 0.25
  const stripH = 0.065
  const stripT = 0.015

  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.52, stripH, stripT), border,
    [0, 0.03, halfW], 'border-front')
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.52, stripH, stripT), border,
    [0, 0.03, -halfW], 'border-back')
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(stripT, stripH, 0.52), border,
    [halfW, 0.03, 0], 'border-right')
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(stripT, stripH, 0.52), border,
    [-halfW, 0.03, 0], 'border-left')

  return doc
}

function buildToyCar(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('ToyCar')
  const root = doc.createNode('Root')
  scene.addChild(root)

  const bodyRed = makeMaterial(doc, 'body-red', '#cc2020', { roughness: 0.5, metallic: 0.15 })
  const cabinRed = makeMaterial(doc, 'cabin-red', '#dd3030', { roughness: 0.55, metallic: 0.1 })
  const wheelGray = makeMaterial(doc, 'wheel', '#333333', { roughness: 0.8 })
  const bumper = makeMaterial(doc, 'bumper', '#888888', { metallic: 0.4, roughness: 0.5 })
  const windowGray = makeMaterial(doc, 'window', '#444466', { metallic: 0.2, roughness: 0.3 })

  // Main body
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.35, 0.1, 0.2), bodyRed,
    [0, 0.08, 0], 'body')

  // Cabin (upper portion, slightly smaller, set back)
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.2, 0.08, 0.18), cabinRed,
    [-0.02, 0.17, 0], 'cabin')

  // Windshield (thin dark plane on front of cabin)
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.005, 0.06, 0.16), windowGray,
    [0.085, 0.17, 0], 'windshield')

  // Rear window
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.005, 0.05, 0.14), windowGray,
    [-0.12, 0.17, 0], 'rear-window')

  // Front bumper
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.02, 0.04, 0.22), bumper,
    [0.185, 0.05, 0], 'front-bumper')

  // Rear bumper
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.02, 0.04, 0.22), bumper,
    [-0.185, 0.05, 0], 'rear-bumper')

  // 4 wheels
  const wheelR = 0.035
  const wheelW = 0.02
  const wheelPositions = [
    [0.1, 0, 0.11],   // front-right
    [0.1, 0, -0.11],  // front-left
    [-0.1, 0, 0.11],  // rear-right
    [-0.1, 0, -0.11], // rear-left
  ]

  wheelPositions.forEach(([wx, , wz], i) => {
    addMeshNode(doc, buffer, scene, root,
      cylinderGeometry(wheelR, wheelR, wheelW, 8), wheelGray,
      [wx, wheelR, wz], `wheel-${i}`,
      [Math.PI / 2, 0, 0])
  })

  return doc
}

function buildShojiDoor(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('ShojiDoor')
  const root = doc.createNode('Root')
  scene.addChild(root)

  const DOOR_W = 1.6
  const DOOR_H = 2.4
  const FRAME_T = 0.06
  const FRAME_D = 0.04

  const woodFrame = makeMaterial(doc, 'wood-frame', '#3d1f0e', { roughness: 0.75 })
  const paper = makeMaterial(doc, 'paper', '#f5f0e8', { roughness: 0.95 })

  // Outer frame
  // Top rail
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(DOOR_W, FRAME_T, FRAME_D), woodFrame,
    [0, DOOR_H - FRAME_T / 2, 0], 'frame-top')
  // Bottom rail
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(DOOR_W, FRAME_T, FRAME_D), woodFrame,
    [0, FRAME_T / 2, 0], 'frame-bottom')
  // Left stile
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(FRAME_T, DOOR_H, FRAME_D), woodFrame,
    [-DOOR_W / 2 + FRAME_T / 2, DOOR_H / 2, 0], 'frame-left')
  // Right stile
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(FRAME_T, DOOR_H, FRAME_D), woodFrame,
    [DOOR_W / 2 - FRAME_T / 2, DOOR_H / 2, 0], 'frame-right')

  // Center vertical divider
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.03, DOOR_H - FRAME_T * 2, FRAME_D * 0.5), woodFrame,
    [0, DOOR_H / 2, 0], 'divider-v')

  // Horizontal dividers (3 cross bars)
  const crossYs = [DOOR_H * 0.25, DOOR_H * 0.5, DOOR_H * 0.75]
  crossYs.forEach((cy, i) => {
    addMeshNode(doc, buffer, scene, root,
      boxGeometry(DOOR_W - FRAME_T * 2, 0.025, FRAME_D * 0.5), woodFrame,
      [0, cy, 0], `divider-h-${i}`)
  })

  // Paper panels (fill the grid cells — 2 columns × 4 rows = 8 panels)
  const panelW = (DOOR_W - FRAME_T * 2 - 0.03) / 2
  const rowH = (DOOR_H - FRAME_T * 2) / 4

  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 4; row++) {
      const px = col === 0 ? -(panelW / 2 + 0.015) : (panelW / 2 + 0.015)
      const py = FRAME_T + rowH * row + rowH / 2
      addMeshNode(doc, buffer, scene, root,
        boxGeometry(panelW - 0.01, rowH - 0.03, 0.005), paper,
        [px, py, 0], `paper-${col}-${row}`)
    }
  }

  return doc
}

function buildFuton(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('Futon')
  const root = doc.createNode('Root')
  scene.addChild(root)

  // Japanese floor futon/mattress — flat on the ground
  const mattress = makeMaterial(doc, 'mattress', '#eee8dd', { roughness: 0.95 })
  const blanket = makeMaterial(doc, 'blanket', '#cc4455', { roughness: 0.9 })
  const pillow = makeMaterial(doc, 'pillow', '#f0ece0', { roughness: 0.85 })

  // Bottom mattress (shikibuton) — flat white rectangle
  const M_W = 0.75
  const M_D = 1.5
  const M_H = 0.04
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(M_W, M_H, M_D), mattress,
    [0, M_H / 2, 0], 'mattress')

  // Blanket (kakebuton) — covers the lower 2/3, folded back at top
  const B_D = M_D * 0.6
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(M_W - 0.04, 0.02, B_D), blanket,
    [0, M_H + 0.01, M_D / 2 - B_D / 2 - 0.05], 'blanket')

  // Folded edge of blanket at the top
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(M_W - 0.04, 0.035, 0.08), blanket,
    [0, M_H + 0.018, M_D / 2 - B_D - 0.05 + 0.02], 'blanket-fold')

  // Pillow (makura)
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(0.3, 0.06, 0.18), pillow,
    [0, M_H + 0.03, -M_D / 2 + 0.15], 'pillow')

  return doc
}

function buildCandle(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('Candle')
  const root = doc.createNode('Root')
  scene.addChild(root)

  const wax = makeMaterial(doc, 'wax', '#f5e6d0', { roughness: 0.85 })
  const wick = makeMaterial(doc, 'wick', '#222211', { roughness: 0.9 })
  const flame = makeMaterial(doc, 'flame', '#ffaa22', { emissive: '#ffcc44', roughness: 0.1 })
  const flameInner = makeMaterial(doc, 'flame-inner', '#ffeeaa', { emissive: '#ffeecc', roughness: 0.1 })
  const holder = makeMaterial(doc, 'holder', '#8b6b4a', { roughness: 0.7 })
  const dish = makeMaterial(doc, 'dish', '#7a5c3c', { roughness: 0.65 })

  // Small ceramic/wood dish base
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.05, 0.055, 0.012, 8), dish,
    [0, 0.006, 0], 'dish')

  // Candle holder (short cylinder)
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.025, 0.03, 0.015, 8), holder,
    [0, 0.019, 0], 'holder')

  // Wax body (slightly tapered cylinder)
  const WAX_H = 0.08
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.018, 0.022, WAX_H, 8), wax,
    [0, 0.026 + WAX_H / 2, 0], 'wax')

  // Wick (thin cylinder)
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.002, 0.002, 0.02, 4), wick,
    [0, 0.026 + WAX_H + 0.01, 0], 'wick')

  // Flame — outer glow (elongated sphere/diamond)
  addMeshNode(doc, buffer, scene, root,
    sphereGeometry(0.012, 6, 4), flame,
    [0, 0.026 + WAX_H + 0.03, 0], 'flame-outer')

  // Flame — inner bright core (smaller)
  addMeshNode(doc, buffer, scene, root,
    sphereGeometry(0.006, 6, 4), flameInner,
    [0, 0.026 + WAX_H + 0.028, 0], 'flame-inner')

  return doc
}

function buildFloorLamp(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('FloorLamp')
  const root = doc.createNode('Root')
  scene.addChild(root)

  const baseMat = makeMaterial(doc, 'lamp-base', '#2a2a2a', { roughness: 0.6, metallic: 0.3 })
  const poleMat = makeMaterial(doc, 'lamp-pole', '#333333', { roughness: 0.5, metallic: 0.4 })
  const shadeMat = makeMaterial(doc, 'lamp-shade', '#f0ddc0', { roughness: 0.85 })
  const shadeInner = makeMaterial(doc, 'shade-inner', '#ffeecc', { emissive: '#ffcc88', roughness: 0.3 })
  const bulb = makeMaterial(doc, 'bulb', '#fff8e0', { emissive: '#ffddaa', roughness: 0.2 })

  // Heavy circular base
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.12, 0.13, 0.02, 10), baseMat,
    [0, 0.01, 0], 'base')

  // Pole (tall thin cylinder)
  const POLE_H = 1.1
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.015, 0.018, POLE_H, 6), poleMat,
    [0, 0.02 + POLE_H / 2, 0], 'pole')

  // Lampshade — truncated cone (wider at bottom)
  const SHADE_H = 0.22
  const SHADE_TOP = POLE_H + 0.02
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.06, 0.12, SHADE_H, 10), shadeMat,
    [0, SHADE_TOP + SHADE_H / 2, 0], 'shade')

  // Inner shade glow (slightly smaller, inside)
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.055, 0.11, SHADE_H - 0.02, 10), shadeInner,
    [0, SHADE_TOP + SHADE_H / 2, 0], 'shade-glow')

  // Bulb (small sphere inside shade)
  addMeshNode(doc, buffer, scene, root,
    sphereGeometry(0.025, 6, 4), bulb,
    [0, SHADE_TOP + 0.06, 0], 'bulb')

  return doc
}

function buildCeilingLamp(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('CeilingLamp')
  const root = doc.createNode('Root')
  scene.addChild(root)

  // Hanging lamp — origin at the ceiling mount point (top), hangs downward
  const cordMat = makeMaterial(doc, 'cord', '#222222', { roughness: 0.7 })
  const mountMat = makeMaterial(doc, 'mount', '#333333', { metallic: 0.3, roughness: 0.5 })
  const shadeMat = makeMaterial(doc, 'shade', '#e8d0a8', { roughness: 0.85 })
  const shadeInner = makeMaterial(doc, 'shade-inner', '#ffeecc', { emissive: '#ffcc88', roughness: 0.3 })
  const bulb = makeMaterial(doc, 'bulb', '#fff8e0', { emissive: '#ffddaa', roughness: 0.2 })

  // Ceiling mount (small disc flush with ceiling)
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.04, 0.04, 0.02, 8), mountMat,
    [0, -0.01, 0], 'mount')

  // Cord (thin cylinder hanging down)
  const CORD_LEN = 0.5
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.005, 0.005, CORD_LEN, 4), cordMat,
    [0, -(0.02 + CORD_LEN / 2), 0], 'cord')

  // Lampshade — truncated cone, wider at bottom (like a pendant lamp)
  const SHADE_H = 0.18
  const SHADE_Y = -(0.02 + CORD_LEN + SHADE_H / 2)
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.05, 0.14, SHADE_H, 10), shadeMat,
    [0, SHADE_Y, 0], 'shade')

  // Inner shade glow
  addMeshNode(doc, buffer, scene, root,
    cylinderGeometry(0.045, 0.13, SHADE_H - 0.02, 10), shadeInner,
    [0, SHADE_Y, 0], 'shade-glow')

  // Bulb hanging inside the shade
  addMeshNode(doc, buffer, scene, root,
    sphereGeometry(0.025, 6, 4), bulb,
    [0, SHADE_Y + 0.03, 0], 'bulb')

  return doc
}

// ── Main ──

/** Optimize a document by deduplicating materials, flattening hierarchy, and joining meshes. */
async function optimizeDocument(doc) {
  const meshesBefore = doc.getRoot().listMeshes().length

  await doc.transform(
    dedup({ propertyTypes: [PropertyType.MATERIAL, PropertyType.ACCESSOR] }),
    flatten(),
    join({ keepNamed: false })
  )

  const meshesAfter = doc.getRoot().listMeshes().length
  console.log(`  meshes: ${meshesBefore} → ${meshesAfter} (merged by material)`)
}

function buildLowComputerDesk(doc) {
  const buffer = doc.createBuffer()
  const scene = doc.createScene('LowComputerDesk')
  const root = doc.createNode('Root')
  scene.addChild(root)

  const deskWood = makeMaterial(doc, 'desk-wood', '#5c3a1a', { roughness: 0.75 })
  const legWood = makeMaterial(doc, 'desk-leg', '#4a2e14', { roughness: 0.8 })

  // A low Japanese-style desk — wider to fit iMac G3 + keyboard + mouse
  const DESK_H = 0.35
  const DESK_W = 1.1   // wide enough for the computer + peripherals
  const DESK_D = 0.55   // deeper to fit keyboard in front of monitor
  const TOP_THICK = 0.03
  const LEG_THICK = 0.04

  // Table top
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(DESK_W, TOP_THICK, DESK_D), deskWood,
    [0, DESK_H, 0], 'desk-top')

  // 4 legs
  const legH = DESK_H - TOP_THICK / 2
  const legX = DESK_W / 2 - LEG_THICK / 2 - 0.02
  const legZ = DESK_D / 2 - LEG_THICK / 2 - 0.02
  const legs = [[-legX, legZ], [legX, legZ], [-legX, -legZ], [legX, -legZ]]
  legs.forEach(([lx, lz], i) => {
    addMeshNode(doc, buffer, scene, root,
      boxGeometry(LEG_THICK, legH, LEG_THICK), legWood,
      [lx, legH / 2, lz], `desk-leg-${i}`)
  })

  // Small shelf/stretcher between front legs (for extra detail)
  addMeshNode(doc, buffer, scene, root,
    boxGeometry(DESK_W - 0.08, 0.015, DESK_D * 0.6), deskWood,
    [0, DESK_H * 0.35, 0], 'desk-shelf')

  return doc
}

async function buildAndWrite(name, buildFn, filename) {
  console.log(`Building ${name}...`)
  const doc = buildFn(new Document())
  await optimizeDocument(doc)

  const io = new NodeIO()
  const glb = await io.writeBinary(doc)
  const outPath = resolve(OUT_DIR, filename)
  writeFileSync(outPath, Buffer.from(glb))

  const sizeKB = (glb.byteLength / 1024).toFixed(1)
  console.log(`  → ${outPath} (${sizeKB} KB)`)
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  await buildAndWrite('OldComputerDesk', buildOldComputerDesk, 'old-computer-desk.glb')
  await buildAndWrite('DJBooth', buildDJBooth, 'dj-booth.glb')
  await buildAndWrite('MagazineRack', buildMagazineRack, 'magazine-rack.glb')

  // Japanese room models
  await buildAndWrite('WoodenShelf', buildWoodenShelf, 'wooden-shelf.glb')
  await buildAndWrite('RetroComputer', buildRetroComputer, 'retro-computer.glb')
  await buildAndWrite('Trophy', buildTrophy, 'trophy.glb')
  await buildAndWrite('LowTableVase', buildLowTableVase, 'low-table-vase.glb')
  await buildAndWrite('Zabuton', buildZabuton, 'zabuton.glb')
  await buildAndWrite('ToyCar', buildToyCar, 'toy-car.glb')
  await buildAndWrite('ShojiDoor', buildShojiDoor, 'shoji-door.glb')
  await buildAndWrite('LowComputerDesk', buildLowComputerDesk, 'low-computer-desk.glb')
  await buildAndWrite('Futon', buildFuton, 'futon.glb')
  await buildAndWrite('Candle', buildCandle, 'candle.glb')
  await buildAndWrite('FloorLamp', buildFloorLamp, 'floor-lamp.glb')
  await buildAndWrite('CeilingLamp', buildCeilingLamp, 'ceiling-lamp.glb')

  console.log('Done!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
