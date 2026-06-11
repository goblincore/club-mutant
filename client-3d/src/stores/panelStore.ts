import { create } from 'zustand'

// Panel/overlay visibility state — what's open, what's minimized, which tab.
// Separate from settingsStore so panel-only consumers don't re-render when
// render-quality settings change.

interface PanelState {
  rightPanelOpen: boolean
  rightPanelTab: 'chat' | 'playlist' | 'settings'

  djQueueOpen: boolean
  djQueueMinimized: boolean

  leaveRoomPromptOpen: boolean

  boothPromptOpen: boolean
  boothPromptSlotIndex: number

  osActive: boolean
  magazineReaderOpen: boolean
  sleepPromptOpen: boolean
  wakePromptOpen: boolean

  setRightPanelOpen: (open: boolean) => void
  setRightPanelTab: (tab: 'chat' | 'playlist' | 'settings') => void
  setLeaveRoomPromptOpen: (open: boolean) => void

  toggleDjQueue: () => void
  setDjQueueOpen: (open: boolean) => void
  setDjQueueMinimized: (minimized: boolean) => void
  setBoothPromptOpen: (open: boolean, slotIndex?: number) => void
  setOsActive: (open: boolean) => void
  setMagazineReaderOpen: (open: boolean) => void
  setSleepPromptOpen: (open: boolean) => void
  setWakePromptOpen: (open: boolean) => void
}

export const usePanelStore = create<PanelState>((set) => ({
  rightPanelOpen: false,
  rightPanelTab: 'chat',
  leaveRoomPromptOpen: false,

  djQueueOpen: false,
  djQueueMinimized: false,

  boothPromptOpen: false,
  boothPromptSlotIndex: 0,
  osActive: false,
  magazineReaderOpen: false,
  sleepPromptOpen: false,
  wakePromptOpen: false,

  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightPanelOpen: true }),
  setLeaveRoomPromptOpen: (open) => set({ leaveRoomPromptOpen: open }),

  toggleDjQueue: () => set((s) => ({ djQueueOpen: !s.djQueueOpen })),
  setDjQueueOpen: (open) => set({ djQueueOpen: open, djQueueMinimized: false }),
  setDjQueueMinimized: (minimized) => set({ djQueueMinimized: minimized }),
  setBoothPromptOpen: (open, slotIndex) =>
    set({ boothPromptOpen: open, boothPromptSlotIndex: slotIndex ?? 0 }),
  setOsActive: (open) => set({ osActive: open }),
  setMagazineReaderOpen: (open) => set({ magazineReaderOpen: open }),
  setSleepPromptOpen: (open) => set({ sleepPromptOpen: open }),
  setWakePromptOpen: (open) => set({ wakePromptOpen: open }),
}))
