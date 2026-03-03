import { create } from 'zustand'

const RENDER_SCALES = [0.75, 0.5, 0.35] as const

interface UIState {
  rightPanelOpen: boolean
  rightPanelTab: 'chat' | 'playlist' | 'settings'
  
  djQueueOpen: boolean
  djQueueMinimized: boolean
  
  leaveRoomPromptOpen: boolean
  
  psxEnabled: boolean
  showNametags: boolean
  boothPromptOpen: boolean
  boothPromptSlotIndex: number
  muted: boolean
  showFps: boolean
  renderScale: number
  fisheyeOverride: number | null
  vertexFisheye: number
  vortexOob: boolean
  crtFrame: boolean
  computerIframeOpen: boolean
  magazineReaderOpen: boolean
  sleepPromptOpen: boolean
  wakePromptOpen: boolean

  setRightPanelOpen: (open: boolean) => void
  setRightPanelTab: (tab: 'chat' | 'playlist' | 'settings') => void
  setLeaveRoomPromptOpen: (open: boolean) => void

  toggleDjQueue: () => void
  setDjQueueOpen: (open: boolean) => void
  setDjQueueMinimized: (minimized: boolean) => void
  toggleNametags: () => void
  setBoothPromptOpen: (open: boolean, slotIndex?: number) => void
  toggleMuted: () => void
  toggleFps: () => void
  cycleRenderScale: () => void
  setFisheyeOverride: (v: number | null) => void
  setVertexFisheye: (v: number) => void
  toggleVortexOob: () => void
  toggleCrtFrame: () => void
  setComputerIframeOpen: (open: boolean) => void
  setMagazineReaderOpen: (open: boolean) => void
  setSleepPromptOpen: (open: boolean) => void
  setWakePromptOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  rightPanelOpen: false,
  rightPanelTab: 'chat',
  leaveRoomPromptOpen: false,
  
  djQueueOpen: false,
  djQueueMinimized: false,
  
  psxEnabled: true,
  showNametags: true,
  boothPromptOpen: false,
  boothPromptSlotIndex: 0,
  muted: false,
  showFps: false,
  renderScale: 0.75,
  fisheyeOverride: null,
  vertexFisheye: 0,
  vortexOob: false,
  crtFrame: true,
  computerIframeOpen: false,
  magazineReaderOpen: false,
  sleepPromptOpen: false,
  wakePromptOpen: false,

  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightPanelOpen: true }),
  setLeaveRoomPromptOpen: (open) => set({ leaveRoomPromptOpen: open }),

  toggleDjQueue: () => set((s) => ({ djQueueOpen: !s.djQueueOpen })),
  setDjQueueOpen: (open) => set({ djQueueOpen: open, djQueueMinimized: false }),
  setDjQueueMinimized: (minimized) => set({ djQueueMinimized: minimized }),
  toggleNametags: () => set((s) => ({ showNametags: !s.showNametags })),
  setBoothPromptOpen: (open, slotIndex) =>
    set({ boothPromptOpen: open, boothPromptSlotIndex: slotIndex ?? 0 }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),

  toggleFps: () => set((s) => ({ showFps: !s.showFps })),

  setFisheyeOverride: (v) => set({ fisheyeOverride: v }),
  setVertexFisheye: (v) => set({ vertexFisheye: v }),
  toggleVortexOob: () => set((s) => ({ vortexOob: !s.vortexOob })),
  toggleCrtFrame: () => set((s) => ({ crtFrame: !s.crtFrame })),
  setComputerIframeOpen: (open) => set({ computerIframeOpen: open }),
  setMagazineReaderOpen: (open) => set({ magazineReaderOpen: open }),
  setSleepPromptOpen: (open) => set({ sleepPromptOpen: open }),
  setWakePromptOpen: (open) => set({ wakePromptOpen: open }),

  cycleRenderScale: () =>
    set((s) => {
      const idx = RENDER_SCALES.indexOf(s.renderScale as (typeof RENDER_SCALES)[number])
      const next = RENDER_SCALES[(idx + 1) % RENDER_SCALES.length]!
      return { renderScale: next }
    }),
}))
