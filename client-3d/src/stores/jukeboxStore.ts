import { create } from 'zustand'
import type { JukeboxItemDto } from '@club-mutant/types/Dtos'

interface JukeboxState {
  // Shared room playlist (synced from server schema)
  playlist: JukeboxItemDto[]

  // Exclusive occupant (synced from server schema)
  occupantId: string | null
  occupantName: string | null

  // Actions
  setPlaylist: (items: JukeboxItemDto[]) => void
  addItem: (item: JukeboxItemDto) => void
  removeItem: (id: string) => void
  setOccupant: (id: string | null, name: string | null) => void
  clear: () => void
}

export const useJukeboxStore = create<JukeboxState>((set) => ({
  playlist: [],
  occupantId: null,
  occupantName: null,

  setPlaylist: (items) => set({ playlist: items }),

  addItem: (item) =>
    set((s) => ({
      playlist: [...s.playlist, item],
    })),

  removeItem: (id) =>
    set((s) => ({
      playlist: s.playlist.filter((item) => item.id !== id),
    })),

  setOccupant: (id, name) => set({ occupantId: id, occupantName: name }),

  clear: () => set({ playlist: [], occupantId: null, occupantName: null }),
}))
