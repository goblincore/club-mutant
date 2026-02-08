import React, { useState } from 'react'
import styled from 'styled-components'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import LinearProgress from '@mui/material/LinearProgress'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

import { CustomRoomTable } from './CustomRoomTable'
import { CreateRoomForm } from './CreateRoomForm'
import { useAppSelector } from '../hooks'

import phaserGame from '../PhaserGame'
import Bootstrap from '../scenes/Bootstrap'

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 40px;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  background: #ffffff;
`

const Wrapper = styled.div`
  position: relative;
  border-radius: 0;
  padding: 34px 54px;
  background: #ffffff;
  border: 2px solid #0000ff;
`

const CustomRoomWrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  justify-content: center;

  .tip {
    font-size: 18px;
  }
`

const BackButtonWrapper = styled.div`
  position: absolute;
  top: 0;
  left: 0;
`

const Title = styled.h1`
  font-size: 24px;
  color: #0000ff;
  text-align: center;
  font-family: 'Times New Roman', Times, serif;
  text-decoration: underline;
`

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 20px 0;
  align-items: center;
  justify-content: center;

  img {
    height: 140px;
    width: auto;
    image-rendering: pixelated;
  }
`

const TerminalButton = styled(Button)`
  && {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12px;
    text-transform: none;
    padding: 10px 20px;
    border-radius: 0;
    color: #0000ff;
    border: 2px solid #0000ff;
    background: #ffffff;

    &:hover {
      background: #0000ff;
      color: #ffffff;
      border: 2px solid #0000ff;
    }
  }
`

const ProgressBarWrapper = styled.div<{ $visible?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  visibility: ${(p) => (p.$visible ? 'visible' : 'hidden')};
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transition: opacity 0.2s ease;
  min-height: 60px;

  h3 {
    color: #0000ff;
    font-family: 'Times New Roman', Times, serif;
    font-size: 12px;
    font-weight: normal;
    margin: 0 0 8px 0;
  }
`

const ProgressBar = styled(LinearProgress)`
  width: 360px;

  &.MuiLinearProgress-root {
    background-color: #ccccff;
  }

  & .MuiLinearProgress-bar {
    background-color: #0000ff;
  }
`

export default function RoomSelectionDialog() {
  const [showCustomRoom, setShowCustomRoom] = useState(false)
  const [showCreateRoomForm, setShowCreateRoomForm] = useState(false)
  const [showSnackbar, setShowSnackbar] = useState(false)
  const lobbyJoined = useAppSelector((state) => state.room.lobbyJoined)

  const handleConnect = () => {
    if (lobbyJoined) {
      const bootstrap = phaserGame.scene.keys.bootstrap as Bootstrap
      bootstrap.network
        .joinOrCreatePublic()
        .then(() => bootstrap.launchGame())
        .catch((error) => console.error(error))
    } else {
      setShowSnackbar(true)
    }
  }

  return (
    <>
      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        open={showSnackbar}
        autoHideDuration={3000}
        onClose={() => {
          setShowSnackbar(false)
        }}
      >
        <Alert
          severity="error"
          variant="outlined"
          // overwrites the dark theme on render
          style={{ background: '#fdeded', color: '#7d4747' }}
        >
          Trying to connect to server, please try again!
        </Alert>
      </Snackbar>
      <Backdrop>
        <Wrapper>
          {showCreateRoomForm ? (
            <CustomRoomWrapper>
              <Title>Create Custom Room</Title>
              <BackButtonWrapper>
                <IconButton onClick={() => setShowCreateRoomForm(false)}>
                  <ArrowBackIcon />
                </IconButton>
              </BackButtonWrapper>
              <CreateRoomForm />
            </CustomRoomWrapper>
          ) : showCustomRoom ? (
            <CustomRoomWrapper>
              <Title>
                Custom Rooms
                <Tooltip
                  title="We update the results in realtime, no refresh needed!"
                  placement="top"
                >
                  <IconButton>
                    <HelpOutlineIcon className="tip" />
                  </IconButton>
                </Tooltip>
              </Title>
              <BackButtonWrapper>
                <IconButton onClick={() => setShowCustomRoom(false)}>
                  <ArrowBackIcon />
                </IconButton>
              </BackButtonWrapper>
              <CustomRoomTable />
              <TerminalButton
                variant="outlined"
                disableRipple
                onClick={() => setShowCreateRoomForm(true)}
              >
                Create new room
              </TerminalButton>
            </CustomRoomWrapper>
          ) : (
            <>
              <Title>Club Mutant</Title>
              <Content>
                <img src="assets/mutantpeeflower.gif" alt="mutant" />
                <TerminalButton variant="outlined" disableRipple onClick={handleConnect}>
                  Connect to the public lobby
                </TerminalButton>
                {/* Custom rooms hidden for now */}
                {/* <TerminalButton
                  variant="outlined"
                  disableRipple
                  onClick={() => (lobbyJoined ? setShowCustomRoom(true) : setShowSnackbar(true))}
                >
                  Create/find custom rooms
                </TerminalButton> */}
              </Content>
            </>
          )}
        </Wrapper>
        <ProgressBarWrapper $visible={!lobbyJoined}>
          <h3>Connecting to server...</h3>
          <ProgressBar />
        </ProgressBarWrapper>
      </Backdrop>
    </>
  )
}
