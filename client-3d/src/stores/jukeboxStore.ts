import { create } from 'zustand'
import type { JukeboxItemDto } from '@club-mutant/types/Dtos'

interface JukeboxState {
  // Shared room playlist (synced from server schema)
  playlist: JukeboxItemDto[]

  // Actions
  setPlaylist: (items: JukeboxItemDto[]) => void
  addItem: (item: JukeboxItemDto) => void
  removeItem: (id: string) => void
  clear: () => void
}

export const useJukeboxStore = create<JukeboxState>((set) => ({
  playlist: [],

  setPlaylist: (items) => set({ playlist: items }),

  addItem: (item) =>
    set((s) => ({
      playlist: [...s.playlist, item],
    })),

  removeItem: (id) =>
    set((s) => ({
      playlist: s.playlist.filter((item) => item.id !== id),
    })),

  clear: () => set({ playlist: [] }),
}))
