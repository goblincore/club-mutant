import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { IPlaylistItem } from '../../../types/IOfficeState'

// Redux store state
interface PlaylistState {
    playlistDialogOpen: boolean
    items: Array<IPlaylistItem>
    focused: boolean
}

const initialState: PlaylistState = {
    playlistDialogOpen: false,
    items: new Array<IPlaylistItem>(),
    focused: false,
}

export const playlistSlice = createSlice({
    name: 'playlist',
    initialState,
    reducers: {
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
    addItemToPlaylist,
    removeItemFromPlaylist,
    openPlaylistDialog,
    closePlaylistDialog,
    setFocused,
} = playlistSlice.actions

export default playlistSlice.reducer
