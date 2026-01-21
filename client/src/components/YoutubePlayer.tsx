/* eslint-disable react-hooks/exhaustive-deps */
import { useRef, useState, useEffect } from 'react'
import ReactPlayer from 'react-player/youtube'
import styled from 'styled-components'

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
  const connectedBoothIndex = useAppSelector((state) => state.musicBooth.musicBoothIndex)
  const mySessionId = useAppSelector((state) => state.user.sessionId)
  const playerNameMap = useAppSelector((state) => state.user.playerNameMap)
  const roomPlaylist = useAppSelector((state) => state.roomPlaylist.items)
  const [isBuffering, setIsBuffering] = useState(true)
  const [isPlaying, setIsPlaying] = useState(true)
  const currentPlaylist = useAppSelector((state) => state.myPlaylist)

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
    const nextItem = currentPlaylist.items[1]
    console.log('nextItem', nextItem)
    if (!isBuffering) {
      setIsBuffering(true)
    }

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
        <Wrapper>
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
              disabled={roomPlaylist.length === 0}
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
              roomPlaylist.map((item) => {
                const displayName = getDisplayName(item.addedBySessionId)
                const canRemove = item.addedBySessionId === mySessionId
                const durationText = formatDuration(item.duration)

                return (
                  <div key={item.id} className="row">
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
      ) : (
        <Wrapper></Wrapper>
      )}
    </Backdrop>
  )
}
