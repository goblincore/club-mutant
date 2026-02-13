import { create } from 'zustand'

export interface DJQueueEntry {
  sessionId: string
  name: string
  position: number
  slotIndex: number
}

export interface QueuePlaylistItem {
  id: string
  title: string
  link: string
  duration: number
  played: boolean
}

export type VideoBgMode = 'off' | 'webgl' | 'iframe'

interface BoothState {
  // Booth connection
  isConnected: boolean
  boothIndex: number | null

  // DJ queue
  djQueue: DJQueueEntry[]
  currentDjSessionId: string | null
  isInQueue: boolean

  // Per-player queue playlist (for current user)
  queuePlaylist: QueuePlaylistItem[]

  // Video background
  videoBackgroundEnabled: boolean
  videoBgMode: VideoBgMode
  videoBgLabel: string

  // Actions
  setBoothConnected: (connected: boolean, boothIndex?: number) => void
  setDJQueue: (entries: DJQueueEntry[], currentDjSessionId: string | null) => void
  setIsInQueue: (inQueue: boolean) => void
  setQueuePlaylist: (items: QueuePlaylistItem[]) => void
  toggleVideoBackground: () => void
  reorderQueueTrack: (fromIndex: number, toIndex: number) => void
  setVideoBackground: (enabled: boolean) => void
  setVideoBgMode: (mode: VideoBgMode) => void
  setVideoBgLabel: (label: string) => void
}

export const useBoothStore = create<BoothState>((set) => ({
  isConnected: false,
  boothIndex: null,

  djQueue: [],
  currentDjSessionId: null,
  isInQueue: false,

  queuePlaylist: [],

  videoBackgroundEnabled: true,
  videoBgMode: 'off',
  videoBgLabel: '',

  setBoothConnected: (connected, boothIndex) =>
    set({ isConnected: connected, boothIndex: boothIndex ?? null }),

  setDJQueue: (entries, currentDjSessionId) => set({ djQueue: entries, currentDjSessionId }),

  setIsInQueue: (inQueue) => set({ isInQueue: inQueue }),

  setQueuePlaylist: (items) => set({ queuePlaylist: items }),

  reorderQueueTrack: (fromIndex, toIndex) =>
    set((s) => {
      const items = [...s.queuePlaylist]
      const [moved] = items.splice(fromIndex, 1)
      items.splice(toIndex, 0, moved)

      return { queuePlaylist: items }
    }),

  toggleVideoBackground: () => set((s) => ({ videoBackgroundEnabled: !s.videoBackgroundEnabled })),

  setVideoBackground: (enabled) => set({ videoBackgroundEnabled: enabled }),

  setVideoBgMode: (mode) => set({ videoBgMode: mode }),

  setVideoBgLabel: (label) => set({ videoBgLabel: label }),
}))
