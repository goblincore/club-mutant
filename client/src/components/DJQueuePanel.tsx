import { useState } from 'react'
import styled from 'styled-components'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import DragHandleIcon from '@mui/icons-material/DragHandle'
import AddIcon from '@mui/icons-material/Add'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

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
import { openMyPlaylistPanel, setFocused } from '../stores/MyPlaylistStore'

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

const QueuePosition = styled.div`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 12px;
`

const PlaylistSection = styled.div`
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.25);
`

const PlaylistScrollArea = styled.div`
  max-height: 200px;
  overflow-y: auto;
`

const PlaylistItem = styled.div<{ $isPlaying?: boolean; $isPlayed?: boolean }>`
  display: flex;
  align-items: center;
  padding: 4px 6px;
  border-radius: 6px;
  background: ${(props) =>
    props.$isPlaying
      ? 'rgba(255, 255, 255, 0.1)'
      : props.$isPlayed
        ? 'rgba(255, 255, 255, 0.02)'
        : 'transparent'};
  border: ${(props) =>
    props.$isPlaying ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid transparent'};
  margin-bottom: 2px;
  cursor: ${(props) => (props.$isPlaying || props.$isPlayed ? 'default' : 'move')};
  opacity: ${(props) => (props.$isPlaying ? 0.7 : props.$isPlayed ? 0.4 : 1)};

  &:hover {
    background: ${(props) =>
      props.$isPlaying
        ? 'rgba(255, 255, 255, 0.1)'
        : props.$isPlayed
          ? 'rgba(255, 255, 255, 0.03)'
          : 'rgba(255, 255, 255, 0.05)'};
  }
`

const TrackInfo = styled.div`
  flex: 1;
  margin-left: 6px;
  overflow: hidden;

  .title {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .duration {
    font-size: 11px;
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

const PickerSection = styled.div`
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
`

const PickerTitle = styled.div`
  font-size: 13px;
  font-weight: normal;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 6px;
`

const PickerListItem = styled.div`
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .playlist-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .playlist-count {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    margin-right: 4px;
    flex-shrink: 0;
  }
`

const PickerTrackList = styled.div`
  max-height: 200px;
  overflow-y: auto;
`

const PickerTrackItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .track-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-right: 8px;
  }

  .track-duration {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    margin-right: 4px;
    flex-shrink: 0;
  }
`

const PickerBackButton = styled.button`
  appearance: none;
  border: none;
  background: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-family: 'Courier New', Courier, monospace;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  margin-bottom: 6px;

  &:hover {
    color: rgba(255, 255, 255, 0.9);
  }
`

const OpenFullPanelLink = styled.button`
  appearance: none;
  border: none;
  background: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  font-family: 'Courier New', Courier, monospace;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 4px 0;

  &:hover {
    color: rgba(255, 255, 255, 0.9);
  }
`

const PickerEmptyState = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  padding: 8px;
  text-align: center;
