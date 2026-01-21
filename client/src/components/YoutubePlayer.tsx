/* eslint-disable react-hooks/exhaustive-deps */
import { useRef, useState, useEffect } from 'react'
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
import {
  openMyPlaylistPanel,
  closeMyPlaylistPanel,
  setFocused,
  shiftMyPlaylist,
} from '../stores/MyPlaylistStore'
import store from '../stores'

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  background: transparent;
  overflow: hidden;
  padding: 16px 16px 16px 16px;
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
  background: #eee;
  border-radius: 16px;
  padding: 0;
  color: #666;
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
    color: #222;
  }
`

const RoomInfo = styled.div`
  padding: 0 8px 8px 8px;
  font-size: 12px;
  color: #666;
`

const EmptyVideo = styled.div`
  width: 200px;
  height: 130px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ddd;
  color: #666;
  font-size: 12px;
`

const RoomPlaylist = styled.div`
  padding: 0 8px 8px 8px;
  font-size: 12px;
  color: #444;
  max-height: 180px;
  overflow-y: auto;

  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 0;
    border-top: 1px solid #ddd;
  }

  .row.active {
    background: #ddd;
  }

  .title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    white-space: nowrap;
    color: #777;
  }

  button {
    color: #222;
  }
`

export default function YoutubePlayer() {
  const dispatch = useAppDispatch()
  const game = phaserGame.scene.keys.game as Game
  const link = useAppSelector((state) => state.musicStream.link)
  const startTime = useAppSelector((state) => state.musicStream.startTime)
  const title = useAppSelector((state) => state.musicStream.title)
  const currentDj = useAppSelector((state) => state.musicStream.currentDj)
  const isRoomPlaylist = useAppSelector((state) => state.musicStream.isRoomPlaylist)
  const roomPlaylistIndex = useAppSelector((state) => state.musicStream.roomPlaylistIndex)
  const videoBackgroundEnabled = useAppSelector((state) => state.musicStream.videoBackgroundEnabled)
  const connectedBoothIndex = useAppSelector((state) => state.musicBooth.musicBoothIndex)
  const mySessionId = useAppSelector((state) => state.user.sessionId)
  const playerNameMap = useAppSelector((state) => state.user.playerNameMap)
  const roomPlaylist = useAppSelector((state) => state.roomPlaylist.items)
  const [isBuffering, setIsBuffering] = useState(true)
  const [isPlaying, setIsPlaying] = useState(true)
  const [minimized, setMinimized] = useState(false)
  const currentPlaylist = useAppSelector((state) => state.myPlaylist)

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

  const currentTime: number = Date.now()
  const syncTime = (currentTime - startTime) / 1000
  const url = link ? 'http://www.youtube.com/watch?v=' + link + '#t=' + syncTime + 's' : ''

  const playerRef = useRef<any>()

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
    if (!isBuffering) {
      const currentTime: number = Date.now()
      const syncTime = (currentTime - startTime) / 1000
      playerRef.current.seekTo(syncTime, 'seconds')
    }
  }

  const handleOnBufferEnd = () => {
    if (isBuffering) {
      setIsBuffering(false)
    }
  }

  const handleOnEnded = () => {
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

    const nextItem = currentPlaylist.items[1]
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
      {link !== null || connectedBoothIndex !== null ? (
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

                  const currentTime: number = Date.now()
                  const nextSyncTime = (currentTime - startTime) / 1000
                  playerRef.current?.seekTo(nextSyncTime, 'seconds')
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
              <ReactPlayer
                ref={playerRef}
                onReady={handleReady}
                onEnded={handleOnEnded}
                onBufferEnd={handleOnBufferEnd}
                width={'200px'}
                height={'130px'}
                playing={isPlaying}
                url={url}
              />
            ) : (
              <EmptyVideo>Room Stream</EmptyVideo>
            )}

            <RoomInfo>
              <div>{link !== null ? `Room Playing: ${title}` : 'Room is not playing yet'}</div>
            </RoomInfo>

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
                  const currentTime: number = Date.now()
                  const nextSyncTime = (currentTime - startTime) / 1000
                  playerRef.current?.seekTo(nextSyncTime, 'seconds')
                }}
              >
                Resume
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
                      {canRemove ? (
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
