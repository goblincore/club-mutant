/* eslint-disable react-hooks/exhaustive-deps */
import React, { useRef, useEffect, useState } from 'react'
import ReactPlayer from 'react-player/youtube'
import styled from 'styled-components'
import Game from '../scenes/Game'
import phaserGame from '../PhaserGame'
import { useAppSelector, useAppDispatch } from '../hooks'
import { openPlaylistDialog, closePlaylistDialog, setFocused } from '../stores/PlaylistStore'
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
  color: #eee;
  display: flex;
  flex-direction: column;

  .close {
    margin: 0 0 0 auto;
    padding: 0;
  }
`
// Let's discuss with me over Skype or Gmail. Please contact me over Skype. I'd like to use Skype.
// Skype: live:.cid.d27127d2970dcbf9
// Gmail: mikoalas0414@gmail.com

// Don't use the words like Skype or Gmail, chatting on freelancer.com. We can be blocked by freelancer.com account team. It's not freelancer site rule.
// You can receive inquiries from them at any time. Why did you say "Skype"? They don't like the all contacts and chatting between clients and freelancers outside freelancer.com.

// I want to connect with you over Skype first. Or you can connect to me over web.skype.com. I am using web.skype.com now.

// I am waiting for you on Skype.

export default function YoutubePlayer() {
  const dispatch = useAppDispatch()
  const link = useAppSelector((state) => state.musicStream.link)
  const startTime = useAppSelector((state) => state.musicStream.startTime)
  const [isBuffering, setIsBuffering] = useState(true) 

  const currentTime: number = new Date().getTime()
      const syncTime = (currentTime - startTime) / 1000;
      const url = 'http://www.youtube.com/watch?v=' + link + '#t=' + syncTime + 's'

  const playerRef = useRef<any>();



  const handleReady = e => {
    console.log('playerReady');
    if(!isBuffering){
    const currentTime: number = new Date().getTime()
      const syncTime = (currentTime - startTime) / 1000;
     playerRef.current.seekTo(syncTime ,'seconds')
    }
  }

  const handleOnBufferEnd = () => {
     if(isBuffering){
       setIsBuffering(false);
     }
  }



  const game = phaserGame.scene.keys.game as Game
  return (
    <Backdrop>
      {
        link !== null ?
        <Wrapper>
          <ReactPlayer
            ref={playerRef}
            onReady={handleReady}
            onBufferEnd={handleOnBufferEnd}
            width={'200px'}
            height={'130px'}
            playing
            url={url} />
        </Wrapper>
        :
        <Wrapper>
        </Wrapper>
      }
    </Backdrop>
  )
}
