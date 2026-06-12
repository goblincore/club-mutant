import { create } from 'zustand'

// Render quality + audio/visual toggles (PSX post, nametags, fisheye, FPS, etc.).
// Separate from panelStore so settings-only consumers (shaders, FPS counter)
// don't re-render when panels open/close.

const RENDER_SCALES = [0.75, 0.5, 0.35] as const

interface SettingsState {
  psxEnabled: boolean
  showNametags: boolean
  muted: boolean
  showFps: boolean
  renderScale: number
  fisheyeOverride: number | null
  vertexFisheye: number
  vortexOob: boolean
  crtFrame: boolean

  toggleNametags: () => void
  toggleMuted: () => void
  toggleFps: () => void
  cycleRenderScale: () => void
  setFisheyeOverride: (v: number | null) => void
  setVertexFisheye: (v: number) => void
  toggleVortexOob: () => void
  toggleCrtFrame: () => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  psxEnabled: true,
  showNametags: true,
  muted: false,
  showFps: false,
  renderScale: 0.75,
  fisheyeOverride: null,
  vertexFisheye: 0,
  vortexOob: false,
  crtFrame: true,

  toggleNametags: () => set((s) => ({ showNametags: !s.showNametags })),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  toggleFps: () => set((s) => ({ showFps: !s.showFps })),

  setFisheyeOverride: (v) => set({ fisheyeOverride: v }),
  setVertexFisheye: (v) => set({ vertexFisheye: v }),
  toggleVortexOob: () => set((s) => ({ vortexOob: !s.vortexOob })),
  toggleCrtFrame: () => set((s) => ({ crtFrame: !s.crtFrame })),

  cycleRenderScale: () =>
    set((s) => {
      const idx = RENDER_SCALES.indexOf(s.renderScale as (typeof RENDER_SCALES)[number])
      const next = RENDER_SCALES[(idx + 1) % RENDER_SCALES.length]!
      return { renderScale: next }
    }),
}))
