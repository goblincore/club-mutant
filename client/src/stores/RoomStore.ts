import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { RoomAvailable } from '@colyseus/sdk'
import { RoomType } from '@club-mutant/types/Rooms'

/**
 * Colyseus' real time room list always includes the public lobby so we have to remove it manually.
 */
const isCustomRoom = (room: RoomAvailable) => {
  return room.name === RoomType.CUSTOM
}

export const roomSlice = createSlice({
  name: 'room',
  initialState: {
    lobbyJoined: false,
    roomJoined: false,
    roomType: null as RoomType | null,
    roomId: '',
    roomName: '',
    roomDescription: '',
    backgroundGif: null as string | null,
    backgroundSeed: null as number | null,
    availableRooms: new Array<RoomAvailable>(),
  },
  reducers: {
    setLobbyJoined: (state, action: PayloadAction<boolean>) => {
      state.lobbyJoined = action.payload
    },
    setRoomJoined: (state, action: PayloadAction<boolean>) => {
      state.roomJoined = action.payload
    },
    setJoinedRoomType: (state, action: PayloadAction<RoomType | null>) => {
      state.roomType = action.payload
    },
    setJoinedRoomData: (
      state,
      action: PayloadAction<{
        id: string
        name: string
        description: string
        backgroundGif?: string | null
        backgroundSeed?: number | null
      }>
    ) => {
      state.roomId = action.payload.id
      state.roomName = action.payload.name
      state.roomDescription = action.payload.description
      state.backgroundGif = action.payload.backgroundGif ?? null
      state.backgroundSeed = action.payload.backgroundSeed ?? null
    },
    setAvailableRooms: (state, action: PayloadAction<RoomAvailable[]>) => {
      state.availableRooms = action.payload.filter((room) => isCustomRoom(room))
    },
    addAvailableRooms: (state, action: PayloadAction<{ roomId: string; room: RoomAvailable }>) => {
      if (!isCustomRoom(action.payload.room)) return
      const roomIndex = state.availableRooms.findIndex(
        (room) => room.roomId === action.payload.roomId
      )
      if (roomIndex !== -1) {
        state.availableRooms[roomIndex] = action.payload.room
      } else {
        state.availableRooms.push(action.payload.room)
      }
    },
    removeAvailableRooms: (state, action: PayloadAction<string>) => {
      state.availableRooms = state.availableRooms.filter((room) => room.roomId !== action.payload)
    },
  },
})

export const {
  setLobbyJoined,
  setRoomJoined,
  setJoinedRoomType,
  setJoinedRoomData,
  setAvailableRooms,
  addAvailableRooms,
  removeAvailableRooms,
} = roomSlice.actions

export default roomSlice.reducer
