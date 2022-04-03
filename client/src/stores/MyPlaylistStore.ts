import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { IPlaylistItem } from '../../../types/IOfficeState'

interface MyPlaylistState {
    myPlaylistPanelOpen: boolean
    items: Array<IPlaylistItem>
    focused: boolean
}

const initialState: MyPlaylistState = {
    myPlaylistPanelOpen: false,
    items: new Array<IPlaylistItem>(),
    focused: false,
}

export const myPlaylistSlice = createSlice({
    name: 'myPlaylist',
    initialState,
    reducers: {
        addItemToMyPlaylist: (state, action: PayloadAction<IPlaylistItem>) => {
            state.items.push(action.payload)
        },
        removeItemFromMyPlaylist: (state, action: PayloadAction<number>) => {
            state.items.slice(action.payload, 1)
        },
        openMyPlaylistPanel: (state) => {
            state.myPlaylistPanelOpen = true
            const game = phaserGame.scene.keys.game as Game
            game.disableKeys()
            console.log("///////////////MyPlaylistStore, openMyPlaylistPanel, disableKeys")
        },
        closeMyPlaylistPanel: (state) => {
            const game = phaserGame.scene.keys.game as Game
            game.enableKeys()
            console.log("///////////////MyPlaylistStore, closeMyPlaylistPanel, enableKeys")
            state.myPlaylistPanelOpen = false
        },
        setFocused: (state, action: PayloadAction<boolean>) => {
            const game = phaserGame.scene.keys.game as Game
            action.payload ? game.disableKeys() : game.enableKeys()
            console.log("///////////////MyPlaylistStore, setFocused, action.payload", action.payload)
            state.focused = action.payload
        },
    },
})

export const {
    addItemToMyPlaylist,
    removeItemFromMyPlaylist,
    openMyPlaylistPanel,
    closeMyPlaylistPanel,
    setFocused,
} = myPlaylistSlice.actions

export default myPlaylistSlice.reducer
