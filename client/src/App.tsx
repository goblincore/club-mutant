import styled from 'styled-components'

import { useAppSelector } from './hooks'

import RoomSelectionDialog from './components/RoomSelectionDialog'
import LoginDialog from './components/LoginDialog'
import PlaylistDialog from './components/PlaylistDialog'
import YoutubePlayer from './components/YoutubePlayer'
import Chat from './components/Chat'

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
        <Chat />
        <PlaylistDialog />
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
