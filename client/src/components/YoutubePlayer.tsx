/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useCallback } from 'react'
import IconButton from '@mui/material/IconButton'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import MinimizeIcon from '@mui/icons-material/Minimize'

import Game from '../scenes/Game'
import phaserGame from '../PhaserGame'
import { useAppSelector, useAppDispatch } from '../hooks'
import { phaserEvents, Event } from '../events/EventCenter'
import { shiftMyPlaylist } from '../stores/MyPlaylistStore'
import { setVideoBackgroundEnabled } from '../stores/MusicStreamStore'
import { RoomType } from '@club-mutant/types/Rooms'

import { Backdrop, MiniBar, Marquee, MarqueeInner, MarqueeMetadata, Wrapper, RoomInfo, JoinQueueContainer, JoinQueueSubtitle, JoinQueueButton, JoinQueueMiniBar } from './YoutubePlayer.styles'
import { PlayerControls } from './PlayerControls'
import { RoomPlaylistView } from './RoomPlaylistView'
import { VideoPlayer } from './VideoPlayer'
import { usePlayerSync } from './usePlayerSync'
import DJQueuePanel from './DJQueuePanel'
import AddIcon from '@mui/icons-material/Add'
import { setIsInQueue } from '../stores/DJQueueStore'
import { setRoomQueuePlaylistVisible } from '../stores/RoomQueuePlaylistStore'

