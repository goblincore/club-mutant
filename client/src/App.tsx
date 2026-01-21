import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { createPortal } from 'react-dom'

import { useAppSelector } from './hooks'

import RoomSelectionDialog from './components/RoomSelectionDialog'
import LoginDialog from './components/LoginDialog'
import ChatPanel from './components/ChatPanel'
import MyPlaylistPanel from './components/MyPlaylistPanel'
import YoutubePlayer from './components/YoutubePlayer'

import { RoomType } from '../../types/Rooms'

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2;
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
        <ChatPanel />
        <MyPlaylistPanel />
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
      {roomJoined && roomType === RoomType.PUBLIC && resolvedPublicGif ? (
        <PublicLobbyBackgroundPortal src={`assets/background/gif/${resolvedPublicGif}`} />
      ) : null}
      {ui}
    </Backdrop>
  )
}

export default App
