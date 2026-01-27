import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { createPortal } from 'react-dom'
import ReactPlayer from 'react-player/youtube'

import { useAppSelector } from './hooks'

import RoomSelectionDialog from './components/RoomSelectionDialog'
import LoginDialog from './components/LoginDialog'
import ChatPanel from './components/ChatPanel'
import MyPlaylistPanel from './components/MyPlaylistPanel'
import MuteButton from './components/MuteButton'
import YoutubePlayer from './components/YoutubePlayer'
import DjStatusPill from './components/DjStatusPill'
import MutantRippedAnimDebug from './components/MutantRippedAnimDebug'

import { RoomType } from '../../types/Rooms'

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2;
  pointer-events: none;
`

const PublicLobbyBackground = styled.img`
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  object-fit: fill;
  z-index: 0;
  pointer-events: none;
`

const VideoBackground = styled.div`
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    mix-blend-mode: multiply;
    z-index: 2;
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.35) 0,
      rgba(0, 0, 0, 0.35) 1px,
      rgba(0, 0, 0, 0) 2px,
      rgba(0, 0, 0, 0) 4px
    );
    opacity: 0.55;
    mix-blend-mode: multiply;
    z-index: 3;
  }

  > div {
    width: 100% !important;
    height: 100% !important;
    position: relative;
    z-index: 1;
  }

  iframe {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 200% !important;
    height: 130% !important;
    transform: translate(-50%, -50%);
    mix-blend-mode: hard-light;
  }
`

function PublicLobbyBackgroundPortal({ src }: { src: string }) {
  if (typeof document === 'undefined') return null

  return createPortal(<PublicLobbyBackground src={src} alt="" />, document.body)
}

function VideoBackgroundPortal({ url }: { url: string }) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <VideoBackground>
      <ReactPlayer url={url} playing muted controls={false} width="100%" height="100%" />
    </VideoBackground>,
    document.body
  )
}

function App() {
  const roomJoined = useAppSelector((state) => state.room.roomJoined)
  const loggedIn = useAppSelector((state) => state.user.loggedIn)
  const roomType = useAppSelector((state) => state.room.roomType)
  const backgroundGif = useAppSelector((state) => state.room.backgroundGif)
  const backgroundSeed = useAppSelector((state) => state.room.backgroundSeed)

  const videoBackgroundEnabled = useAppSelector((state) => state.musicStream.videoBackgroundEnabled)
  const streamLink = useAppSelector((state) => state.musicStream.link)
  const streamStartTime = useAppSelector((state) => state.musicStream.startTime)
  const isAmbient = useAppSelector((state) => state.musicStream.isAmbient)

  const [resolvedPublicGif, setResolvedPublicGif] = useState<string | null>(null)

  useEffect(() => {
    if (!roomJoined || roomType !== RoomType.PUBLIC) {
      setResolvedPublicGif(null)
      return
    }

    if (backgroundGif) {
      setResolvedPublicGif(backgroundGif)
      return
    }

    if (backgroundSeed === null) {
      setResolvedPublicGif(null)
      return
    }

    let cancelled = false

    fetch('assets/background/gif/manifest.json')
      .then((res) => res.json())
      .then((list: unknown) => {
        if (cancelled) return
        if (!Array.isArray(list) || list.length === 0) {
          setResolvedPublicGif(null)
          return
        }

        const strings = list.filter((x): x is string => typeof x === 'string')
        if (strings.length === 0) {
          setResolvedPublicGif(null)
          return
        }

        const idx = Math.abs(backgroundSeed) % strings.length
        setResolvedPublicGif(strings[idx])
      })
      .catch(() => {
        if (cancelled) return
        setResolvedPublicGif(null)
      })

    return () => {
      cancelled = true
    }
  }, [backgroundGif, backgroundSeed, roomJoined, roomType])

  let ui: JSX.Element
  if (loggedIn) {
    ui = (
      <>
        <MutantRippedAnimDebug />
        <DjStatusPill />
        <ChatPanel />
        <MyPlaylistPanel />
        <MuteButton />
        <YoutubePlayer />
      </>
    )
  } else if (roomJoined) {
    /* Render LoginDialog if not logged in but selected a room. */
    ui = <LoginDialog />
  } else {
    /* Render RoomSelectionDialog if yet selected a room. */
    ui = <RoomSelectionDialog />
  }

  return (
    <Backdrop>
      {roomJoined && videoBackgroundEnabled && streamLink && !isAmbient ? (
        <VideoBackgroundPortal
          url={`https://www.youtube.com/watch?v=${streamLink}#t=${Math.max(
            0,
            (Date.now() - streamStartTime) / 1000
          )}s`}
        />
      ) : null}

      {roomJoined &&
      roomType === RoomType.PUBLIC &&
      resolvedPublicGif &&
      !(videoBackgroundEnabled && streamLink && !isAmbient) ? (
        <PublicLobbyBackgroundPortal src={`assets/background/gif/${resolvedPublicGif}`} />
      ) : null}
      {ui}
    </Backdrop>
  )
}

export default App
