import { create } from 'zustand'

const RENDER_SCALES = [0.75, 0.5, 0.35] as const

interface UIState {
  chatExpanded: boolean
  playlistOpen: boolean
  playlistMinimized: boolean
  psxEnabled: boolean
  showNametags: boolean
  boothPromptOpen: boolean
  muted: boolean
  showFps: boolean
  renderScale: number
  fisheyeOverride: number | null
  vertexFisheye: number

  toggleChatExpanded: () => void
  togglePlaylist: () => void
  setPlaylistOpen: (open: boolean) => void
  setPlaylistMinimized: (minimized: boolean) => void
  toggleNametags: () => void
  setBoothPromptOpen: (open: boolean) => void
  toggleMuted: () => void
  toggleFps: () => void
  cycleRenderScale: () => void
  setFisheyeOverride: (v: number | null) => void
  setVertexFisheye: (v: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  chatExpanded: false,
  playlistOpen: false,
  playlistMinimized: false,
  psxEnabled: true,
  showNametags: true,
  boothPromptOpen: false,
  muted: false,
  showFps: false,
  renderScale: 0.75,
  fisheyeOverride: null,
  vertexFisheye: 0,

  toggleChatExpanded: () => set((s) => ({ chatExpanded: !s.chatExpanded })),
  togglePlaylist: () => set((s) => ({ playlistOpen: !s.playlistOpen })),
  setPlaylistOpen: (open) => set({ playlistOpen: open, playlistMinimized: false }),
  setPlaylistMinimized: (minimized) => set({ playlistMinimized: minimized }),
  toggleNametags: () => set((s) => ({ showNametags: !s.showNametags })),
  setBoothPromptOpen: (open) => set({ boothPromptOpen: open }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),

  toggleFps: () => set((s) => ({ showFps: !s.showFps })),

  setFisheyeOverride: (v) => set({ fisheyeOverride: v }),
  setVertexFisheye: (v) => set({ vertexFisheye: v }),

  cycleRenderScale: () =>
    set((s) => {
      const idx = RENDER_SCALES.indexOf(s.renderScale as (typeof RENDER_SCALES)[number])
      const next = RENDER_SCALES[(idx + 1) % RENDER_SCALES.length]!
      return { renderScale: next }
    }),
}))
