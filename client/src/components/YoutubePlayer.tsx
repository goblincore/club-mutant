/* eslint-disable react-hooks/exhaustive-deps */
import { useRef, useState, useEffect, useCallback } from 'react'
import ReactPlayer from 'react-player/youtube'
import styled from 'styled-components'
import IconButton from '@mui/material/IconButton'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import MinimizeIcon from '@mui/icons-material/Minimize'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'

import Game from '../scenes/Game'
import phaserGame from '../PhaserGame'
import { useAppSelector, useAppDispatch } from '../hooks'
import { sanitizeId } from '../util'
import { timeSync } from '../services/TimeSync'
import { phaserEvents, Event } from '../events/EventCenter'
import {
  openMyPlaylistPanel,
  closeMyPlaylistPanel,
  setFocused,
  shiftMyPlaylist,
} from '../stores/MyPlaylistStore'
import store from '../stores'
import { RoomType } from '../../../types/Rooms'

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  background: transparent;
  overflow: hidden;
  padding: 16px 16px 16px 16px;
  pointer-events: auto;
`

const MiniBar = styled.div`
  height: 36px;
  width: 360px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(8px);

  button {
    color: rgba(255, 255, 255, 0.9);
  }
`

const Marquee = styled.div`
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  position: relative;
  height: 18px;
`

const MarqueeInner = styled.div`
  display: inline-block;
  padding-left: 100%;
  animation: dj-marquee 12s linear infinite;
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  text-shadow: 0.3px 0.3px rgba(0, 0, 0, 0.8);

  @keyframes dj-marquee {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-100%);
    }
  }
`
const Wrapper = styled.div`
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(8px);
  border-radius: 16px;
  padding: 0;
  color: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;

  .close {
    margin: 0 0 0 auto;
    padding: 0;
  }
`

const Controls = styled.div`
  display: flex;
  gap: 8px;
  padding: 8px;

  button {
    color: rgba(255, 255, 255, 0.9);
  }
`

const RoomInfo = styled.div`
  padding: 0 8px 8px 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
`

const EmptyVideo = styled.div`
  width: 200px;
  height: 130px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
`

const RoomPlaylist = styled.div`
  padding: 0 8px 8px 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  max-height: 180px;
  overflow-y: auto;

  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.15);
  }

  .row.active {
    background: rgba(255, 255, 255, 0.12);
  }

  .title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.6);
  }

  button {
    color: rgba(255, 255, 255, 0.9);
  }
