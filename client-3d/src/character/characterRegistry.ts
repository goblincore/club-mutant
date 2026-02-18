import type { CharacterManifest } from './CharacterLoader'
import { preloadCharacterWithManifest } from './CharacterLoader'

export interface CharacterEntry {
  id: string
  name: string
  path: string
  thumbnail: string
  textureId: number
}

// How many default[N] folders to probe before stopping
const MAX_PROBE = 20

/**
 * Probe for character folders following the default / default2 / default3 / ... convention.
 * Each folder must contain a manifest.json to be recognised.
 * The name shown in the lobby comes from manifest.name (falls back to folder name).
 * textureId is assigned by index order (default=0, default2=1, default3=2, ...).
 */
interface DiscoveredCharacter {
  entry: CharacterEntry
  manifest: CharacterManifest
}

async function discoverCharacters(): Promise<DiscoveredCharacter[]> {
  const discovered: DiscoveredCharacter[] = []

  // Fire all probes in parallel for speed
  const probes = Array.from({ length: MAX_PROBE }, (_, i) => {
    const folderName = i === 0 ? 'default' : `default${i + 1}`
    const basePath = `/characters/${folderName}`

    return fetch(`${basePath}/manifest.json`)
      .then(async (res) => {
        if (!res.ok) return null

        const manifest: CharacterManifest = await res.json()

        return {
          entry: {
            id: folderName,
            name: manifest.name || folderName,
            path: basePath,
            thumbnail: `${basePath}/head.png`,
            textureId: i,
          } satisfies CharacterEntry,
          manifest,
        }
      })
      .catch(() => null)
  })

  const results = await Promise.all(probes)

  for (const result of results) {
    if (result) discovered.push(result)
  }

  return discovered
}

// Singleton cached promise — discovery runs once, result is shared
let cached: Promise<CharacterEntry[]> | null = null

export function getCharacters(): Promise<CharacterEntry[]> {
  if (!cached) {
    cached = discoverCharacters().then((discovered) => {
      // Preload all discovered characters using the already-fetched manifests
      // (avoids a second manifest.json fetch per character)
      for (const d of discovered) {
        preloadCharacterWithManifest(d.entry.path, d.manifest)
      }

      // Return just the entries for external consumers
      return discovered.map((d) => d.entry)
    })
  }

  return cached
}

/**
 * Synchronous lookup: textureId → character path.
 * Falls back to '/characters/default' for unknown IDs.
 * Call after characters have been discovered (getCharacters() resolved).
 */
let resolvedEntries: CharacterEntry[] = []

getCharacters().then((entries) => {
  resolvedEntries = entries
})

export function characterPathForTextureId(textureId: number): string {
  const entry = resolvedEntries.find((e) => e.textureId === textureId)

  return entry?.path ?? '/characters/default'
}
