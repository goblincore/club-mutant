import { createSlice, PayloadAction } from '@reduxjs/toolkit'

type DJUserInfoState = {
  name: string | null
  sessionId: string | null
}

interface MusicStreamState {
  link: string | null
  title: string | null
  startTime: number
  currentDj: DJUserInfoState
  isRoomPlaylist: boolean
  roomPlaylistIndex: number
}

const initialState: MusicStreamState = {
  link: null,
  title: null,
  startTime: 0,
  currentDj: {
    name: null,
    sessionId: null,
  },
  isRoomPlaylist: false,
  roomPlaylistIndex: 0,
}

export const musicStreamSlice = createSlice({
  name: 'musicStream',
  initialState,
  reducers: {
    setMusicStream: (
      state,
      action: PayloadAction<{
        url: string | null
        title: string | null
        startTime: number
        currentDj: DJUserInfoState
        isRoomPlaylist?: boolean
        roomPlaylistIndex?: number
      } | null>
    ) => {
      console.log('////action set music stream reducer', action)
      if (!action.payload) {
        state.link = null
        state.title = null
        state.startTime = 0
        state.currentDj = {
          name: null,
          sessionId: null,
        }
        state.isRoomPlaylist = false
        state.roomPlaylistIndex = 0
        return
      }

      try {
        state.link = action.payload.url
        state.title = action.payload.title
        state.startTime = action.payload.startTime
        state.currentDj = action.payload.currentDj
        state.isRoomPlaylist = action.payload.isRoomPlaylist ?? false
        state.roomPlaylistIndex = action.payload.roomPlaylistIndex ?? 0
      } catch (e) {
        console.warn('Failed setting music stream')
      }
    },
  },
})

export const { setMusicStream } = musicStreamSlice.actions

export default musicStreamSlice.reducer