`

export default function YoutubePlayer() {
  const dispatch = useAppDispatch()
  const game = phaserGame.scene.keys.game as Game
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
  const playerNameMap = useAppSelector((state) => state.user.playerNameMap)
  const roomPlaylist = useAppSelector((state) => state.roomPlaylist.items)
  const [isBuffering, setIsBuffering] = useState(true)
  const [isPlaying, setIsPlaying] = useState(true)
  const [minimized, setMinimized] = useState(false)
  const [ambientMuted, setAmbientMuted] = useState(true)
  const myPlaylists = useAppSelector((state) => state.myPlaylist.playlists)
  const activePlaylistId = useAppSelector((state) => state.myPlaylist.activePlaylistId)
  const activePlaylist = myPlaylists.find((p) => p.id === activePlaylistId) ?? null
  const activeItems = activePlaylist?.items ?? []

  const isPublicRoom = roomType === RoomType.PUBLIC
  const isDj = connectedBoothIndex !== null
  const isNonDjPublic = isPublicRoom && !isDj && !isAmbient

  useEffect(() => {
    if (isNonDjPublic) {
      setMinimized(true)
    }
  }, [isNonDjPublic])

  useEffect(() => {
    if (!isAmbient) {
      setAmbientMuted(false)
      return
    }

    setMinimized(false)
    setIsPlaying(true)
    setAmbientMuted(true)

    const kick = () => {
      if (globallyMuted) {
        window.removeEventListener('pointerdown', kick)
        window.removeEventListener('keydown', kick)
        return
      }

      const syncTime = (timeSync.getServerNowMs() - startTime) / 1000

      setAmbientMuted(false)

      const internalPlayer = playerRef.current?.getInternalPlayer?.()
      internalPlayer?.seekTo?.(Math.max(0, syncTime), true)
      internalPlayer?.unMute?.()
      internalPlayer?.playVideo?.()

      setIsPlaying(true)
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
    }

    window.addEventListener('pointerdown', kick)
    window.addEventListener('keydown', kick)

    return () => {
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
    }
  }, [globallyMuted, isAmbient])

  const canControlRoomPlaylist = Boolean(connectedBoothIndex !== null && roomPlaylist.length > 0)
  const isStreaming = link !== null
  const canToggleVideoBackground = Boolean(connectedBoothIndex !== null)
  const displayTitle =
    title && title.trim() !== ''
      ? `Now Playing: ${title}`
      : isStreaming
        ? 'Now Playing'
        : roomPlaylist.length > 0
          ? 'Room Playlist Ready'
          : 'Room Playlist Empty'

  const syncTime = (timeSync.getServerNowMs() - startTime) / 1000
  const url = link ? 'https://www.youtube.com/watch?v=' + link : ''
  const startSeconds = Math.max(0, Math.floor(syncTime))

  const playerRef = useRef<any>()

  const computeExpectedSeconds = useCallback(() => {
    if (!link) return 0
    return Math.max(0, (timeSync.getServerNowMs() - startTime) / 1000)
  }, [link, startTime])

  const resyncPlayer = useCallback(() => {
    const expectedSeconds = computeExpectedSeconds()
    playerRef.current?.seekTo(expectedSeconds, 'seconds')
  }, [computeExpectedSeconds])

  useEffect(() => {
    if (!link) return

    let hasPendingTickResync = false

    const resyncWithFreshTime = (armTickResync: boolean) => {
      game.network.requestTimeSyncNow()

      // Safari often needs more than one attempt after backgrounding.
      window.setTimeout(() => {
        resyncPlayer()
      }, 150)

      window.setTimeout(() => {
        resyncPlayer()
      }, 900)

      hasPendingTickResync = armTickResync
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return

      resyncWithFreshTime(true)
    }

    const handleFocus = () => {
      if (document.visibilityState !== 'visible') return
      resyncWithFreshTime(true)
    }

    const handlePageShow = () => {
      if (document.visibilityState !== 'visible') return
      resyncWithFreshTime(true)
    }

    const handleTick = (payload: { streamId: number; startTime: number; serverNowMs: number }) => {
      if (!hasPendingTickResync) return
      if (document.visibilityState !== 'visible') return
      if (!payload || payload.streamId !== streamId) return
      if (payload.startTime !== startTime) return

      hasPendingTickResync = false
      resyncWithFreshTime(false)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageShow)
    phaserEvents.on(Event.MUSIC_STREAM_TICK, handleTick)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow)
      phaserEvents.off(Event.MUSIC_STREAM_TICK, handleTick)
    }
  }, [game.network, link, resyncPlayer, startTime, streamId])

  useEffect(() => {
    if (!link) return
    if (!isPlaying) return

    const intervalId = window.setInterval(() => {
      const expectedSeconds = computeExpectedSeconds()
      const actualSeconds =
        typeof playerRef.current?.getCurrentTime === 'function'
          ? (playerRef.current.getCurrentTime() as number)
          : null

      if (typeof actualSeconds !== 'number' || !Number.isFinite(actualSeconds)) {
        return
      }

      const driftSeconds = actualSeconds - expectedSeconds

      if (!Number.isFinite(driftSeconds)) return

      if (Math.abs(driftSeconds) < 0.25) return

      if (Math.abs(driftSeconds) >= 2) {
        resyncPlayer()
        return
      }

      const internalPlayer = playerRef.current?.getInternalPlayer?.()

      if (internalPlayer?.setPlaybackRate) {
        const nextRate = driftSeconds > 0 ? 0.95 : 1.05
        internalPlayer.setPlaybackRate(nextRate)

        window.setTimeout(() => {
          try {
            internalPlayer.setPlaybackRate(1)
          } catch {
            // ignore
          }
        }, 2_000)
      }
    }, 2_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [computeExpectedSeconds, isPlaying, link, resyncPlayer, streamId])

  const getDisplayName = (sessionId: string) => {
    const resolved = playerNameMap.get(sanitizeId(sessionId))
    return resolved && resolved !== '' ? resolved : sessionId
  }

  const formatDuration = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return ''
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const handleReady = (e) => {
    console.log('////YoutubePlayer, handlePlay, e', e)
    resyncPlayer()

    if (isAmbient && ambientMuted && !globallyMuted) {
      window.setTimeout(() => {
        const internalPlayer = playerRef.current?.getInternalPlayer?.()
        internalPlayer?.unMute?.()
        internalPlayer?.setVolume?.(100)
        internalPlayer?.playVideo?.()
        setAmbientMuted(false)
      }, 250)
    }
  }

  const handleOnBufferEnd = () => {
    if (isBuffering) {
      setIsBuffering(false)
    }
  }

  const handleOnEnded = () => {
    if (isAmbient) {
      setIsPlaying(true)
      playerRef.current?.seekTo(0, 'seconds')
      return
    }

    if (!isBuffering) {
      setIsBuffering(true)
    }

    if (isRoomPlaylist) {
      if (currentDj?.sessionId === game.myPlayer.playerId) {
        setIsPlaying(true)
        game.network.skipRoomPlaylist()
      }
      return
    }

    const nextItem = activeItems[1]
    console.log('nextItem', nextItem)

    console.log('currentDj.sessoinId', currentDj?.sessionId)
    console.log('///myplayer game playerid', game.myPlayer.playerId)
    if (currentDj?.sessionId === game.myPlayer.playerId) {
      dispatch(shiftMyPlaylist())
      if (nextItem) {
        game.network.syncMusicStream(nextItem)
      }
    }
  }

  return (
    <Backdrop>
      {isAmbient && link !== null ? (
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
          <ReactPlayer
            ref={playerRef}
            onReady={handleReady}
            onEnded={handleOnEnded}
            onBufferEnd={handleOnBufferEnd}
            width={'200px'}
            height={'130px'}
            playing={isPlaying}
            muted={ambientMuted || globallyMuted}
            url={url}
          />
        </Wrapper>
      ) : link !== null || connectedBoothIndex !== null ? (
        <>
          {minimized ? (
            <MiniBar>
              <IconButton
                aria-label="expand dj bar"
                size="small"
                onClick={() => {
                  setMinimized(false)
                }}
              >
                <OpenInFullIcon fontSize="inherit" />
              </IconButton>

              {!isNonDjPublic ? (
                <>
                  <IconButton
                    aria-label="previous track"
                    size="small"
                    disabled={!canControlRoomPlaylist}
                    onClick={() => {
                      setIsPlaying(true)
                      game.network.prevRoomPlaylist()
                    }}
                  >
                    <SkipPreviousIcon fontSize="inherit" />
                  </IconButton>

                  <IconButton
                    aria-label={isPlaying ? 'pause' : 'play'}
                    size="small"
                    disabled={!isStreaming && !canControlRoomPlaylist}
                    onClick={() => {
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
                    }}
                  >
                    {isPlaying ? (
                      <PauseIcon fontSize="inherit" />
                    ) : (
                      <PlayArrowIcon fontSize="inherit" />
                    )}
                  </IconButton>

                  <IconButton
                    aria-label="next track"
                    size="small"
                    disabled={!canControlRoomPlaylist}
                    onClick={() => {
                      setIsPlaying(true)
                      game.network.skipRoomPlaylist()
                    }}
                  >
                    <SkipNextIcon fontSize="inherit" />
                  </IconButton>
                </>
              ) : null}

              <Marquee>
                <MarqueeInner>{displayTitle}</MarqueeInner>
              </Marquee>
            </MiniBar>
          ) : null}

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
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {!isNonDjPublic ? (
                <IconButton
                  aria-label={
                    videoBackgroundEnabled ? 'disable video background' : 'enable video background'
                  }
                  className="close"
                  disabled={!canToggleVideoBackground}
                  onClick={() => {
                    game.network.setVideoBackgroundEnabled(!videoBackgroundEnabled)
                  }}
                  size="small"
                >
                  {videoBackgroundEnabled ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </IconButton>
              ) : null}

              <IconButton
                aria-label="minimize dj player"
                className="close"
                onClick={() => {
                  setMinimized(true)
                }}
                size="small"
              >
                <MinimizeIcon />
              </IconButton>
            </div>

            {link !== null ? (
              <div
                style={
                  isNonDjPublic
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
                <ReactPlayer
                  ref={playerRef}
                  onReady={handleReady}
                  onEnded={handleOnEnded}
                  onBufferEnd={handleOnBufferEnd}
                  width={'200px'}
                  height={'130px'}
                  playing={isPlaying}
                  muted={globallyMuted}
                  url={url}
                />
              </div>
            ) : !isNonDjPublic ? (
              <EmptyVideo>Room Stream</EmptyVideo>
            ) : null}

            <RoomInfo>
              <div>{link !== null ? `Room Playing: ${title}` : 'Room is not playing yet'}</div>
            </RoomInfo>

            {!isNonDjPublic ? (
              <Controls>
                <button
                  disabled={link === null}
                  onClick={() => {
                    setIsPlaying(false)
                  }}
                >
                  Pause
                </button>
                <button
                  disabled={link === null}
                  onClick={() => {
                    setIsPlaying(true)
                    resyncPlayer()
                  }}
                >
                  Resume
                </button>
                <button
                  disabled={link === null}
                  onClick={() => {
                    resyncPlayer()
                  }}
                >
                  Resync
                </button>
                <button
                  disabled={connectedBoothIndex === null || roomPlaylist.length === 0}
                  onClick={() => {
                    setIsPlaying(true)
                    game.network.playRoomPlaylist()
                  }}
                >
                  Play
                </button>
                <button
                  disabled={connectedBoothIndex === null || roomPlaylist.length === 0}
                  onClick={() => {
                    setIsPlaying(true)
                    game.network.skipRoomPlaylist()
                  }}
                >
                  Skip
                </button>
              </Controls>
            ) : null}

            <RoomPlaylist>
              {roomPlaylist.length === 0 ? (
                <div className="row">
                  <div className="title">No room tracks yet</div>
                  <div className="meta">Add some from your playlist</div>
                </div>
              ) : (
                roomPlaylist.map((item, index) => {
                  const displayName = getDisplayName(item.addedBySessionId)
                  const canRemove = item.addedBySessionId === mySessionId
                  const durationText = formatDuration(item.duration)
                  const isActive = isRoomPlaylist && index === roomPlaylistIndex

                  return (
                    <div key={item.id} className={isActive ? 'row active' : 'row'}>
                      <div className="title">{item.title}</div>
                      <div className="meta">
                        @{displayName}
                        {durationText ? ` · ${durationText}` : ''}
                      </div>
                      {canRemove && !isNonDjPublic ? (
                        <button
                          onClick={() => {
                            game.network.removeRoomPlaylistItem(item.id)
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  )
                })
              )}
            </RoomPlaylist>
          </Wrapper>
        </>
      ) : (
        <Wrapper></Wrapper>
      )}
    </Backdrop>
  )
}
