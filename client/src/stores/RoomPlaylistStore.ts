import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export type RoomPlaylistItem = {
  id: string
  title: string
  link: string
  duration: number
  addedAtMs: number
  addedBySessionId: string
}

type RoomPlaylistState = {
  items: RoomPlaylistItem[]
}

const initialState: RoomPlaylistState = {
  items: [],
}

export const roomPlaylistSlice = createSlice({
  name: 'roomPlaylist',
  initialState,
  reducers: {
    setRoomPlaylist: (state, action: PayloadAction<RoomPlaylistItem[]>) => {
      state.items = action.payload
    },
    addRoomPlaylistItem: (state, action: PayloadAction<RoomPlaylistItem>) => {
      state.items.push(action.payload)
    },
    removeRoomPlaylistItem: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((item) => item.id !== action.payload)
    },
  },
})

export const { setRoomPlaylist, addRoomPlaylistItem, removeRoomPlaylistItem } =
  roomPlaylistSlice.actions

export default roomPlaylistSlice.reducer
