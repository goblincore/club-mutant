import { create } from 'zustand'

/**
 * Simplified dream store — only tracks whether we're dreaming and collectibles.
 * All game state (world, player position, NPCs) is managed inside the Phaser iframe.
 */
export interface DreamState {
  isDreaming: boolean
  collectedItems: Set<string>

  enterDream: () => void
  exitDream: () => void
  addCollectedItem: (id: string) => void
}

export const useDreamStore = create<DreamState>((set) => ({
  isDreaming: false,
  collectedItems: new Set<string>(),

  enterDream: () => set({ isDreaming: true }),

  exitDream: () => set({ isDreaming: false }),

  addCollectedItem: (id) =>
    set((s) => {
      const next = new Set(s.collectedItems)
      next.add(id)
      return { collectedItems: next }
    }),
}))
