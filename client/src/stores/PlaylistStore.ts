import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { IPlaylistItem } from '../../../types/IOfficeState'

// Redux store state
interface PlaylistState {
  playlistDialogOpen: boolean
  playQueue: Array<IPlaylistItem>
  items: Array<IPlaylistItem>
  focused: boolean
}

const initialState: PlaylistState = {
  playlistDialogOpen: false,
  playQueue: new Array<IPlaylistItem>(),
  items: new Array<IPlaylistItem>(),
  focused: false,
}

export const playlistSlice = createSlice({
  name: 'playlist',
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
    removeFromPlayQueue: (state, action: PayloadAction<IPlaylistItem>) => {

        console.log('/////////////REMOVE FROM PLAYLIST QUEUE', action.payload);
       
        state.playQueue = state.playQueue.filter(item => item.link !== action.payload.link)

    },
    shiftPlaylist: (state) => {
        state.items = state.items.slice(1)
    },
    addItemToPlaylist: (state, action: PayloadAction<IPlaylistItem>) => {
      state.items.push(action.payload)
    },
    removeItemFromPlaylist: (state, action: PayloadAction<number>) => {
      state.items.slice(action.payload, 1)
    },
    openPlaylistDialog: (state) => {
      state.playlistDialogOpen = true
      const game = phaserGame.scene.keys.game as Game
      game.disableKeys()
    },
    closePlaylistDialog: (state) => {
      const game = phaserGame.scene.keys.game as Game
      game.enableKeys()
      state.playlistDialogOpen = false
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
  addItemToPlaylist,
  removeItemFromPlaylist,
  openPlaylistDialog,
  closePlaylistDialog,
  setFocused,
  shiftPlaylist,
  removeFromPlayQueue,
} = playlistSlice.actions

export default playlistSlice.reducer
