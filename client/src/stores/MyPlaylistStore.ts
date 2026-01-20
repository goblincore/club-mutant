import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { PlaylistItem } from '../../../types/IOfficeState'

const MY_PLAYLIST_STORAGE_KEY = 'club-mutant:my-playlist:v1'

const isPlaylistItem = (value: unknown): value is PlaylistItem => {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.djId === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.link === 'string' &&
    typeof candidate.duration === 'number'
  )
}

const loadPersistedItems = (): PlaylistItem[] => {
  try {
    const raw = localStorage.getItem(MY_PLAYLIST_STORAGE_KEY)

    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)

    if (!Array.isArray(parsed)) return []

    return parsed.filter(isPlaylistItem)
  } catch {
    return []
  }
}

interface MyPlaylistState {
  myPlaylistPanelOpen: boolean
  playQueue: Array<PlaylistItem>
  items: Array<PlaylistItem>
  focused: boolean
}

const initialState: MyPlaylistState = {
  myPlaylistPanelOpen: false,
  playQueue: new Array<PlaylistItem>(),
  items: loadPersistedItems(),
  focused: false,
}

export const myPlaylistSlice = createSlice({
  name: 'myPlaylist',
  initialState,
  reducers: {
    syncPlayQueue: (state) => {
      console.log('//reducer syncPlayQueue payload')
      //   if (state.items?.length > 0) {
      //     const stateItemsClone = [...state.items];
      //     const queueItems = stateItemsClone.slice(0, 1)

      //     console.log('REDUCER SYNC QUEUE SLICE', queueItems);
      //     console.log('REDUCER SYNC QUEUE', state.playQueue);

      //     const isFirstEqual = state.playQueue?.[0]?.link === state?.items?.[0]?.link

      //     const isSecondEqual = state.playQueue?.[1]?.link === state?.items?.[1]?.link
      //     if (!isFirstEqual || !isSecondEqual) {
      //       state.playQueue = queueItems
      //     }
      //   }
    },
    removeFromPlayQueue: (state, action: PayloadAction<PlaylistItem>) => {
      console.log('////REMOVE FROM PLAYLIST QUEUE', action.payload)

      state.playQueue = state.playQueue.filter((item) => item.link !== action.payload.link)
    },
    shiftMyPlaylist: (state) => {
      state.items = state.items.slice(1)
    },
    addItemToMyPlaylist: (state, action: PayloadAction<PlaylistItem>) => {
      state.items.push(action.payload)
    },
    removeItemFromMyPlaylist: (state, action: PayloadAction<number>) => {
      state.items.splice(action.payload, 1)
    },
    openMyPlaylistPanel: (state) => {
      state.myPlaylistPanelOpen = true
      const game = phaserGame.scene.keys.game as Game
      game.disableKeys()
    },
    closeMyPlaylistPanel: (state) => {
      const game = phaserGame.scene.keys.game as Game
      game.enableKeys()
      state.myPlaylistPanelOpen = false
    },
    setFocused: (state, action: PayloadAction<boolean>) => {
      const game = phaserGame.scene.keys.game as Game
      action.payload ? game.disableKeys() : game.enableKeys()
      state.focused = action.payload
    },
  },
})

export const {
  syncPlayQueue,
  addItemToMyPlaylist,
  removeItemFromMyPlaylist,
  openMyPlaylistPanel,
  closeMyPlaylistPanel,
  setFocused,
  shiftMyPlaylist,
  removeFromPlayQueue,
} = myPlaylistSlice.actions

export default myPlaylistSlice.reducer
