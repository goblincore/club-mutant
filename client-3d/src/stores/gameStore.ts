import { create } from 'zustand'

export interface PlayerState {
  sessionId: string
  name: string
  textureId: number
  animId: number
  scale: number
}

// ── Mutable position map (outside React state for hot-path perf) ──
// Written by NetworkManager every tick, read by PlayerEntity.useFrame.
// Never triggers React re-renders.

export interface PlayerPosition {
  x: number
  y: number
}

const _playerPositions = new Map<string, PlayerPosition>()

export function getPlayerPosition(sessionId: string): PlayerPosition | undefined {
  return _playerPositions.get(sessionId)
}

export function setPlayerPosition(sessionId: string, x: number, y: number) {
  const existing = _playerPositions.get(sessionId)

  if (existing) {
    existing.x = x
    existing.y = y
  } else {
    _playerPositions.set(sessionId, { x, y })
  }
}

export function deletePlayerPosition(sessionId: string) {
  _playerPositions.delete(sessionId)
}

export type ConnectionStatus = 'disconnected' | 'connected' | 'reconnecting'

export interface GameState {
  // Connection
  connected: boolean
  connectionStatus: ConnectionStatus
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
  setConnectionStatus: (status: ConnectionStatus) => void
  addPlayer: (sessionId: string, player: PlayerState) => void
  removePlayer: (sessionId: string) => void
  updatePlayer: (sessionId: string, updates: Partial<PlayerState>) => void
  setLocalPosition: (x: number, y: number) => void
  setSelectedCharacterPath: (path: string) => void
}

export const useGameStore = create<GameState>((set) => ({
  connected: false,
  connectionStatus: 'disconnected' as ConnectionStatus,
  mySessionId: null,

  players: new Map(),

  localX: 0,
  localY: 0,

  selectedCharacterPath: '/characters/default',

  setConnected: (connected, sessionId) =>
    set({
      connected,
      connectionStatus: connected ? 'connected' : 'disconnected',
      mySessionId: sessionId ?? null,
    }),

  setConnectionStatus: (status) =>
    set({ connectionStatus: status, connected: status === 'connected' }),

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
      deletePlayerPosition(sessionId)
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
