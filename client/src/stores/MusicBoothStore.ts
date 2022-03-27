import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

// Redux store state
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
      const game = phaserGame.scene.keys.game as Game
      game.network.connectToMusicBooth(state.musicBoothIndex!)
      state.musicBoothIndex = action.payload
    },
    disconnectFromMusicBooth: (state) => {
      const game = phaserGame.scene.keys.game as Game
      game.network.disconnectFromMusicBooth(state.musicBoothIndex!)
      state.musicBoothIndex = null
    },
  },
})

export const { connectToMusicBooth, disconnectFromMusicBooth } =
  musicBoothSlice.actions

export default musicBoothSlice.reducer
