import styled from 'styled-components'

import { useAppSelector } from './hooks'

import RoomSelectionDialog from './components/RoomSelectionDialog'
import LoginDialog from './components/LoginDialog'
import MyPlaylistPanel from './components/MyPlaylistPanel'
import YoutubePlayer from './components/YoutubePlayer'
import ChatPanel from './components/ChatPanel'

const Backdrop = styled.div`
  position: absolute;
  height: 100%;
  width: 100%;
`

function App() {
  const roomJoined = useAppSelector((state) => state.room.roomJoined)
  const loggedIn = useAppSelector((state) => state.user.loggedIn)

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
      {ui}
    </Backdrop>
  )
}

export default App
