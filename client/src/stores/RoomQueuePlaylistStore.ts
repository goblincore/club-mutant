import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RoomQueuePlaylistItemDto } from '@club-mutant/types/Dtos'

interface RoomQueuePlaylistState {
  items: RoomQueuePlaylistItemDto[]
  isVisible: boolean
}

const initialState: RoomQueuePlaylistState = {
  items: [],
  isVisible: false,
}

export const roomQueuePlaylistSlice = createSlice({
  name: 'roomQueuePlaylist',
  initialState,
  reducers: {
    setRoomQueuePlaylist: (state, action: PayloadAction<RoomQueuePlaylistItemDto[]>) => {
      state.items = action.payload
    },
    addRoomQueuePlaylistItem: (state, action: PayloadAction<RoomQueuePlaylistItemDto>) => {
      state.items.push(action.payload)
    },
    removeRoomQueuePlaylistItem: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((item) => item.id !== action.payload)
    },
    reorderRoomQueuePlaylistItems: (
      state,
      action: PayloadAction<{ fromIndex: number; toIndex: number }>
    ) => {
      const { fromIndex, toIndex } = action.payload
      if (fromIndex === toIndex) return
      if (fromIndex < 0 || toIndex < 0) return
      if (fromIndex >= state.items.length || toIndex >= state.items.length) return

      const [item] = state.items.splice(fromIndex, 1)
      if (item) {
        state.items.splice(toIndex, 0, item)
      }
    },
    setRoomQueuePlaylistVisible: (state, action: PayloadAction<boolean>) => {
      state.isVisible = action.payload
    },
    clearRoomQueuePlaylist: (state) => {
      state.items = []
    },
  },
})

export const {
  setRoomQueuePlaylist,
  addRoomQueuePlaylistItem,
  removeRoomQueuePlaylistItem,
  reorderRoomQueuePlaylistItems,
  setRoomQueuePlaylistVisible,
  clearRoomQueuePlaylist,
} = roomQueuePlaylistSlice.actions

export default roomQueuePlaylistSlice.reducer
