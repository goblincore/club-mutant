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

import { timeSync } from './services/TimeSync'

import { RoomType } from '../../types/Rooms'

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

const VideoBackgroundKickOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 16px;

  button {
    pointer-events: auto;
    border: 0;
    border-radius: 10px;
    padding: 10px 12px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 12px;
    cursor: pointer;
  }
`

function PublicLobbyBackgroundPortal({ src }: { src: string }) {
  if (typeof document === 'undefined') return null

  return createPortal(<PublicLobbyBackground src={src} alt="" />, document.body)
}

function VisualImageBackgroundPortal({ src }: { src: string }) {
  if (typeof document === 'undefined') return null

  return createPortal(<VisualImageBackground src={src} alt="" />, document.body)
}

function VideoBackgroundPortal({ url, streamStartTime }: { url: string; streamStartTime: number }) {
  if (typeof document === 'undefined') return null

  const playerRef = useRef<ReactPlayer | null>(null)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)

  const attemptStart = useCallback(() => {
    const expectedSeconds = Math.max(0, (timeSync.getServerNowMs() - streamStartTime) / 1000)
    const internalPlayer = playerRef.current?.getInternalPlayer?.()
    internalPlayer?.seekTo?.(Math.max(0, Math.floor(expectedSeconds)), true)
    internalPlayer?.playVideo?.()
  }, [streamStartTime])

  useEffect(() => {
    setAutoplayBlocked(false)
    const timeoutId = window.setTimeout(() => {
      setAutoplayBlocked(true)
    }, 2_500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [url, streamStartTime])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      window.setTimeout(() => {
        attemptStart()
      }, 150)
    }

    const handleFocus = () => {
      if (document.visibilityState !== 'visible') return
      window.setTimeout(() => {
        attemptStart()
      }, 150)
    }

    const handlePageShow = () => {
      if (document.visibilityState !== 'visible') return
      window.setTimeout(() => {
        attemptStart()
      }, 150)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [attemptStart])

  useEffect(() => {
    if (!autoplayBlocked) return

    const kick = () => {
      attemptStart()
    }

    window.addEventListener('pointerdown', kick)
    window.addEventListener('keydown', kick)

    return () => {
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
    }
  }, [attemptStart, autoplayBlocked])

  return createPortal(
    <>
      <VideoBackground>
        <ReactPlayer
          ref={playerRef}
          url={url}
          playing
          muted
          controls={false}
          width="100%"
          height="100%"
          onReady={() => {
            attemptStart()
          }}
          onPlay={() => {
            setAutoplayBlocked(false)
          }}
          config={{
            playerVars: {
              autoplay: 1,
              controls: 0,
              disablekb: 1,
              fs: 0,
              modestbranding: 1,
              mute: 1,
              playsinline: 1,
              start: Math.max(0, Math.floor((timeSync.getServerNowMs() - streamStartTime) / 1000)),
            },
          }}
        />
      </VideoBackground>
      {autoplayBlocked ? (
        <VideoBackgroundKickOverlay>
          <button
            type="button"
            onClick={() => {
              attemptStart()
            }}
          >
            Enable background video
          </button>
        </VideoBackgroundKickOverlay>
      ) : null}
    </>,
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
      {roomJoined && videoBackgroundEnabled && streamLink && !isAmbient
        ? (() => {
            const source = visualUrl && visualUrl.trim() !== '' ? visualUrl.trim() : streamLink

            const isProbablyImage =
              source.startsWith('http') &&
              (source.endsWith('.png') ||
                source.endsWith('.jpg') ||
                source.endsWith('.jpeg') ||
                source.endsWith('.gif') ||
                source.endsWith('.webp'))

            if (isProbablyImage) {
              return <VisualImageBackgroundPortal src={source} />
            }

            const url =
              source.includes('youtube.com') || source.includes('youtu.be')
                ? source
                : `https://www.youtube.com/watch?v=${source}`

            return <VideoBackgroundPortal url={url} streamStartTime={streamStartTime} />
          })()
        : null}

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
