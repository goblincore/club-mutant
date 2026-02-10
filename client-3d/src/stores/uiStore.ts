import { create } from 'zustand'

interface UIState {
  chatOpen: boolean
  playlistOpen: boolean
  psxEnabled: boolean
  showNametags: boolean
  boothPromptOpen: boolean

  toggleChat: () => void
  togglePlaylist: () => void
  setPlaylistOpen: (open: boolean) => void
  togglePsx: () => void
  toggleNametags: () => void
  setBoothPromptOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  chatOpen: true,
  playlistOpen: false,
  psxEnabled: true,
  showNametags: true,
  boothPromptOpen: false,

  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  togglePlaylist: () => set((s) => ({ playlistOpen: !s.playlistOpen })),
  setPlaylistOpen: (open) => set({ playlistOpen: open }),
  togglePsx: () => set((s) => ({ psxEnabled: !s.psxEnabled })),
  toggleNametags: () => set((s) => ({ showNametags: !s.showNametags })),
  setBoothPromptOpen: (open) => set({ boothPromptOpen: open }),
}))
