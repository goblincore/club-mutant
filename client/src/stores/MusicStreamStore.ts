import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface MusicStreamState {
    link: string | null,
    startTime: number,
}

const initialState: MusicStreamState = {
    link: null,
    startTime: 0,
}

export const musicStreamSlice = createSlice({
    name: 'musicStream',
    initialState,
    reducers: {
        setMusicStream: (state, action: PayloadAction<any>) => {
            console.log('action', action);
            state.link = action?.payload?.url
            state.startTime = action?.payload?.startTime
        },
    },
})

export const { setMusicStream } = musicStreamSlice.actions

export default musicStreamSlice.reducer
