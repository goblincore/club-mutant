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

  background: radial-gradient(
    1100px 700px at 50% 45%,
    rgba(25, 255, 120, 0.11),
    rgba(0, 0, 0, 0.96)
  );
  background-color: #020403;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: repeating-linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.15) 0,
      rgba(0, 0, 0, 0.15) 1px,
      rgba(0, 0, 0, 0) 3px,
      rgba(0, 0, 0, 0) 5px
    );
    opacity: 0.35;
    mix-blend-mode: multiply;
  }
`

const Wrapper = styled.div`
  position: relative;
  border-radius: 18px;
  padding: 34px 54px;
  background: rgba(3, 10, 5, 0.88);
  border: 1px solid rgba(80, 255, 160, 0.25);
  box-shadow:
    0 0 0 1px rgba(0, 255, 140, 0.15),
    0 20px 60px rgba(0, 0, 0, 0.65),
    0 0 45px rgba(0, 255, 140, 0.16);
  backdrop-filter: blur(10px);

  &::after {
    content: '';
    position: absolute;
    inset: 10px;
    border-radius: 14px;
    pointer-events: none;
    box-shadow: inset 0 0 35px rgba(0, 255, 140, 0.12);
  }

  .MuiIconButton-root {
    color: rgba(130, 255, 180, 0.9);
  }
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
  font-size: 26px;
  color: rgba(170, 255, 205, 0.95);
  text-align: center;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow:
    0 0 18px rgba(0, 255, 140, 0.35),
    0 0 2px rgba(0, 255, 140, 0.45);
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
    filter: drop-shadow(0 0 18px rgba(0, 255, 140, 0.25));
  }
`

const TerminalButton = styled(Button)`
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  letter-spacing: 0.05em;
  text-transform: none;
  padding: 10px 14px;
  border-radius: 10px;
  color: rgba(165, 255, 205, 0.95);
  border: 1px solid rgba(80, 255, 160, 0.35);
  background: rgba(0, 0, 0, 0.22);
  box-shadow:
    0 0 0 1px rgba(0, 255, 140, 0.15),
    0 0 18px rgba(0, 255, 140, 0.12);

  &:hover {
    border: 1px solid rgba(80, 255, 160, 0.6);
    background: rgba(0, 30, 14, 0.45);
    box-shadow:
      0 0 0 1px rgba(0, 255, 140, 0.25),
      0 0 26px rgba(0, 255, 140, 0.22);
  }
`

const ProgressBarWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;

  h3 {
    color: rgba(165, 255, 205, 0.9);
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;
    letter-spacing: 0.05em;
  }
`

const ProgressBar = styled(LinearProgress)`
  width: 360px;
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
              <Button
                variant="contained"
                color="secondary"
                onClick={() => setShowCreateRoomForm(true)}
              >
                Create new room
              </Button>
            </CustomRoomWrapper>
          ) : (
            <>
              <Title>Club Mutant</Title>
              <Content>
                <img src="assets/ui/mutantspin.gif" alt="mutant" />
                <TerminalButton variant="outlined" disableRipple onClick={handleConnect}>
                  Connect to public lobby
                </TerminalButton>
                <TerminalButton
                  variant="outlined"
                  disableRipple
                  onClick={() => (lobbyJoined ? setShowCustomRoom(true) : setShowSnackbar(true))}
                >
                  Create/find custom rooms
                </TerminalButton>
              </Content>
            </>
          )}
        </Wrapper>
        {!lobbyJoined && (
          <ProgressBarWrapper>
            <h3> Connecting to server...</h3>
            <ProgressBar color="secondary" />
          </ProgressBarWrapper>
        )}
      </Backdrop>
    </>
  )
}