// Helper function to format time as MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function YoutubePlayer() {
  const dispatch = useAppDispatch()
  const game = phaserGame.scene.keys.game as Game

  // Redux selectors
  const roomType = useAppSelector((state) => state.room.roomType)
  const globallyMuted = useAppSelector((state) => state.audio.muted)
  const link = useAppSelector((state) => state.musicStream.link)
  const streamId = useAppSelector((state) => state.musicStream.streamId)
  const startTime = useAppSelector((state) => state.musicStream.startTime)
  const title = useAppSelector((state) => state.musicStream.title)
  const currentDj = useAppSelector((state) => state.musicStream.currentDj)
  const isRoomPlaylist = useAppSelector((state) => state.musicStream.isRoomPlaylist)
  const roomPlaylistIndex = useAppSelector((state) => state.musicStream.roomPlaylistIndex)
  const videoBackgroundEnabled = useAppSelector((state) => state.musicStream.videoBackgroundEnabled)
  const isAmbient = useAppSelector((state) => state.musicStream.isAmbient)
  const connectedBoothIndex = useAppSelector((state) => state.musicBooth.musicBoothIndex)
  const mySessionId = useAppSelector((state) => state.user.sessionId)
  const roomPlaylist = useAppSelector((state) => state.roomPlaylist.items)
  const myPlaylists = useAppSelector((state) => state.myPlaylist.playlists)
  const activePlaylistId = useAppSelector((state) => state.myPlaylist.activePlaylistId)
  const activePlaylist = myPlaylists.find((p) => p.id === activePlaylistId) ?? null
  const activeItems = activePlaylist?.items ?? []

  // Local state
  const [minimized, setMinimized] = useState(false)
  const [ambientMuted, setAmbientMuted] = useState(true)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)

  const isPublicRoom = roomType === RoomType.PUBLIC
  const isDj = connectedBoothIndex !== null
  const isNonDjPublic = isPublicRoom && !isDj && !isAmbient

  // DJ Queue state
  const isInDJQueue = useAppSelector((state) => state.djQueue.isInQueue)
  const isCurrentDJ = useAppSelector((state) => state.djQueue.currentDjSessionId === mySessionId)
  const djQueueEntries = useAppSelector((state) => state.djQueue.entries)

  // Player sync logic (custom hook)
  const {
    playerRef,
    isBuffering,
    setIsBuffering,
    isPlaying,
    setIsPlaying,
    resyncPlayer,
    handleReady,
    handleOnBufferEnd,
  } = usePlayerSync({
    game,
    link,
    streamId,
    startTime,
    isAmbient,
    globallyMuted,
    onSetAmbientMuted: setAmbientMuted,
  })

  // Minimize when becoming non-DJ in public room
  useEffect(() => {
    if (isNonDjPublic) {
      setMinimized(true)
    }
  }, [isNonDjPublic])

  // Reset isPlaying when stream stops (show play button, not pause)
  useEffect(() => {
    if (!link && roomPlaylist.length > 0 && !isAmbient) {
      setIsPlaying(false)
    }
  }, [link, roomPlaylist.length, isAmbient, setIsPlaying])

  // Update elapsed time and total duration for minimized player
  useEffect(() => {
    if (!link) {
      setElapsedTime(0)
      setTotalDuration(0)
      return
    }

    // Update elapsed time every second
    const intervalId = setInterval(() => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000))
      setElapsedTime(elapsed)

      // Get total duration from player
      const duration = playerRef.current?.getDuration?.()
      if (duration && typeof duration === 'number' && duration > 0) {
        setTotalDuration(Math.floor(duration))
      }
    }, 1000)

    return () => clearInterval(intervalId)
  }, [link, startTime, playerRef])

  // Derived values
  const canControlRoomPlaylist = Boolean(connectedBoothIndex !== null && roomPlaylist.length > 0)
  const isStreaming = link !== null
  const canToggleVideoBackground = true // Allow all users to toggle their local video background
  const syncTime = (Date.now() - startTime) / 1000
  const url = link ? 'https://www.youtube.com/watch?v=' + link : ''

  const displayTitle =
    title && title.trim() !== ''
      ? `Now Playing: ${title}`
      : isStreaming
        ? 'Now Playing'
        : roomPlaylist.length > 0
          ? 'Room Playlist Ready'
          : 'Room Playlist Empty'

  // Handlers
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false)
      return
    }

    setIsPlaying(true)

    if (!isStreaming) {
      game.network.playRoomPlaylist()
      return
    }

    resyncPlayer()
  }, [isPlaying, isStreaming, game.network, resyncPlayer])

  const handlePrev = useCallback(() => {
    setIsPlaying(true)
    game.network.prevRoomPlaylist()
  }, [game.network])

  const handleNext = useCallback(() => {
    setIsPlaying(true)
    game.network.skipRoomPlaylist()
  }, [game.network])

  const handleRemove = useCallback(
    (id: string) => {
      game.network.removeRoomPlaylistItem(id)
    },
    [game.network]
  )

  const handleToggleBackground = useCallback(() => {
    const newValue = !videoBackgroundEnabled
    dispatch(setVideoBackgroundEnabled(newValue))
    phaserEvents.emit(Event.VIDEO_BACKGROUND_ENABLED_CHANGED, newValue)
  }, [dispatch, videoBackgroundEnabled])

  const handleJoinDJQueue = useCallback(() => {
    game.network.joinDJQueue()
    dispatch(setIsInQueue(true))
    dispatch(setRoomQueuePlaylistVisible(true))
  }, [game.network, dispatch])

  const handleOnEnded = useCallback(() => {
    if (isAmbient) {
      setIsPlaying(true)
      playerRef.current?.seekTo(0, 'seconds')
      return
    }

    if (!isBuffering) {
      setIsBuffering(true)
    }

    // New DJ Queue system
    if (isInDJQueue && isCurrentDJ) {
      setIsPlaying(true)
      game.network.djTurnComplete()
      return
    }

    // Legacy system (fallback)
    if (isRoomPlaylist) {
      if (currentDj?.sessionId === game.myPlayer.playerId) {
        setIsPlaying(true)
        game.network.skipRoomPlaylist()
      }
      return
    }

    const nextItem = activeItems[1]
    if (currentDj?.sessionId === game.myPlayer.playerId) {
      dispatch(shiftMyPlaylist())
      if (nextItem) {
        game.network.syncMusicStream(nextItem)
      }
    }
  }, [
    isAmbient,
    isBuffering,
    setIsBuffering,
    isRoomPlaylist,
    currentDj?.sessionId,
    game.myPlayer.playerId,
    game.network,
    activeItems,
    dispatch,
    playerRef,
    setIsPlaying,
    isInDJQueue,
    isCurrentDJ,
  ])

  // Render: Ambient mode (hidden player)
  if (isAmbient && link !== null) {
    return (
      <Backdrop>
        <Wrapper
          style={{
            position: 'fixed',
            right: 0,
            bottom: 0,
            width: 2,
            height: 2,
            opacity: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          <VideoPlayer
            url={url}
            isPlaying={isPlaying}
            isMuted={ambientMuted || globallyMuted}
            isHidden={false}
            videoBackgroundEnabled={videoBackgroundEnabled}
            canToggleBackground={canToggleVideoBackground}
            playerRef={playerRef}
            onReady={handleReady}
            onEnded={handleOnEnded}
            onBufferEnd={handleOnBufferEnd}
            onToggleBackground={handleToggleBackground}
          />
        </Wrapper>
      </Backdrop>
    )
  }

  // Render: Not connected and no stream
  if (!link && connectedBoothIndex === null && !isInDJQueue) {
    return (
      <Backdrop>
        <Wrapper />
      </Backdrop>
    )
  }

  // Render: DJ Queue UI when in queue
  if (isInDJQueue) {
    // Get next DJ info for minimized view
    const nextDJ = djQueueEntries.find((e, i) => i === 1) || null

    // Format time display
    const timeDisplay = link && totalDuration > 0
      ? `${formatTime(elapsedTime)} / ${formatTime(totalDuration)}`
      : ''

    // Format "up next" message
    const upNextMessage = djQueueEntries.length > 1
      ? isCurrentDJ
        ? `Up next: ${nextDJ?.name || 'Unknown'}`
        : `Your turn in ${djQueueEntries.findIndex(e => e.sessionId === mySessionId)} track(s)`
      : isCurrentDJ
        ? 'You\'re the only DJ'
        : ''

    if (minimized) {
      return (
        <Backdrop>
          <MiniBar>
            <IconButton aria-label="expand dj bar" size="small" onClick={() => setMinimized(false)}>
              <OpenInFullIcon fontSize="inherit" />
            </IconButton>

            <Marquee>
              <div style={{ overflow: 'hidden', position: 'relative', height: '18px' }}>
                <MarqueeInner>
                  {link !== null
                    ? `${title || 'Unknown'}`
                    : isCurrentDJ
                      ? 'Add tracks to start playing!'
                      : `Waiting for ${djQueueEntries[0]?.name || 'DJ'}...`}
                </MarqueeInner>
              </div>
              {link && (
                <MarqueeMetadata>
                  {timeDisplay} {upNextMessage && `• ${upNextMessage}`}
                </MarqueeMetadata>
              )}
            </Marquee>
          </MiniBar>

          {/* Video player (hidden but playing audio) */}
          <div style={{ position: 'fixed', left: -10000, opacity: 0, pointerEvents: 'none' }}>
            <VideoPlayer
              url={url}
              isPlaying={isPlaying}
              isMuted={globallyMuted}
              isHidden={false}
              videoBackgroundEnabled={videoBackgroundEnabled}
              canToggleBackground={canToggleVideoBackground}
              playerRef={playerRef}
              onReady={handleReady}
              onEnded={handleOnEnded}
              onBufferEnd={handleOnBufferEnd}
              onToggleBackground={handleToggleBackground}
            />
          </div>
        </Backdrop>
      )
    }

    return (
      <Backdrop>
        <Wrapper>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <IconButton
              aria-label="minimize dj player"
              className="close"
              onClick={() => setMinimized(true)}
              size="small"
            >
              <MinimizeIcon />
            </IconButton>
          </div>

          {/* DJ Queue Panel */}
          <DJQueuePanel />

          {/* Video player (hidden but playing audio) */}
          <div style={{ position: 'fixed', left: -10000, opacity: 0, pointerEvents: 'none' }}>
            <VideoPlayer
              url={url}
              isPlaying={isPlaying}
              isMuted={globallyMuted}
              isHidden={false}
              videoBackgroundEnabled={videoBackgroundEnabled}
              canToggleBackground={canToggleVideoBackground}
              playerRef={playerRef}
              onReady={handleReady}
              onEnded={handleOnEnded}
              onBufferEnd={handleOnBufferEnd}
              onToggleBackground={handleToggleBackground}
            />
          </div>
        </Wrapper>
      </Backdrop>
    )
  }

  // Render: Join DJ Queue option when booth occupied by someone else
  // Note: connectedBoothIndex is YOUR connection status, so if you're connected,
  // you should have auto-joined the queue. This shows when someone else is DJing
  // and you're not in the queue yet.
  if (connectedBoothIndex === null && !isInDJQueue && link !== null) {
    // Get next DJ info
    const nextDJ = djQueueEntries.find((e, i) => i === 1) || null

    // Format time display
    const timeDisplay = totalDuration > 0
      ? `${formatTime(elapsedTime)} / ${formatTime(totalDuration)}`
      : formatTime(elapsedTime)

    if (minimized) {
      return (
        <Backdrop>
          <JoinQueueMiniBar>
            <IconButton aria-label="expand dj bar" size="small" onClick={() => setMinimized(false)}>
              <OpenInFullIcon fontSize="inherit" />
            </IconButton>
            <div className="track-info">
              <div className="track-title">{title || 'Unknown'}</div>
              <div className="track-meta">
                {timeDisplay} • Up next: {nextDJ?.name || 'No one yet'}
              </div>
            </div>
            <button className="join-btn" onClick={handleJoinDJQueue} title="Join queue">
              <AddIcon fontSize="small" />
            </button>
          </JoinQueueMiniBar>

          {/* Video player (hidden but playing audio) */}
          <div style={{ position: 'fixed', left: -10000, opacity: 0, pointerEvents: 'none' }}>
            <VideoPlayer
              url={url}
              isPlaying={isPlaying}
              isMuted={globallyMuted}
              isHidden={false}
              videoBackgroundEnabled={videoBackgroundEnabled}
              canToggleBackground={canToggleVideoBackground}
              playerRef={playerRef}
              onReady={handleReady}
              onEnded={handleOnEnded}
              onBufferEnd={handleOnBufferEnd}
              onToggleBackground={handleToggleBackground}
            />
          </div>
        </Backdrop>
      )
    }

    return (
      <Backdrop>
        <Wrapper>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <IconButton
              aria-label="minimize dj player"
              className="close"
              onClick={() => setMinimized(true)}
              size="small"
            >
              <MinimizeIcon />
            </IconButton>
          </div>

          {/* Join Queue Button */}
          <JoinQueueContainer>
            <JoinQueueSubtitle>
              Join the queue to play your tracks after the current mutant
            </JoinQueueSubtitle>
            <JoinQueueButton onClick={handleJoinDJQueue}>
              <AddIcon fontSize="small" />
              Join Queue
            </JoinQueueButton>
          </JoinQueueContainer>

          {/* Video player (hidden but playing audio) */}
          <div style={{ position: 'fixed', left: -10000, opacity: 0, pointerEvents: 'none' }}>
            <VideoPlayer
              url={url}
              isPlaying={isPlaying}
              isMuted={globallyMuted}
              isHidden={false}
              videoBackgroundEnabled={videoBackgroundEnabled}
              canToggleBackground={canToggleVideoBackground}
              playerRef={playerRef}
              onReady={handleReady}
              onEnded={handleOnEnded}
              onBufferEnd={handleOnBufferEnd}
              onToggleBackground={handleToggleBackground}
            />
          </div>
        </Wrapper>
      </Backdrop>
    )
  }

  // Render: Main player UI
  return (
    <Backdrop>
      {/* Minimized bar */}
      {minimized && (
        <MiniBar>
          <IconButton aria-label="expand dj bar" size="small" onClick={() => setMinimized(false)}>
            <OpenInFullIcon fontSize="inherit" />
          </IconButton>

          {!isNonDjPublic && (
            <PlayerControls
              isPlaying={isPlaying}
              isStreaming={isStreaming}
              canControl={canControlRoomPlaylist}
              onPlayPause={handlePlayPause}
              onPrev={handlePrev}
              onNext={handleNext}
            />
          )}

          <Marquee>
            <div style={{ overflow: 'hidden', position: 'relative', height: '18px' }}>
              <MarqueeInner>{displayTitle}</MarqueeInner>
            </div>
            {link && totalDuration > 0 && (
              <MarqueeMetadata>
                {formatTime(elapsedTime)} / {formatTime(totalDuration)}
              </MarqueeMetadata>
            )}
          </Marquee>
        </MiniBar>
      )}

      {/* Main player */}
      <Wrapper
        style={
          minimized
            ? {
                position: 'fixed',
                left: -10000,
                top: 0,
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: 'none',
                overflow: 'hidden',
              }
            : undefined
        }
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <IconButton
            aria-label="minimize dj player"
            className="close"
            onClick={() => setMinimized(true)}
            size="small"
          >
            <MinimizeIcon />
          </IconButton>
        </div>

        {/* Video player - always rendered for audio, visually hidden when minimized */}
        <div
          style={
            minimized
              ? { position: 'fixed', left: -10000, opacity: 0, pointerEvents: 'none' }
              : undefined
          }
        >
          <VideoPlayer
            url={url}
            isPlaying={isPlaying}
            isMuted={globallyMuted}
            isHidden={false}
            videoBackgroundEnabled={videoBackgroundEnabled}
            canToggleBackground={canToggleVideoBackground}
            playerRef={playerRef}
            onReady={handleReady}
            onEnded={handleOnEnded}
            onBufferEnd={handleOnBufferEnd}
            onToggleBackground={handleToggleBackground}
          />
        </div>

        {/* Info */}
        <RoomInfo>
          <div>{link !== null ? `Room Playing: ${title}` : 'Room is not playing yet'}</div>
        </RoomInfo>

        {/* Controls */}
        {!isNonDjPublic && (
          <PlayerControls
            isPlaying={isPlaying}
            isStreaming={isStreaming}
            canControl={canControlRoomPlaylist}
            onPlayPause={handlePlayPause}
            onPrev={handlePrev}
            onNext={handleNext}
          />
        )}

        {/* Playlist */}
        {!isNonDjPublic && (
          <RoomPlaylistView
            items={roomPlaylist}
            currentIndex={roomPlaylistIndex}
            isRoomPlaylist={isRoomPlaylist}
            mySessionId={mySessionId}
            isNonDjPublic={isNonDjPublic}
            onRemove={handleRemove}
          />
        )}
      </Wrapper>
    </Backdrop>
  )
}
