import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface MusicStreamState {
  link: string | null
  title: string | null
  startTime: number
  currentDj: any
}

const initialState: MusicStreamState = {
  link: null,
  title: null,
  startTime: 0,
  currentDj: {
    name: null,
    sessionId: null,
  },
}

export const musicStreamSlice = createSlice({
  name: 'musicStream',
  initialState,
  reducers: {
    setMusicStream: (state, action: PayloadAction<any>) => {
      console.log('////action set music stream reducer', action)
      if (!action.payload) {
        state.link = null
        state.title = null
        state.startTime = 0
        state.currentDj = {
          name: null,
          sessionId: null,
        }
        return
      }

      try {
        state.link = action.payload.url
        state.title = action.payload.title
        state.startTime = action.payload.startTime
        state.currentDj = action.payload.currentDj
      } catch (e) {
        console.warn('Failed setting music stream')
      }
    },
  },
})

export const { setMusicStream } = musicStreamSlice.actions

export default musicStreamSlice.reducer
