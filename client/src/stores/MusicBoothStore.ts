import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface MusicBoothState {
  musicBoothIndex: null | number
}

const initialState: MusicBoothState = {
  musicBoothIndex: null,
}

export const musicBoothSlice = createSlice({
  name: 'musicBooth',
  initialState,
  reducers: {
    connectToMusicBooth: (state, action: PayloadAction<number>) => {
      state.musicBoothIndex = action.payload
    },
    disconnectFromMusicBooth: (state) => {
      state.musicBoothIndex = null
    },
  },
})

export const { connectToMusicBooth, disconnectFromMusicBooth } = musicBoothSlice.actions

export default musicBoothSlice.reducer
