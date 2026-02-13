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

  console.log('Done!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
