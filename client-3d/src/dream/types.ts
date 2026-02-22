// ── Dream Mode Types ──
// JSON schema for dream world definitions — designed to be both
// hand-authorable and AI-generable.

export interface TileManifestEntry {
  name: string
  walkable: boolean
  special?: 'exit' | 'spawn' | 'collectible'
}

export interface TileManifest {
  id: string
  tileSize: number // pixels per tile (e.g., 16)
  columns: number // columns in the tileset sprite sheet
  tiles: Record<string, TileManifestEntry>
}

export interface DreamWorldLayer {
  name: 'ground' | 'objects' | 'collision'
  data: number[] // flat row-major array: -1 = empty, 0+ = tile index
}

export interface DreamExit {
  x: number // tile coord
  y: number // tile coord
  target: string // world id (e.g., 'nexus', 'forest')
  spawnX: number // spawn tile coord in target world
  spawnY: number // spawn tile coord in target world
}

export interface DreamCollectible {
  id: string
  x: number
  y: number
  sprite: string // path to sprite image
  shelfModel?: string // GLB model path for MyRoom shelf display
}

export interface DreamEvent {
  id: string
  type: 'proximity' | 'random' | 'interact'
  x?: number
  y?: number
  radius?: number
  chance?: number // 0-1, for random events
  action: 'dialogue' | 'animation' | 'sound' | 'teleport' | 'visual' | 'replace_tileset'
  data?: Record<string, unknown>
}

export interface DreamWorldDef {
  id: string
  name: string
  tileSize: number
  width: number // tiles
  height: number // tiles
  tileset: string // path to tileset sprite sheet image
  palette?: string[] // dominant colors for shader tinting
  layers: DreamWorldLayer[]
  spawnX: number
  spawnY: number
  exits: DreamExit[]
  collectibles?: DreamCollectible[]
  events?: DreamEvent[]
  ambientSound?: string
  shader?: 'default' | 'dither' | 'invert' | 'wave'
}

// ── Nexus door definition ──

export interface NexusDoor {
  id: string
  tileX: number
  tileY: number
  color: string // hex color for the door sprite
  label?: string // shown on hover (e.g., "???")
  targetWorld?: string // world id — undefined means locked/non-functional
  locked?: boolean
}
