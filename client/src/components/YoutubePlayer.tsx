/* eslint-disable react-hooks/exhaustive-deps */
import { useRef, useState, useEffect } from 'react'
import ReactPlayer from 'react-player/youtube'
import styled from 'styled-components'
import Game from '../scenes/Game'
import phaserGame from '../PhaserGame'
import { useAppSelector, useAppDispatch } from '../hooks'
import { openPlaylistDialog, closePlaylistDialog, setFocused, shiftPlaylist } from '../stores/PlaylistStore'
import store from '../stores'

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  background: transparent;
  overflow: hidden;
  padding: 16px 16px 16px 16px;
`
const Wrapper = styled.div`
  width: 100%;
  height: 100%;
  background: #eee;
  border-radius: 16px;
  padding: 0;
  color: #666;
  display: flex;
  flex-direction: column;

  .close {
    margin: 0 0 0 auto;
    padding: 0;
  }
`

export default function YoutubePlayer() {
  const dispatch = useAppDispatch()
  const game = phaserGame.scene.keys.game as Game
  const link = useAppSelector((state) => state.musicStream.link)
  const startTime = useAppSelector((state) => state.musicStream.startTime)
  const title = useAppSelector((state) => state.musicStream.title)
  const currentDj = useAppSelector((state) => state.musicStream.currentDj)
  const [isBuffering, setIsBuffering] = useState(true) 
  const currentPlaylist = useAppSelector((state) => state.playlist)

  const currentTime: number = Date.now()
  const syncTime = (currentTime - startTime) / 1000;
  const url = 'http://www.youtube.com/watch?v=' + link + '#t=' + syncTime + 's'

  const playerRef = useRef<any>();

  const handleReady = e => {
    console.log('///////////////YoutubePlayer, handlePlay, e', e);
    if(!isBuffering){
    const currentTime: number = Date.now()
      const syncTime = (currentTime - startTime) / 1000;
     playerRef.current.seekTo(syncTime ,'seconds')
    }
  }




  const handleOnBufferEnd = () => {
    if(isBuffering){
      setIsBuffering(false);
    }
  }


  const handleOnEnded = () => {
     const nextItem = currentPlaylist.items[1];
     console.log('nextItem', nextItem);
     if(!isBuffering){
      setIsBuffering(true);
    }

    console.log('currentDj.sessoinId',currentDj?.sessionId)
    console.log('///myplayer game playerid', game.myPlayer.playerId)
    if(currentDj?.sessionId === game.myPlayer.playerId){
     dispatch(shiftPlaylist())
     if(nextItem){
      game.network.syncMusicStream(nextItem)
     }
    }
  }

  return (
    <Backdrop>
      {
        link !== null ?
        <Wrapper>
          <ReactPlayer
            ref={playerRef}
            onReady={handleReady}
            onEnded={handleOnEnded}
            onBufferEnd={handleOnBufferEnd}
            width={'200px'}
            height={'130px'}
            playing
            url={url} />
            <section>
            <p>{title}</p>
            </section>
        </Wrapper>
        :
          <Wrapper>
          </Wrapper>
      }
    </Backdrop>
  )
}
