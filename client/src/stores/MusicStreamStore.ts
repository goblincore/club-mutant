import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface MusicStreamState {
    link: string | null,
    title: string | null,
    startTime: number,
}

const initialState: MusicStreamState = {
    link: null,
    title: null,
    startTime: 0,
}

export const musicStreamSlice = createSlice({
    name: 'musicStream',
    initialState,
    reducers: {
        setMusicStream: (state, action: PayloadAction<any>) => {
            console.log('action', action);
            try{
            state.link = action?.payload?.url
            state.title = action?.payload.title
            state.startTime = action?.payload?.startTime
            }catch(e){
                console.warn('Failed setting music stream')
            }
        },
    },
})

export const { setMusicStream } = musicStreamSlice.actions

export default musicStreamSlice.reducer
