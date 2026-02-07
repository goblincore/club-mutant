import { useEffect } from 'react'
import styled from 'styled-components'
import { useAppSelector, useAppDispatch } from '../hooks'
import { hideBoothJoinConfirmation } from '../stores/MusicBoothStore'
import { setIsInQueue } from '../stores/DJQueueStore'
import { setRoomQueuePlaylistVisible } from '../stores/RoomQueuePlaylistStore'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
`

const Dialog = styled.div`
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  font-family: 'Courier New', Courier, monospace;
`

const Title = styled.h2`
  margin: 0 0 16px 0;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  text-transform: lowercase;
`

const Message = styled.p`
  margin: 0 0 24px 0;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  line-height: 1.5;
`

const ButtonRow = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`

const Button = styled.button<{ primary?: boolean }>`
  padding: 10px 20px;
  background: ${(props) => (props.primary ? 'rgba(255, 255, 255, 0.15)' : 'transparent')};
  border: 1px solid ${(props) => (props.primary ? '#fff' : 'rgba(255, 255, 255, 0.3)')};
  border-radius: 4px;
  color: #fff;
  font-family: 'Courier New', Courier, monospace;
  font-size: 14px;
  text-transform: lowercase;
  cursor: pointer;
  transition: all 0.2s;
  pointer-events: auto;
  user-select: none;

  &:hover {
    background: ${(props) => (props.primary ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)')};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
`

export default function BoothJoinConfirmation() {
  const dispatch = useAppDispatch()
  const showJoinConfirmation = useAppSelector((state) => state.musicBooth.showJoinConfirmation)
  const pendingBoothIndex = useAppSelector((state) => state.musicBooth.pendingBoothIndex)

  useEffect(() => {
    // Disable Phaser input when dialog is open
    const game = phaserGame.scene.keys.game as Game
    if (showJoinConfirmation && game) {
      game.disableKeys()
      // Also disable pointer input so clicks reach the React dialog
      game.input.enabled = false
      console.log('[BoothJoinConfirmation] Disabled Phaser input')
    }
    return () => {
      if (game) {
        game.enableKeys()
        game.input.enabled = true
        console.log('[BoothJoinConfirmation] Enabled Phaser input')
      }
    }
  }, [showJoinConfirmation])

  const handleConfirm = () => {
    console.log('[BoothJoinConfirmation] handleConfirm called', { pendingBoothIndex })
    if (pendingBoothIndex === null) {
      console.log('[BoothJoinConfirmation] pendingBoothIndex is null, aborting')
      return
    }

    const game = phaserGame.scene.keys.game as Game
    if (!game) {
      console.log('[BoothJoinConfirmation] game scene not found, aborting')
      return
    }

    // Get the booth from the map
    const booth = game.musicBoothMap.get(pendingBoothIndex)
    if (!booth) {
      console.log('[BoothJoinConfirmation] booth not found in map, aborting')
      return
    }

    // Enter the booth and join the queue
    const boothBounds = booth.getBounds()
    const approachX = boothBounds.centerX
    const approachY = boothBounds.bottom + 8

    // Calculate stand target position
    const standTarget = { x: approachX, y: approachY - 12 }

    console.log('[BoothJoinConfirmation] Queueing booth entry', { standTarget })
    // Queue the booth entry
    game.myPlayer.queueAutoEnterMusicBooth(booth, standTarget)

    // Close dialog
    dispatch(hideBoothJoinConfirmation())
  }

  const handleCancel = () => {
    console.log('[BoothJoinConfirmation] handleCancel called')
    dispatch(hideBoothJoinConfirmation())
  }

  if (!showJoinConfirmation) return null

  return (
    <Overlay onClick={handleCancel}>
      <Dialog onClick={(e) => e.stopPropagation()}>
        <Title>join dj booth?</Title>
        <Message>
          join the queue to play your tracks. you'll be added to the rotation with other DJs at this booth.
        </Message>
        <ButtonRow>
          <Button onClick={handleCancel}>cancel</Button>
          <Button primary onClick={handleConfirm}>
            join queue
          </Button>
        </ButtonRow>
      </Dialog>
    </Overlay>
  )
}
