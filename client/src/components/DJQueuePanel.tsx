import { useState } from 'react'
import styled from 'styled-components'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import DragHandleIcon from '@mui/icons-material/DragHandle'

import { useAppSelector, useAppDispatch } from '../hooks'
import Game from '../scenes/Game'
import phaserGame from '../PhaserGame'
import {
  setRoomQueuePlaylistVisible,
  removeRoomQueuePlaylistItem,
  reorderRoomQueuePlaylistItems,
} from '../stores/RoomQueuePlaylistStore'
import { leaveDJQueue, skipDJTurn } from '../stores/DJQueueStore'
import { disconnectFromMusicBooth } from '../stores/MusicBoothStore'

const Container = styled.div`
  background: transparent;
  border: none;
  padding: 16px;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'Courier New', Courier, monospace;
`

const Title = styled.h3`
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: normal;
  color: rgba(255, 255, 255, 0.9);
`

const CurrentDJBanner = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 14px;
`

const QueuePosition = styled.div`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 12px;
`

const QueueList = styled.div`
  margin-bottom: 16px;
`

const QueueItem = styled.div<{ $isCurrent?: boolean }>`
  padding: 8px 12px;
  border-radius: 8px;
  background: ${props => props.$isCurrent ? 'rgba(255, 255, 255, 0.1)' : 'transparent'};
  border: ${props => props.$isCurrent ? '1px solid rgba(255, 255, 255, 0.25)' : 'none'};
  margin-bottom: 4px;
  font-size: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`

const PlaylistSection = styled.div`
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.25);
`

const PlaylistItem = styled.div<{ $isPlaying?: boolean; $isPlayed?: boolean }>`
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 8px;
  background: ${props => props.$isPlaying ? 'rgba(255, 255, 255, 0.1)' : props.$isPlayed ? 'rgba(255, 255, 255, 0.02)' : 'transparent'};
  border: ${props => props.$isPlaying ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid transparent'};
  margin-bottom: 4px;
  cursor: ${props => props.$isPlaying || props.$isPlayed ? 'default' : 'move'};
  opacity: ${props => props.$isPlaying ? 0.7 : props.$isPlayed ? 0.4 : 1};
  
  &:hover {
    background: ${props => props.$isPlaying ? 'rgba(255, 255, 255, 0.1)' : props.$isPlayed ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.05)'};
  }
`

const TrackInfo = styled.div`
  flex: 1;
  margin-left: 8px;
  
  .title {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.9);
  }
  
  .duration {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }
`

const ButtonGroup = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 16px;
  justify-content: flex-end;
`

const StyledButton = styled(Button)`
  && {
    text-transform: lowercase !important;
    font-family: 'Courier New', Courier, monospace;
    background: rgba(0, 0, 0, 0.35) !important;
    border: 1px solid rgba(255, 255, 255, 0.25) !important;
    color: rgba(255, 255, 255, 0.9) !important;
    
    &:hover {
      background: rgba(255, 255, 255, 0.1) !important;
    }
    
    &.leave-queue {
      color: rgba(255, 100, 100, 0.9) !important;
      border-color: rgba(255, 100, 100, 0.5) !important;
    }
  }
`

const IconButtonStyled = styled(IconButton)`
  && {
    color: rgba(255, 255, 255, 0.7);
    
    &:hover {
      color: rgba(255, 255, 255, 0.9);
    }
    
    &:disabled {
      color: rgba(255, 255, 255, 0.3);
    }
  }
`

const EmptyState = styled.div`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  padding: 16px;
  text-align: center;
`

const DragHandle = styled.div`
  cursor: grab;
  color: rgba(255, 255, 255, 0.5);
  
  &:active {
    cursor: grabbing;
  }
`

