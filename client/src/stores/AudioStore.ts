import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface AudioState {
  muted: boolean
}

const initialState: AudioState = {
  muted: false,
}

export const audioSlice = createSlice({
  name: 'audio',
  initialState,
  reducers: {
    setMuted: (state, action: PayloadAction<boolean>) => {
      state.muted = action.payload
    },
    toggleMuted: (state) => {
      state.muted = !state.muted
    },
  },
})

export const { setMuted, toggleMuted } = audioSlice.actions

export default audioSlice.reducer
