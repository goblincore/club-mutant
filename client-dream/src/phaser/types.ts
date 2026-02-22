// ── Dream World Types ──
// Defines the structure of dream world JSON files.

export interface DreamWorldLayer {
  name: 'ground' | 'objects' | 'collision'
  data: number[] // flat row-major array: -1 = empty, 0+ = tile index
}

export interface DreamExit {
  x: number // tile coord
  y: number // tile coord
  target: string // world id (e.g., 'nexus', 'forest', 'wake')
  spawnX: number // spawn tile coord in target world
  spawnY: number // spawn tile coord in target world
}

export interface DreamCollectible {
  id: string
  x: number
  y: number
}

export interface DreamNPCDef {
  id: string
  personalityId: string // maps to server personality config
  name: string // display name
  spawnX: number // tile coordinates
  spawnY: number
  wanderRadius?: number // max tiles from spawn (default 3)
  interactRadius?: number // proximity to show chat (default 2)
  stationary?: boolean // never moves (default false)
}

export interface DreamWorldPalette {
  floor: string // hex color for walkable floor
  wall: string // hex color for walls/blocked
  path: string // hex color for paths/highlights
  exit: string // hex color for exit glow
  noiseBase: string // noise shader base tint
  noiseDrift: string // noise shader drift target color
}

export interface DreamWorldDef {
  id: string
  name: string
  tileSize: number
  width: number // tiles
  height: number // tiles
  spawnX: number
  spawnY: number
  palette?: DreamWorldPalette
  layers: DreamWorldLayer[]
  exits: DreamExit[]
  collectibles?: DreamCollectible[]
  npcs?: DreamNPCDef[]
}
