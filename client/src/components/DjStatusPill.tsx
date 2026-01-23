import styled from 'styled-components'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import CloseIcon from '@mui/icons-material/Close'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

import { useAppSelector } from '../hooks'

const Wrapper = styled.div`
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  pointer-events: auto;

  display: flex;
  align-items: center;
  gap: 8px;

  padding: 6px 10px;

  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 999px;

  color: rgba(0, 0, 0, 0.85);
  font-family: Arial, sans-serif;
  font-size: 12px;

  backdrop-filter: blur(8px);

  button {
    background: transparent;
    color: rgba(0, 0, 0, 0.7);
  }

  button:hover {
    background: rgba(0, 0, 0, 0.06);
  }
`

export default function DjStatusPill() {
  const connectedBoothIndex = useAppSelector((state) => state.musicBooth.musicBoothIndex)

  if (connectedBoothIndex === null) return null

  const handleLeave = () => {
    const game = phaserGame.scene.keys.game as Game

    game.myPlayer.requestLeaveMusicBooth()
  }

  return (
    <Wrapper>
      <div>You are the DJ</div>
      <Tooltip title="Leave DJ mode">
        <IconButton aria-label="leave DJ mode" size="small" onClick={handleLeave}>
          <CloseIcon fontSize="inherit" />
        </IconButton>
      </Tooltip>
    </Wrapper>
  )
}