export default function DJQueuePanel() {
  const dispatch = useAppDispatch()
  const game = phaserGame.scene.keys.game as Game

  const djQueueEntries = useAppSelector((state) => state.djQueue.entries)
  const currentDjSessionId = useAppSelector((state) => state.djQueue.currentDjSessionId)
  const isInQueue = useAppSelector((state) => state.djQueue.isInQueue)
  const myQueuePosition = useAppSelector((state) => state.djQueue.myQueuePosition)
  const mySessionId = useAppSelector((state) => state.user.sessionId)
  const roomQueueItems = useAppSelector((state) => state.roomQueuePlaylist.items)

  const isCurrentDJ = currentDjSessionId === mySessionId
  const connectedBoothIndex = useAppSelector((state) => state.musicBooth.musicBoothIndex)
  const [draggedItem, setDraggedItem] = useState<number | null>(null)

  if (!isInQueue) return null

  const handleLeaveQueue = () => {
    game.network.leaveDJQueue()
    dispatch(leaveDJQueue())
    dispatch(setRoomQueuePlaylistVisible(false))

    // Exit booth if connected (this restores animation and movement)
    if (connectedBoothIndex !== null) {
      const exitedBooth = game.myPlayer.exitBoothIfConnected(game.network)
      if (exitedBooth) {
        console.log('[DJQueuePanel] Successfully exited booth')
      } else {
        // Fallback: if exitBoothIfConnected failed, still disconnect
        game.network.disconnectFromMusicBooth(connectedBoothIndex)
        dispatch(disconnectFromMusicBooth())
      }
    }
  }

  const handleSkipTurn = () => {
    if (isCurrentDJ) {
      game.network.skipDJTurn()
      dispatch(skipDJTurn())
    }
  }

  const handleRemoveTrack = (itemId: string) => {
    game.network.removeFromRoomQueuePlaylist(itemId)
    dispatch(removeRoomQueuePlaylistItem(itemId))
  }

  const handleDragStart = (index: number) => {
    // Don't allow dragging the currently playing track or played tracks
    if (index === 0 && isCurrentDJ) return
    const item = roomQueueItems[index]
    if ((item as any).played) return
    setDraggedItem(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedItem === null || draggedItem === index) return
    // Don't allow dropping on the currently playing track position or on played tracks
    if (index === 0 && isCurrentDJ) return
    const targetItem = roomQueueItems[index]
    if ((targetItem as any).played) return

    dispatch(reorderRoomQueuePlaylistItems({ fromIndex: draggedItem, toIndex: index }))
    game.network.reorderRoomQueuePlaylist(draggedItem, index)
    setDraggedItem(index)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
  }

  return (
    <Container>
      <Title>DJ Queue</Title>

      {/* Queue Position */}
      {!isCurrentDJ && myQueuePosition !== null && (
        <QueuePosition>
          Position in queue: #{myQueuePosition + 1}
        </QueuePosition>
      )}

      {/* Queue List */}
      <QueueList>
        {djQueueEntries.map((entry, index) => (
          <QueueItem key={entry.sessionId} $isCurrent={entry.sessionId === currentDjSessionId}>
            <span>{index === 0 ? '🎧 ' : ''}{entry.name}</span>
            <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
              {entry.sessionId === currentDjSessionId ? 'Currently playing' : `Position ${index + 1}`}
            </span>
          </QueueItem>
        ))}
      </QueueList>

      {/* My Room Queue Playlist */}
      <PlaylistSection>
        <Title style={{ fontSize: '14px' }}>
          My Queue Playlist ({roomQueueItems.length} tracks)
        </Title>

        {roomQueueItems.length === 0 ? (
          <EmptyState>Add tracks from your playlist below!</EmptyState>
        ) : (
          <div>
            {roomQueueItems.map((item, index) => {
              const isCurrentlyPlaying = index === 0 && isCurrentDJ
              const isPlayed = (item as any).played === true
              const isDraggable = !isCurrentlyPlaying && !isPlayed
              return (
                <PlaylistItem
                  key={item.id}
                  draggable={isDraggable}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  $isPlaying={isCurrentlyPlaying}
                  $isPlayed={isPlayed}
                >
                  <DragHandle style={{ cursor: isDraggable ? 'grab' : 'default' }}>
                    <DragHandleIcon fontSize="small" style={{ opacity: isDraggable ? 1 : 0.2 }} />
                  </DragHandle>
                  <TrackInfo>
                    <div className="title">{index + 1}. {item.title}</div>
                    <div className="duration">
                      {isCurrentlyPlaying ? 'Currently playing' : isPlayed ? 'Played' : `${Math.floor(item.duration / 60)}:${(item.duration % 60).toString().padStart(2, '0')}`}
                    </div>
                  </TrackInfo>
                  <IconButtonStyled
                    size="small"
                    onClick={() => handleRemoveTrack(item.id)}
                    disabled={isCurrentlyPlaying}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButtonStyled>
                </PlaylistItem>
              )
            })}
          </div>
        )}
      </PlaylistSection>

      {/* Control Buttons */}
      <ButtonGroup>
        {isCurrentDJ && djQueueEntries.length > 1 && (
          <StyledButton
            variant="contained"
            onClick={handleSkipTurn}
            startIcon={<SkipNextIcon />}
          >
            Skip My Turn
          </StyledButton>
        )}
        <StyledButton
          variant="outlined"
          onClick={handleLeaveQueue}
          className="leave-queue"
        >
          Leave Queue
        </StyledButton>
      </ButtonGroup>
    </Container>
  )
}
