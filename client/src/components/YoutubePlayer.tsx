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


export default function YoutubePlayer() {
  const dispatch = useAppDispatch()
  const link = useAppSelector((state) => state.musicStream.link)
  const startTime = useAppSelector((state) => state.musicStream.startTime)

  const currentTime: number = new Date().getTime()
  const syncTime = (currentTime - startTime) / 1000;

  const playerRef = useRef<any>();

  const url = 'http://www.youtube.com/watch?v=' + link + '#t=' + syncTime + 's'

  const handleReady = e => {
    playerRef.current.seekTo(syncTime ,'seconds')
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
