import { configureStore } from '@reduxjs/toolkit'
import { enableMapSet } from 'immer'

import userReducer from './UserStore'
import chatReducer from './ChatStore'
import roomReducer from './RoomStore'
import myPlaylistReducer from './MyPlaylistStore'
import roomPlaylistReducer from './RoomPlaylistStore'
import musicBoothReducer from './MusicBoothStore'
import musicStreamReducer from './MusicStreamStore'
import audioReducer from './AudioStore'

enableMapSet()

// redux combine all local stores into one big ass store we can access easily
const store = configureStore({
  reducer: {
    user: userReducer,
    myPlaylist: myPlaylistReducer,
    roomPlaylist: roomPlaylistReducer,
    musicBooth: musicBoothReducer,
    musicStream: musicStreamReducer,
    audio: audioReducer,
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

const MY_PLAYLIST_STORAGE_KEY = 'club-mutant:my-playlist:v1'

let lastPersistedMyPlaylistItemsJson: string | null = null

store.subscribe(() => {
  try {
    const { playlists, activePlaylistId, trackMetaById } = store.getState().myPlaylist
    const serialized = JSON.stringify({ playlists, activePlaylistId, trackMetaById })

    if (serialized === lastPersistedMyPlaylistItemsJson) return

    lastPersistedMyPlaylistItemsJson = serialized
    localStorage.setItem(MY_PLAYLIST_STORAGE_KEY, serialized)
  } catch {
    // ignore localStorage errors (private browsing, quota exceeded, etc.)
  }
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch

export default store
