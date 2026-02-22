import { create } from 'zustand'

interface DreamClientState {
  // Initialization
  initialized: boolean
  playerName: string
  serverHttpUrl: string
  dreamServiceUrl: string
  collectedItems: Set<string>
  waking: boolean

  // World state
  currentWorldId: string

  // Actions
  init: (playerName: string, collectedItems: string[], serverHttpUrl: string, dreamServiceUrl: string) => void
  setCurrentWorldId: (id: string) => void
  addCollectedItem: (id: string) => void
  setWaking: (waking: boolean) => void
}

export const useDreamClientStore = create<DreamClientState>((set) => ({
  initialized: false,
  playerName: '',
  serverHttpUrl: '',
  dreamServiceUrl: '',
  collectedItems: new Set(),
  waking: false,
  currentWorldId: 'nexus',

  init: (playerName, collectedItems, serverHttpUrl, dreamServiceUrl) =>
    set({
      initialized: true,
      playerName,
      serverHttpUrl,
      dreamServiceUrl,
      collectedItems: new Set(collectedItems),
    }),

  setCurrentWorldId: (id) => set({ currentWorldId: id }),

  addCollectedItem: (id) =>
    set((state) => {
      const next = new Set(state.collectedItems)
      next.add(id)
      return { collectedItems: next }
    }),

  setWaking: (waking) => set({ waking }),
}))
