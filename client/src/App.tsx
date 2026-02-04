import { useCallback, useEffect, useRef, useState } from 'react'
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
import ElectronFeatures from './components/ElectronFeatures'

import { timeSync } from './services/TimeSync'

import { RoomType } from '@club-mutant/types/Rooms'

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2;
  pointer-events: none;
`

const VisualImageBackground = styled.img`
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  object-fit: cover;
  z-index: 0;
  pointer-events: none;
  filter: contrast(1.05) saturate(0.95);
`

const TrackMessageOverlay = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  top: 16px;
  z-index: 2;
  pointer-events: none;
  overflow: hidden;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0.8px 0.8px rgba(0, 0, 0, 0.85);
  font-size: 14px;

  .track {
    display: inline-block;
    padding: 10px 16px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(8px);
    transform: translateX(100%);
    animation: track-marquee 16s linear infinite;
  }

  @keyframes track-marquee {
    0% {
      transform: translateX(100%);
    }
    100% {
      transform: translateX(-120%);
    }
  }
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

function PublicLobbyBackgroundPortal({ src }: { src: string }) {
  if (typeof document === 'undefined') return null

  return createPortal(<PublicLobbyBackground src={src} alt="" />, document.body)
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
  const visualUrl = useAppSelector((state) => state.musicStream.visualUrl)
  const trackMessage = useAppSelector((state) => state.musicStream.trackMessage)

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
        <ElectronFeatures />
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
      {roomJoined && !isAmbient && trackMessage && trackMessage.trim() !== '' ? (
        <TrackMessageOverlay>
          <div className="track">{trackMessage}</div>
        </TrackMessageOverlay>
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
