import * as THREE from 'three'

// Matches the export format from the rig editor
export interface CharacterManifest {
  name: string
  parts: ManifestPart[]
  animations: ManifestAnimation[]
}

export interface ManifestPart {
  id: string
  texture: string
  pivot: [number, number]
  size: [number, number]
  parent: string | null
  offset: [number, number, number]
  zIndex: number
  boneRole: string | null
}

export interface ManifestAnimation {
  name: string
  fps: number
  duration: number
  interpolation: 'linear' | 'step'
  tracks: ManifestTrack[]
}

export interface ManifestTrack {
  boneId: string
  property: string
  keys: [number, number][]
}

export interface LoadedCharacter {
  manifest: CharacterManifest
  textures: Map<string, THREE.Texture>
}

const textureLoader = new THREE.TextureLoader()

// Load a character manifest + all its textures
export async function loadCharacter(basePath: string): Promise<LoadedCharacter> {
  const manifestUrl = `${basePath}/manifest.json`
  const response = await fetch(manifestUrl)
  const manifest: CharacterManifest = await response.json()

  const textures = new Map<string, THREE.Texture>()

  await Promise.all(
    manifest.parts.map(async (part) => {
      const tex = await new Promise<THREE.Texture>((resolve, reject) => {
        textureLoader.load(
          `${basePath}/${part.texture}`,
          (t) => {
            t.magFilter = THREE.NearestFilter
            t.minFilter = THREE.NearestFilter
            t.colorSpace = THREE.SRGBColorSpace
            resolve(t)
          },
          undefined,
          reject,
        )
      })

      textures.set(part.id, tex)
    }),
  )

  return { manifest, textures }
}

// Cache loaded characters
const cache = new Map<string, Promise<LoadedCharacter>>()

export function loadCharacterCached(basePath: string): Promise<LoadedCharacter> {
  let existing = cache.get(basePath)

  if (!existing) {
    existing = loadCharacter(basePath)
    cache.set(basePath, existing)
  }

  return existing
}
