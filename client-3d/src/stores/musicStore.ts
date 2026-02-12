import { create } from 'zustand'

export interface MusicStreamState {
  currentLink: string | null
  currentTitle: string | null
  currentDjName: string | null
  startTime: number
  duration: number
  isPlaying: boolean
  streamId: number
}

interface MusicState {
  stream: MusicStreamState

  setStream: (stream: Partial<MusicStreamState>) => void
  clearStream: () => void
}

const EMPTY_STREAM: MusicStreamState = {
  currentLink: null,
  currentTitle: null,
  currentDjName: null,
  startTime: 0,
  duration: 0,
  isPlaying: false,
  streamId: 0,
}

export const useMusicStore = create<MusicState>((set) => ({
  stream: { ...EMPTY_STREAM },

  setStream: (partial) => set((s) => ({ stream: { ...s.stream, ...partial } })),

  clearStream: () => set({ stream: { ...EMPTY_STREAM } }),
}))
