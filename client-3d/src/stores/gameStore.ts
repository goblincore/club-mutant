import { create } from 'zustand'

export interface PlayerState {
  sessionId: string
  name: string
  x: number
  y: number
  textureId: number
  animId: number
  scale: number
}

export interface GameState {
  // Connection
  connected: boolean
  mySessionId: string | null

  // Players
  players: Map<string, PlayerState>

  // Local player input
  localX: number
  localY: number

  // Character selection (set on lobby, used by renderer)
  selectedCharacterPath: string

  // Actions
  setConnected: (connected: boolean, sessionId?: string) => void
  addPlayer: (sessionId: string, player: PlayerState) => void
  removePlayer: (sessionId: string) => void
  updatePlayer: (sessionId: string, updates: Partial<PlayerState>) => void
  setLocalPosition: (x: number, y: number) => void
  setSelectedCharacterPath: (path: string) => void
}

export const useGameStore = create<GameState>((set) => ({
  connected: false,
  mySessionId: null,

  players: new Map(),

  localX: 0,
  localY: 0,

  selectedCharacterPath: '/characters/default',

  setConnected: (connected, sessionId) => set({ connected, mySessionId: sessionId ?? null }),

  addPlayer: (sessionId, player) =>
    set((s) => {
      const next = new Map(s.players)
      next.set(sessionId, player)
      return { players: next }
    }),

  removePlayer: (sessionId) =>
    set((s) => {
      const next = new Map(s.players)
      next.delete(sessionId)
      return { players: next }
    }),

  updatePlayer: (sessionId, updates) =>
    set((s) => {
      const existing = s.players.get(sessionId)
      if (!existing) return s

      const next = new Map(s.players)
      next.set(sessionId, { ...existing, ...updates })
      return { players: next }
    }),

  setLocalPosition: (x, y) => {
    // Clamp to room bounds (ROOM_SIZE=12, WORLD_SCALE=0.01 → ±550 server px, with margin)
    const MAX = 550
    const cx = Math.max(-MAX, Math.min(MAX, x))
    const cy = Math.max(-MAX, Math.min(MAX, y))
    set({ localX: cx, localY: cy })
  },

  setSelectedCharacterPath: (path) => set({ selectedCharacterPath: path }),
}))
