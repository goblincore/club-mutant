import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface MusicBoothState {
  musicBoothIndex: null | number
  showJoinConfirmation: boolean
  pendingBoothIndex: number | null
}

const initialState: MusicBoothState = {
  musicBoothIndex: null,
  showJoinConfirmation: false,
  pendingBoothIndex: null,
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
    showBoothJoinConfirmation: (state, action: PayloadAction<number>) => {
      state.showJoinConfirmation = true
      state.pendingBoothIndex = action.payload
    },
    hideBoothJoinConfirmation: (state) => {
      state.showJoinConfirmation = false
      state.pendingBoothIndex = null
    },
  },
})

export const {
  connectToMusicBooth,
  disconnectFromMusicBooth,
  showBoothJoinConfirmation,
  hideBoothJoinConfirmation,
} = musicBoothSlice.actions

export default musicBoothSlice.reducer
