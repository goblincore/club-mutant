import { create } from 'zustand'

interface UIState {
  chatExpanded: boolean
  playlistOpen: boolean
  playlistMinimized: boolean
  psxEnabled: boolean
  showNametags: boolean
  boothPromptOpen: boolean
  muted: boolean

  toggleChatExpanded: () => void
  togglePlaylist: () => void
  setPlaylistOpen: (open: boolean) => void
  setPlaylistMinimized: (minimized: boolean) => void
  toggleNametags: () => void
  setBoothPromptOpen: (open: boolean) => void
  toggleMuted: () => void
}

export const useUIStore = create<UIState>((set) => ({
  chatExpanded: false,
  playlistOpen: false,
  playlistMinimized: false,
  psxEnabled: true,
  showNametags: true,
  boothPromptOpen: false,
  muted: false,

  toggleChatExpanded: () => set((s) => ({ chatExpanded: !s.chatExpanded })),
  togglePlaylist: () => set((s) => ({ playlistOpen: !s.playlistOpen })),
  setPlaylistOpen: (open) => set({ playlistOpen: open, playlistMinimized: false }),
  setPlaylistMinimized: (minimized) => set({ playlistMinimized: minimized }),
  toggleNametags: () => set((s) => ({ showNametags: !s.showNametags })),
  setBoothPromptOpen: (open) => set({ boothPromptOpen: open }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
}))
