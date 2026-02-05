import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { DJQueueEntryDto } from '@club-mutant/types/Dtos'

interface DJQueueState {
  entries: DJQueueEntryDto[]
  currentDjSessionId: string | null
  isInQueue: boolean
  myQueuePosition: number | null
}

const initialState: DJQueueState = {
  entries: [],
  currentDjSessionId: null,
  isInQueue: false,
  myQueuePosition: null,
}

export const djQueueSlice = createSlice({
  name: 'djQueue',
  initialState,
  reducers: {
    setDJQueue: (state, action: PayloadAction<{ entries: DJQueueEntryDto[]; currentDjSessionId: string | null }>) => {
      state.entries = action.payload.entries
      state.currentDjSessionId = action.payload.currentDjSessionId
    },
    updateDJQueueEntries: (state, action: PayloadAction<DJQueueEntryDto[]>) => {
      state.entries = action.payload
    },
    setCurrentDJ: (state, action: PayloadAction<string | null>) => {
      state.currentDjSessionId = action.payload
    },
    setIsInQueue: (state, action: PayloadAction<boolean>) => {
      state.isInQueue = action.payload
    },
    setMyQueuePosition: (state, action: PayloadAction<number | null>) => {
      state.myQueuePosition = action.payload
    },
    updateMyQueueStatus: (state, action: PayloadAction<{ sessionId: string }>) => {
      const myEntry = state.entries.find((e) => e.sessionId === action.payload.sessionId)
      state.isInQueue = !!myEntry
      state.myQueuePosition = myEntry?.queuePosition ?? null
    },
    leaveDJQueue: (state) => {
      state.isInQueue = false
      state.myQueuePosition = null
    },
    skipDJTurn: (state) => {
      // Just a marker action - actual logic handled by server
      console.log('[DJQueueStore] Skip turn requested')
    },
  },
})

export const {
  setDJQueue,
  updateDJQueueEntries,
  setCurrentDJ,
  setIsInQueue,
  setMyQueuePosition,
  updateMyQueueStatus,
  leaveDJQueue,
  skipDJTurn,
} = djQueueSlice.actions

export default djQueueSlice.reducer
