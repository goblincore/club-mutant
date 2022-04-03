import { configureStore } from '@reduxjs/toolkit'
import { enableMapSet } from 'immer'

import userReducer from './UserStore'
import chatReducer from './ChatStore'
import roomReducer from './RoomStore'
import myPlaylistReducer from './MyPlaylistStore';
import musicBoothReducer from './MusicBoothStore';
import musicStreamReducer from './MusicStreamStore';
import playlistReducer from './PlaylistStore';

enableMapSet()

// redux combine all local stores into one big ass store we can access easily
const store = configureStore({
  reducer: {
    user: userReducer,
    myPlaylist: myPlaylistReducer,
    playlist: playlistReducer,
    musicBooth: musicBoothReducer,
    musicStream: musicStreamReducer,
    chat: chatReducer,
    room: roomReducer,
  },
  // Temporary disable serialize check for redux as we store MediaStream in ComputerStore.
  // https://stackoverflow.com/a/63244831
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch

export default store
