import { create } from 'zustand'

export interface MusicStreamState {
  currentLink: string | null
  currentTitle: string | null
  currentDjName: string | null
  startTime: number
  duration: number
  isPlaying: boolean
}

export interface RoomPlaylistItem {
  id: string
  title: string
  link: string
  duration: number
  addedAtMs: number
  addedBySessionId: string
}

interface MusicState {
  stream: MusicStreamState
  roomPlaylist: RoomPlaylistItem[]

  setStream: (stream: Partial<MusicStreamState>) => void
  clearStream: () => void
  setRoomPlaylist: (items: RoomPlaylistItem[]) => void
  addRoomPlaylistItem: (item: RoomPlaylistItem) => void
  removeRoomPlaylistItem: (id: string) => void
}

const EMPTY_STREAM: MusicStreamState = {
  currentLink: null,
  currentTitle: null,
  currentDjName: null,
  startTime: 0,
  duration: 0,
  isPlaying: false,
}

export const useMusicStore = create<MusicState>((set) => ({
  stream: { ...EMPTY_STREAM },
  roomPlaylist: [],

  setStream: (partial) => set((s) => ({ stream: { ...s.stream, ...partial } })),

  clearStream: () => set({ stream: { ...EMPTY_STREAM } }),

  setRoomPlaylist: (items) => set({ roomPlaylist: items }),

  addRoomPlaylistItem: (item) => set((s) => ({ roomPlaylist: [...s.roomPlaylist, item] })),

  removeRoomPlaylistItem: (id) =>
    set((s) => ({
      roomPlaylist: s.roomPlaylist.filter((i) => i.id !== id),
    })),
}))
