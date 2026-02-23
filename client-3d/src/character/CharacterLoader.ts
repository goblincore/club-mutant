import * as THREE from 'three'

// Matches the export format from the rig editor
export interface CharacterManifest {
  name: string
  scale?: number
  distortion?: number // Global distortion intensity multiplier (0..1, default 1.0)
  distortionOverrides?: Record<string, number> // Per bone-role distortion multipliers
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

// Load textures for a pre-fetched manifest (avoids double manifest fetch)
async function loadTextures(basePath: string, manifest: CharacterManifest): Promise<Map<string, THREE.Texture>> {
  const textures = new Map<string, THREE.Texture>()

  await Promise.all(
    manifest.parts.map(async (part) => {
      const url = `${basePath}/${part.texture}`

      try {
        const tex = await new Promise<THREE.Texture>((resolve, reject) => {
          textureLoader.load(
            url,
            (t) => {
              t.magFilter = THREE.NearestFilter
              t.minFilter = THREE.NearestFilter
              t.colorSpace = THREE.SRGBColorSpace
              resolve(t)
            },
            undefined,
            reject
          )
        })

        textures.set(part.id, tex)
      } catch (err) {
        console.error('[character] Failed to load texture:', part.id, '←', url, err)
      }
    })
  )

  return textures
}

// Load a character manifest + all its textures
export async function loadCharacter(basePath: string): Promise<LoadedCharacter> {
  const manifestUrl = `${basePath}/manifest.json`
  const response = await fetch(manifestUrl)
  const manifest: CharacterManifest = await response.json()

  const textures = new Map<string, THREE.Texture>()

  await Promise.all(
    manifest.parts.map(async (part) => {
      const url = `${basePath}/${part.texture}`

      try {
        const tex = await new Promise<THREE.Texture>((resolve, reject) => {
          textureLoader.load(
            url,
            (t) => {
              t.magFilter = THREE.NearestFilter
              t.minFilter = THREE.NearestFilter
              t.colorSpace = THREE.SRGBColorSpace
              resolve(t)
            },
            undefined,
            reject
          )
        })

        textures.set(part.id, tex)
      } catch (err) {
        console.error('[character] Failed to load texture:', part.id, '←', url, err)
      }
    })
  )

  return { manifest, textures }
}

// Cache loaded characters — keeps successful loads, evicts failures
const cache = new Map<string, Promise<LoadedCharacter>>()

export function loadCharacterCached(basePath: string): Promise<LoadedCharacter> {
  const existing = cache.get(basePath)

  if (existing) return existing

  const promise = loadCharacter(basePath)

  cache.set(basePath, promise)

  // Evict on failure so next attempt retries
  promise.catch(() => {
    cache.delete(basePath)
  })

  return promise
}

// Preload a character into the cache (fire-and-forget, used by lobby)
export function preloadCharacter(basePath: string): void {
  loadCharacterCached(basePath)
}

// Preload with an already-fetched manifest (avoids double fetch from discovery)
export function preloadCharacterWithManifest(basePath: string, manifest: CharacterManifest): void {
  if (cache.has(basePath)) return

  const promise = loadTextures(basePath, manifest).then((textures) => ({
    manifest,
    textures,
  }))

  cache.set(basePath, promise)

  promise.catch(() => {
    cache.delete(basePath)
  })
}
