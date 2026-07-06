export enum RoomType {
  LOBBY = 'lobby',
  PUBLIC = 'clubmutant',
  CUSTOM = 'custom',
  MYROOM = 'myroom',
  JUKEBOX = 'jukebox',
}

export type MusicMode = 'djqueue' | 'jukebox' | 'personal'

// NPC automaton DJ config (Phase 1: set at room creation / lobby env only).
// See docs/plans/2026-07-05-npc-dj-design.md
export interface INpcDjConfig {
  mode: 'fallback' | 'rotation'
  playlistId?: string // default: 'default'
  name?: string // default: random pick from a name pool
  textureId?: number // default: random of the sprites in TEXTURE_IDS
}

export interface IRoomData {
  name: string
  description: string
  password: string | null
  autoDispose: boolean
  isPublic?: boolean
  musicMode?: MusicMode
  npcDj?: INpcDjConfig
}
