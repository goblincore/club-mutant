import styled from 'styled-components'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'

import { useAppDispatch, useAppSelector } from '../hooks'
import { toggleMuted } from '../stores/AudioStore'

const Wrapper = styled.div`
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 20;
  pointer-events: auto;

  button {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.25);
    backdrop-filter: blur(8px);
    color: rgba(255, 255, 255, 0.9);
  }
`

export default function MuteButton() {
  const dispatch = useAppDispatch()
  const muted = useAppSelector((state) => state.audio.muted)

  return (
    <Wrapper>
      <Tooltip title={muted ? 'Unmute' : 'Mute'}>
        <IconButton
          aria-label={muted ? 'unmute audio' : 'mute audio'}
          size="small"
          onClick={() => dispatch(toggleMuted())}
        >
          {muted ? <VolumeOffIcon fontSize="inherit" /> : <VolumeUpIcon fontSize="inherit" />}
        </IconButton>
      </Tooltip>
    </Wrapper>
  )
}
