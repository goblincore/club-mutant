import { useEffect, useState, useMemo } from 'react'
import * as THREE from 'three'

import { GLBModel } from './GLBModel'

const MANIFEST_URL = '/textures/magazines/magazines.json'
const BASE_PATH = '/textures/magazines/'

const loader = new THREE.TextureLoader()

export interface MagazineEntry {
  id: string
  title: string
  cover: string
  pages: string[]
}

interface MagazineManifest {
  magazines: MagazineEntry[]
}

// Shelf positions matching the GLB rack geometry.
// Each row has a Y (shelf surface), frontZ (where the lip is), and a slight backward tilt.
const SHELF_ROWS = [
  { y: 0.10, frontZ: 0.18 },
  { y: 0.36, frontZ: 0.10 },
  { y: 0.62, frontZ: 0.01 },
  { y: 0.88, frontZ: -0.08 },
] as const

const COVERS_PER_ROW = 3
const COVER_W = 0.2
const COVER_H = 0.22
const INNER_W = 0.8
const COVER_TILT = -0.25 // lean covers back slightly

/** Load a texture, returns null on failure. */
function loadTex(path: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    loader.load(
      path,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.NearestFilter
        resolve(tex)
      },
      undefined,
      () => resolve(null)
    )
  })
}

/** Fetch magazine manifest and preload cover textures. */
export function useMagazineManifest() {
  const [magazines, setMagazines] = useState<MagazineEntry[]>([])
  const [coverTextures, setCoverTextures] = useState<Map<string, THREE.Texture>>(new Map())

  useEffect(() => {
    let cancelled = false

    void (async () => {
      let manifest: MagazineManifest

      try {
        const res = await fetch(MANIFEST_URL)
        if (!res.ok) return
        manifest = (await res.json()) as MagazineManifest
      } catch {
        console.warn('[MagazineRack] Could not load manifest')
        return
      }

      if (cancelled || !manifest.magazines.length) return

      setMagazines(manifest.magazines)

      const texMap = new Map<string, THREE.Texture>()

      for (const mag of manifest.magazines) {
        if (!mag.cover) continue

        const tex = await loadTex(`${BASE_PATH}${mag.cover}`)

        if (cancelled) {
          tex?.dispose()
          return
        }

        if (tex) texMap.set(mag.id, tex)
      }

      if (!cancelled) setCoverTextures(texMap)
    })()

    return () => {
      cancelled = true
      coverTextures.forEach((t) => t.dispose())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { magazines, coverTextures }
}

/** A single magazine cover plane placed on a shelf slot. */
function CoverPlane({
  texture,
  position,
  rotation,
}: {
  texture: THREE.Texture
  position: [number, number, number]
  rotation: [number, number, number]
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[COVER_W, COVER_H]} />
      <meshStandardMaterial map={texture} roughness={0.8} />
    </mesh>
  )
}

/** Colored fallback rectangle when no cover texture is available. */
function FallbackCover({
  color,
  position,
  rotation,
}: {
  color: string
  position: [number, number, number]
  rotation: [number, number, number]
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[COVER_W, COVER_H]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  )
}

const FALLBACK_COLORS = ['#cc4444', '#4488cc', '#44aa66', '#cc8844', '#8844cc', '#cc4488',
  '#44ccaa', '#aacc44', '#4444cc', '#cc44cc', '#44cc44', '#cccc44']

/**
 * Magazine rack — loads GLB wood structure + overlays textured cover planes.
 * Props are forwarded to the outer <group> (position, rotation, etc.).
 */
export function MagazineRack(props: JSX.IntrinsicElements['group']) {
  const { magazines, coverTextures } = useMagazineManifest()

  // Compute slot positions for all magazines across the shelf rows
  const slots = useMemo(() => {
    const result: { magIndex: number; position: [number, number, number]; rotation: [number, number, number] }[] = []

    let magIdx = 0

    for (const row of SHELF_ROWS) {
      for (let col = 0; col < COVERS_PER_ROW; col++) {
        if (magIdx >= magazines.length) break

        // Spread covers evenly across the inner width
        const xSpacing = INNER_W / COVERS_PER_ROW
        const x = -INNER_W / 2 + xSpacing / 2 + col * xSpacing

        // Place cover just above shelf surface, leaning against the lip
        const y = row.y + COVER_H / 2 + 0.02
        const z = row.frontZ - 0.04

        result.push({
          magIndex: magIdx,
          position: [x, y, z],
          rotation: [COVER_TILT, 0, 0],
        })

        magIdx++
      }

      if (magIdx >= magazines.length) break
    }

    return result
  }, [magazines.length])

  return (
    <group {...props}>
      <GLBModel src="/models/magazine-rack.glb" />

      {slots.map(({ magIndex, position, rotation }) => {
        const mag = magazines[magIndex]!
        const tex = coverTextures.get(mag.id)

        return tex ? (
          <CoverPlane key={mag.id} texture={tex} position={position} rotation={rotation} />
        ) : (
          <FallbackCover
            key={mag.id}
            color={FALLBACK_COLORS[magIndex % FALLBACK_COLORS.length]!}
            position={position}
            rotation={rotation}
          />
        )
      })}
    </group>
  )
}