`

function InlinePlaylistPicker() {
  const dispatch = useAppDispatch()
  const game = phaserGame.scene.keys.game as Game

  const playlists = useAppSelector((state) => state.myPlaylist.playlists)
  const [drilledPlaylistId, setDrilledPlaylistId] = useState<string | null>(null)

  const drilledPlaylist = playlists.find((p) => p.id === drilledPlaylistId) ?? null
  const tracks = drilledPlaylist?.items ?? []

  const formatDuration = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return ''
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const handleAddTrack = (link: string, title: string, duration: number) => {
    game.network.addToRoomQueuePlaylist({ title, link, duration })
  }

  const handleAddAllTracks = (playlist: {
    items: Array<{ link: string | null; title: string; duration: number }>
  }) => {
    for (const item of playlist.items) {
      if (item.link) {
        game.network.addToRoomQueuePlaylist({
          title: item.title,
          link: item.link,
          duration: item.duration,
        })
      }
    }
  }

  const handleOpenFullPanel = () => {
    dispatch(openMyPlaylistPanel())
    dispatch(setFocused(true))
  }

  // Drilled into a specific playlist — show its tracks
  if (drilledPlaylist) {
    return (
      <PickerSection>
        <PickerBackButton onClick={() => setDrilledPlaylistId(null)}>
          <ArrowBackIcon style={{ fontSize: 14 }} />
          Back to playlists
        </PickerBackButton>

        <PickerTitle>
          {drilledPlaylist.name} ({tracks.length} tracks)
        </PickerTitle>

        <PickerTrackList>
          {tracks.length === 0 ? (
            <PickerEmptyState>This playlist is empty.</PickerEmptyState>
          ) : (
            tracks.map((item) => (
              <PickerTrackItem key={item.id}>
                <span className="track-title">{item.title}</span>
                <span className="track-duration">{formatDuration(item.duration)}</span>
                <IconButtonStyled
                  size="small"
                  disabled={!item.link}
                  onClick={() => {
                    if (item.link) handleAddTrack(item.link, item.title, item.duration)
                  }}
                >
                  <AddIcon fontSize="small" />
                </IconButtonStyled>
              </PickerTrackItem>
            ))
          )}
        </PickerTrackList>

        <OpenFullPanelLink onClick={handleOpenFullPanel}>
          <OpenInNewIcon style={{ fontSize: 14 }} />
          Search or paste link in My Playlists
        </OpenFullPanelLink>
      </PickerSection>
    )
  }

  // Default: show playlist list
  return (
    <PickerSection>
      <PickerTitle>Add from my playlists</PickerTitle>

      {playlists.length === 0 ? (
        <PickerEmptyState>
          No playlists yet.
          <br />
          Open My Playlists to create one.
        </PickerEmptyState>
      ) : (
        playlists.map((p) => (
          <PickerListItem key={p.id}>
            <span className="playlist-name" onClick={() => setDrilledPlaylistId(p.id)}>
              {p.name}
            </span>

            <span className="playlist-count">{p.items.length} tracks</span>

            <IconButtonStyled
              size="small"
              disabled={p.items.length === 0}
              onClick={() => handleAddAllTracks(p)}
              title="Add all tracks to queue"
            >
              <AddIcon fontSize="small" />
            </IconButtonStyled>
          </PickerListItem>
        ))
      )}

      <OpenFullPanelLink onClick={handleOpenFullPanel}>
        <OpenInNewIcon style={{ fontSize: 14 }} />
        Search or paste link in My Playlists
      </OpenFullPanelLink>
    </PickerSection>
  )
}

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
  const isActivelyStreaming = useAppSelector((state) => state.musicStream.link !== null)
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
        <QueuePosition>Position in queue: #{myQueuePosition + 1}</QueuePosition>
      )}

      {/* My Room Queue Playlist */}
      <PlaylistSection>
        <Title style={{ fontSize: '14px' }}>
          My Queue Playlist ({roomQueueItems.length} tracks)
        </Title>

        {roomQueueItems.length === 0 ? (
          <EmptyState>Add tracks below or from your playlists</EmptyState>
        ) : (
          <PlaylistScrollArea>
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
                    <div className="title">
                      {index + 1}. {item.title}
                    </div>
                    <div className="duration">
                      {isCurrentlyPlaying
                        ? isActivelyStreaming
                          ? 'Now playing'
                          : 'Up next'
                        : isPlayed
                          ? 'Played'
                          : `${Math.floor(item.duration / 60)}:${(item.duration % 60).toString().padStart(2, '0')}`}
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
          </PlaylistScrollArea>
        )}
      </PlaylistSection>

      {/* Inline Playlist Picker */}
      <InlinePlaylistPicker />

      {/* Control Buttons */}
      <ButtonGroup>
        {isCurrentDJ && djQueueEntries.length > 1 && (
          <StyledButton variant="contained" onClick={handleSkipTurn} startIcon={<SkipNextIcon />}>
            Skip My Turn
          </StyledButton>
        )}
        <StyledButton variant="outlined" onClick={handleLeaveQueue} className="leave-queue">
          Leave Queue
        </StyledButton>
      </ButtonGroup>
    </Container>
  )
}
