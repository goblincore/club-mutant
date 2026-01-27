import { createSlice, PayloadAction } from '@reduxjs/toolkit'

type DJUserInfoState = {
  name: string | null
  sessionId: string | null
}

interface MusicStreamState {
  link: string | null
  title: string | null
  streamId: number
  startTime: number
  currentDj: DJUserInfoState
  isRoomPlaylist: boolean
  roomPlaylistIndex: number
  videoBackgroundEnabled: boolean
  isAmbient: boolean
}

const initialState: MusicStreamState = {
  link: null,
  title: null,
  streamId: 0,
  startTime: 0,
  currentDj: {
    name: null,
    sessionId: null,
  },
  isRoomPlaylist: false,
  roomPlaylistIndex: 0,
  videoBackgroundEnabled: false,
  isAmbient: false,
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
        streamId?: number
        startTime: number
        currentDj: DJUserInfoState
        isRoomPlaylist?: boolean
        roomPlaylistIndex?: number
        videoBackgroundEnabled?: boolean
        isAmbient?: boolean
      } | null>
    ) => {
      console.log('////action set music stream reducer', action)
      if (!action.payload) {
        state.link = null
        state.title = null
        state.streamId = 0
        state.startTime = 0
        state.currentDj = {
          name: null,
          sessionId: null,
        }
        state.isRoomPlaylist = false
        state.roomPlaylistIndex = 0
        state.videoBackgroundEnabled = false
        state.isAmbient = false
        return
      }

      try {
        state.link = action.payload.url
        state.title = action.payload.title
        state.streamId = action.payload.streamId ?? 0
        state.startTime = action.payload.startTime
        state.currentDj = action.payload.currentDj
        state.isRoomPlaylist = action.payload.isRoomPlaylist ?? false
        state.roomPlaylistIndex = action.payload.roomPlaylistIndex ?? 0
        state.videoBackgroundEnabled = action.payload.videoBackgroundEnabled ?? false
        state.isAmbient = action.payload.isAmbient ?? false
      } catch (e) {
        console.warn('Failed setting music stream')
      }
    },

    setVideoBackgroundEnabled: (state, action: PayloadAction<boolean>) => {
      state.videoBackgroundEnabled = action.payload
    },
  },
})

export const { setMusicStream, setVideoBackgroundEnabled } = musicStreamSlice.actions

export default musicStreamSlice.reducer
