import React, { useRef, useEffect, useState } from 'react'
import styled from 'styled-components'
import InputBase from '@mui/material/InputBase'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import EditIcon from '@mui/icons-material/Edit'
import DragHandleIcon from '@mui/icons-material/DragHandle'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import Fab from '@mui/material/Fab'
import Game from '../scenes/Game'
import phaserGame from '../PhaserGame'
import { useAppSelector, useAppDispatch } from '../hooks'
import {
  openMyPlaylistPanel,
  closeMyPlaylistPanel,
  setFocused,
  createPlaylist,
  setActivePlaylistId,
  addItemToMyPlaylist,
  removeItemFromMyPlaylist,
  reorderPlaylistItems,
  updateTrackMeta,
} from '../stores/MyPlaylistStore'
import {
  setRoomQueuePlaylistVisible,
  removeRoomQueuePlaylistItem,
  reorderRoomQueuePlaylistItems,
} from '../stores/RoomQueuePlaylistStore'
import { leaveDJQueue, skipDJTurn } from '../stores/DJQueueStore'
import { disconnectFromMusicBooth } from '../stores/MusicBoothStore'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import type { PlaylistItem } from '@club-mutant/types/IOfficeState'

const PANEL_MIN_WIDTH_PX = 400
const PANEL_MAX_WIDTH_PX = 700
const PANEL_WIDTH_STORAGE_KEY = 'club-mutant:my-playlist:panel-width:v1'

const DJ_BAR_HEIGHT_PX = 70

const Backdrop = styled.div<{ $widthPx: number; $open: boolean; $openTop: string }>`
  position: fixed;
  top: ${(p) => p.$openTop};
  left: 0;
  width: ${(p) => (p.$open ? `${p.$widthPx}px` : '96px')};
  height: ${(p) => (p.$open ? `calc(100vh - ${p.$openTop})` : '96px')};
  background: transparent;
  overflow: hidden;
  padding: 16px 16px 16px 16px;
  pointer-events: auto;
`

const ResizeHandle = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  width: 10px;
  cursor: ew-resize;
  background: transparent;
  z-index: 3;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
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

  button {
    color: rgba(255, 255, 255, 0.9);
  }

  .close {
    margin: 0 0 0 auto;
    padding: 0;
  }
`

const MyPlaylistWrapper = styled.div`
  flex: 1;
  border-radius: 0px;
  border-top: 1px solid rgba(255, 255, 255, 0.25);
  overflow-y: auto;
  padding: 5px 5px;
  width: 100%;
  height: 100%;
`

const FabWrapper = styled.div`
  button {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.9);
    text-transform: lowercase !important;
    line-height: 100%;
    background: rgba(0, 0, 0, 0.35) !important;
    border: 1px solid rgba(255, 255, 255, 0.25) !important;
    backdrop-filter: blur(8px);
  }
`
export default function PlaylistDialog() {
  const game = phaserGame.scene.keys.game as Game
  const showPlaylistDialog = useAppSelector((state) => state.myPlaylist.myPlaylistPanelOpen)
  const dispatch = useAppDispatch()
  const playlists = useAppSelector((state) => state.myPlaylist.playlists)
  const activePlaylistId = useAppSelector((state) => state.myPlaylist.activePlaylistId)
  const trackMetaById = useAppSelector((state) => state.myPlaylist.trackMetaById)
  const playQueue = useAppSelector((state) => state.myPlaylist.playQueue)
  const currentMusicStream = useAppSelector((state) => state.musicStream)
  const hasMiniPlayer = useAppSelector(
    (state) =>
      state.djQueue.isInQueue || (state.musicStream.link !== null && !state.musicStream.isAmbient)
  )
  const panelTop = hasMiniPlayer ? `${DJ_BAR_HEIGHT_PX}px` : '0px'

  const previousKeyboardEnabledRef = useRef<boolean | null>(null)
  const previousMouseEnabledRef = useRef<boolean | null>(null)
  const previousTouchEnabledRef = useRef<boolean | null>(null)

  const [panelWidthPx, setPanelWidthPx] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(PANEL_WIDTH_STORAGE_KEY)
      const parsed = raw ? Number(raw) : NaN

      if (!Number.isFinite(parsed)) return PANEL_MIN_WIDTH_PX

      return Math.min(PANEL_MAX_WIDTH_PX, Math.max(PANEL_MIN_WIDTH_PX, parsed))
    } catch {
      return PANEL_MIN_WIDTH_PX
    }
  })
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartXRef = useRef<number>(0)
  const resizeStartWidthRef = useRef<number>(PANEL_MIN_WIDTH_PX)

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null
  const activeItems = activePlaylist?.items ?? []

  useEffect(() => {
    const input = game?.input
    if (!input) return

    const keyboard = input.keyboard

    const mouse = (input as unknown as { mouse?: { enabled: boolean } }).mouse
    const touch = (input as unknown as { touch?: { enabled: boolean } }).touch

    const restore = () => {
      if (keyboard && previousKeyboardEnabledRef.current !== null) {
        keyboard.enabled = previousKeyboardEnabledRef.current
        previousKeyboardEnabledRef.current = null
      }

      if (mouse && previousMouseEnabledRef.current !== null) {
        mouse.enabled = previousMouseEnabledRef.current
        previousMouseEnabledRef.current = null
      }

      if (touch && previousTouchEnabledRef.current !== null) {
        touch.enabled = previousTouchEnabledRef.current
        previousTouchEnabledRef.current = null
      }
    }

    if (showPlaylistDialog) {
      if (keyboard) {
        if (previousKeyboardEnabledRef.current === null) {
          previousKeyboardEnabledRef.current = keyboard.enabled
        }
        keyboard.enabled = false
      }

      if (mouse) {
        if (previousMouseEnabledRef.current === null) {
          previousMouseEnabledRef.current = mouse.enabled
        }
        mouse.enabled = false
      }

      if (touch) {
        if (previousTouchEnabledRef.current === null) {
          previousTouchEnabledRef.current = touch.enabled
        }
        touch.enabled = false
      }
    } else {
      restore()
    }

    return () => {
      restore()
    }
  }, [game, showPlaylistDialog])

  useEffect(() => {
    if (!isResizing) return

    const handleMove = (event: MouseEvent) => {
      const delta = event.clientX - resizeStartXRef.current
      const next = resizeStartWidthRef.current + delta
      setPanelWidthPx(Math.min(PANEL_MAX_WIDTH_PX, Math.max(PANEL_MIN_WIDTH_PX, next)))
    }

    const handleUp = () => {
      setIsResizing(false)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isResizing])

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidthPx))
    } catch {
      // ignore localStorage errors
    }
  }, [panelWidthPx])

  const handlePlay = () => {
    console.log('handlePlay')
    game.network.syncMusicStream()
  }

  return (
    <Backdrop $widthPx={panelWidthPx} $open={showPlaylistDialog} $openTop={panelTop}>
      {showPlaylistDialog ? (
        <>
          <ResizeHandle
            onMouseDown={(event) => {
              event.preventDefault()
              resizeStartXRef.current = event.clientX
              resizeStartWidthRef.current = panelWidthPx
              setIsResizing(true)
            }}
          />
          <Wrapper>
            <div style={{ display: 'flex', alignItems: 'center', padding: '2px 5px' }}>
              <h3
                style={{
                  margin: '5px 0',
                  flexGrow: 1,
                  textAlign: 'center',
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontSize: '16px',
                }}
              >
                My Playlists
              </h3>
              <IconButton
                aria-label="close dialog"
                className="close"
                onClick={() => dispatch(closeMyPlaylistPanel())}
              >
                <CloseIcon />
              </IconButton>
            </div>
            <MyPlaylistWrapper>
              <MusicSearch />
            </MyPlaylistWrapper>
          </Wrapper>
        </>
      ) : (
        <div style={{ textAlign: 'left' }}>
          <FabWrapper>
            <Fab
              color="secondary"
              aria-label="showPlaylistDialog"
              onClick={() => {
                dispatch(openMyPlaylistPanel())
                dispatch(setFocused(true))
              }}
            >
              <img
                src="/assets/items/spin_cd_broken.gif"
                alt="My Playlist"
                style={{ width: 44, height: 44, display: 'block' }}
              />
            </Fab>
          </FabWrapper>
        </div>
      )}
    </Backdrop>
  )
}

const InputWrapper = styled.form`
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.25);
  border-radius: 10px;
  display: flex;
  flex-direction: row;
`

const InputTextField = styled(InputBase)`
  border-radius: 10px;

  input {
    padding: 5px;
    color: rgba(255, 255, 255, 0.9);
  }

  input::placeholder {
    color: rgba(255, 255, 255, 0.6);
    opacity: 1;
  }
`

const TabBar = styled.div`
  display: flex;
  gap: 8px;
  padding: 8px 0;
`

const TabButton = styled.button<{ $active: boolean }>`
  appearance: none;
  border: 1px solid
    ${(p) => (p.$active ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.25)')};
  background: ${(p) => (p.$active ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.25)')};
  color: rgba(255, 255, 255, 0.9);
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 12px;
  letter-spacing: 0.02em;
  cursor: pointer;

  box-shadow: ${(p) => (p.$active ? '0 0 0 1px rgba(255, 255, 255, 0.08) inset' : 'none')};

  &:hover {
    background: rgba(0, 0, 0, 0.5);
  }
`

const Tab = styled.ul`
  padding: 0px;
  margin: 0px;

  button {
    color: rgba(255, 255, 255, 0.9);
  }
`

const EmptyState = styled.div`
  padding: 12px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
`

const PrimaryButton = styled.button`
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.9);
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
`

const DetailHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0 10px 0;
`

const TrackEditorWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 10px;
`

const Label = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
`

const MultiLineField = styled(InputBase)`
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.25);

  textarea {
    padding: 8px;
    color: rgba(255, 255, 255, 0.9);
  }
`

const PlaylistTitle = styled.div`
  flex: 1;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 8px;
`

const HeaderSpacer = styled.div`
  width: 68px;
`

const DJQueueWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`

const DJQueueHeader = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 6px;
`

const DJQueueSubtitle = styled.div`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 6px;
`

const DJQueuePosition = styled.div`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 6px;
`

const DJQueueEmptyState = styled.div`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  padding: 8px 0;
`

const DJQueueScrollArea = styled.div`
  flex: 1;
  overflow-y: auto;
`

const DJQueueTrackItem = styled.div<{ $isPlaying?: boolean; $isPlayed?: boolean }>`
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

const DJQueueTrackInfo = styled.div`
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

const DJQueueDragHandle = styled.div`
  cursor: grab;
  color: rgba(255, 255, 255, 0.5);

  &:active {
    cursor: grabbing;
  }
`

const DJQueueButtons = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
  justify-content: flex-end;
`

const DJQueueLeaveButton = styled(PrimaryButton)`
  color: rgba(255, 100, 100, 0.9);
  border-color: rgba(255, 100, 100, 0.5);
`

function DJQueueSection() {
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
    dispatch(closeMyPlaylistPanel())
    dispatch(setFocused(false))

    if (connectedBoothIndex !== null) {
      const exitedBooth = game.myPlayer.exitBoothIfConnected(game.network)

      if (exitedBooth) {
        console.log('[DJQueueSection] Successfully exited booth')
      } else {
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
    if (index === 0 && isCurrentDJ && isActivelyStreaming) return
    const item = roomQueueItems[index]
    if ((item as any).played) return
    setDraggedItem(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedItem === null || draggedItem === index) return
    if (index === 0 && isCurrentDJ && isActivelyStreaming) return
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
    <DJQueueWrapper>
      <DJQueueHeader>DJ Queue</DJQueueHeader>

      {!isCurrentDJ && myQueuePosition !== null && (
        <DJQueuePosition>Position in queue: #{myQueuePosition + 1}</DJQueuePosition>
      )}

      <DJQueueSubtitle>My Queue Playlist ({roomQueueItems.length} tracks)</DJQueueSubtitle>

      {roomQueueItems.length === 0 ? (
        <DJQueueEmptyState>Add tracks below or from your playlists</DJQueueEmptyState>
      ) : (
        <DJQueueScrollArea>
          {roomQueueItems.map((item, index) => {
            const isCurrentlyPlaying = index === 0 && isCurrentDJ && isActivelyStreaming
            const isPlayed = (item as any).played === true
            const isDraggable = !isCurrentlyPlaying && !isPlayed

            return (
              <DJQueueTrackItem
                key={item.id}
                draggable={isDraggable}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                $isPlaying={isCurrentlyPlaying}
                $isPlayed={isPlayed}
              >
                <DJQueueDragHandle style={{ cursor: isDraggable ? 'grab' : 'default' }}>
                  <DragHandleIcon fontSize="small" style={{ opacity: isDraggable ? 1 : 0.2 }} />
                </DJQueueDragHandle>

                <DJQueueTrackInfo>
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
                </DJQueueTrackInfo>

                <IconButton
                  size="small"
                  onClick={() => handleRemoveTrack(item.id)}
                  disabled={isCurrentlyPlaying}
                  style={{ color: 'rgba(255, 255, 255, 0.7)' }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </DJQueueTrackItem>
            )
          })}
        </DJQueueScrollArea>
      )}

      <DJQueueButtons>
        {isCurrentDJ && djQueueEntries.length > 1 && (
          <PrimaryButton type="button" onClick={handleSkipTurn}>
            <SkipNextIcon fontSize="small" />
            Skip My Turn
          </PrimaryButton>
        )}

        <DJQueueLeaveButton type="button" onClick={handleLeaveQueue}>
          Leave Queue
        </DJQueueLeaveButton>
      </DJQueueButtons>
    </DJQueueWrapper>
  )
}

type YoutubeSearchResult = {
  id: string
  length?: { simpleText?: string } | null
  thumbnail?: unknown
  title: string
}

const MusicSearch = () => {
  const [data, setData] = useState<YoutubeSearchResult[]>([])
  const [screen, setScreen] = useState<'home' | 'detail'>('home')
  const [tab, setTab] = useState<'playlist' | 'search' | 'link'>('playlist')
  const [djQueueTab, setDjQueueTab] = useState<'queue' | 'playlists'>('queue')
  const [creating, setCreating] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [linkValue, setLinkValue] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)
  const [editVisualUrl, setEditVisualUrl] = useState('')
  const [editTrackMessage, setEditTrackMessage] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const searchRequestIdRef = useRef(0)
  const dispatch = useAppDispatch()
  const panelOpen = useAppSelector((state) => state.myPlaylist.myPlaylistPanelOpen)
  const focused = useAppSelector((state) => state.myPlaylist.focused)
  const playlists = useAppSelector((state) => state.myPlaylist.playlists)
  const activePlaylistId = useAppSelector((state) => state.myPlaylist.activePlaylistId)
  const trackMetaById = useAppSelector((state) => state.myPlaylist.trackMetaById)
  const isInDJQueue = useAppSelector((state) => state.djQueue.isInQueue)
  const game = phaserGame.scene.keys.game as Game

  const handleAddAllToQueue = (playlist: (typeof playlists)[number]) => {
    for (const item of playlist.items) {
      if (!item.link) continue
      game.network.addToRoomQueuePlaylist({
        title: item.title,
        link: item.link,
        duration: item.duration,
      })
    }
  }

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null

  useEffect(() => {
    if (!panelOpen) return

    setScreen('home')
    setTab('playlist')
    setDjQueueTab('queue')
    setCreating(false)
    setNewPlaylistName('')
    setInputValue('')
    setLinkValue('')
    setLinkError(null)
    setEditingTrackId(null)
    setEditVisualUrl('')
    setEditTrackMessage('')
  }, [panelOpen])

  useEffect(() => {
    if (!editingTrackId) return

    const meta = trackMetaById[editingTrackId]
    setEditVisualUrl(meta?.visualUrl ?? '')
    setEditTrackMessage(meta?.trackMessage ?? '')
  }, [editingTrackId, trackMetaById])

  // Debounced search with request cancellation and race condition prevention
  useEffect(() => {
    if (tab !== 'search') {
      setData([])
      setIsSearching(false)
      return
    }

    const query = inputValue.trim()
    if (query === '') {
      setData([])
      setIsSearching(false)
      return
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Show loading state immediately
    setIsSearching(true)

    // Debounce: wait 400ms after user stops typing
    const debounceTimer = setTimeout(async () => {
      // Create new abort controller for this request
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      // Track request ID to ignore stale responses
      const requestId = ++searchRequestIdRef.current

      try {
        const apiBase = import.meta.env.VITE_HTTP_ENDPOINT ?? 'http://localhost:2567'
        const response = await axios.get(`${apiBase}/youtube/${encodeURIComponent(query)}`, {
          signal: abortController.signal,
        })

        // Only update results if this is still the latest request
        if (requestId === searchRequestIdRef.current) {
          setData((response?.data?.items as YoutubeSearchResult[]) ?? [])
          setIsSearching(false)
        }
      } catch (error) {
        // Ignore aborted requests
        if (!axios.isCancel(error)) {
          console.error('Search error:', error)
          if (requestId === searchRequestIdRef.current) {
            setIsSearching(false)
          }
        }
      }
    }, 400) // 400ms debounce

    return () => {
      clearTimeout(debounceTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, tab])

  useEffect(() => {
    if (focused) {
      inputRef.current?.focus()
    }
  }, [focused])

  console.log('////MusicSearchPanel, data', data)

  const handleChange = (event: React.FormEvent<HTMLInputElement>) => {
    setInputValue(event.currentTarget.value)
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    inputRef.current?.blur()
    setInputValue('')
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    console.log('////handleKeyDown')
    if (event.key === 'Escape') {
      inputRef.current?.blur()
      dispatch(closeMyPlaylistPanel())
    }
  }

  const extractYoutubeId = (rawUrl: string): string | null => {
    const trimmed = rawUrl.trim()
    if (trimmed === '') return null

    try {
      const url = new URL(trimmed)

      if (url.hostname === 'youtu.be') {
        const id = url.pathname.replace('/', '')
        return id || null
      }

      if (url.hostname.endsWith('youtube.com')) {
        const v = url.searchParams.get('v')
        if (v) return v

        const pathParts = url.pathname.split('/').filter(Boolean)
        const last = pathParts[pathParts.length - 1] ?? ''
        if (pathParts[0] === 'shorts' && last) return last
        if (pathParts[0] === 'embed' && last) return last
      }

      return null
    } catch {
      return null
    }
  }

  const handleAddToActivePlaylist = (title: string, id: string, lengthText: string) => {
    if (!lengthText) return
    if (!activePlaylistId) return

    const durationParts = lengthText.split(':')
    let duration = 0

    if (durationParts.length === 3) {
      duration =
        Number(durationParts[0]) * 60 * 60 +
        Number(durationParts[1]) * 60 +
        Number(durationParts[2])
    }

    if (durationParts.length === 2) {
      duration = Number(durationParts[0]) * 60 + Number(durationParts[1])
    }
    console.log('////MusicSearch, handleClick, duration', duration)

    const item: PlaylistItem = {
      title,
      link: id,
      djId: game.myPlayer.playerId,
      id: uuidv4(),
      duration,
    }
    dispatch(addItemToMyPlaylist({ playlistId: activePlaylistId, item }))
  }

  const handleAddLinkToActivePlaylist = () => {
    if (!activePlaylistId) return

    const videoId = extractYoutubeId(linkValue)
    if (!videoId) {
      setLinkError('Please paste a valid YouTube link.')
      return
    }

    setLinkError(null)

    const item: PlaylistItem = {
      title: `YouTube: ${videoId}`,
      link: videoId,
      djId: game.myPlayer.playerId,
      id: uuidv4(),
      duration: 0,
    }

    dispatch(addItemToMyPlaylist({ playlistId: activePlaylistId, item }))
    setLinkValue('')
  }

  const handleAddSearchResultToRoom = (title: string, id: string, lengthText: string) => {
    if (!lengthText) return

    const durationParts = lengthText.split(':')
    let duration = 0

    if (durationParts.length === 3) {
      duration =
        Number(durationParts[0]) * 60 * 60 +
        Number(durationParts[1]) * 60 +
        Number(durationParts[2])
    }

    if (durationParts.length === 2) {
      duration = Number(durationParts[0]) * 60 + Number(durationParts[1])
    }

    game.network.addRoomPlaylistItem({
      title,
      link: id,
      duration,
    })
  }

  // const resultsFromCurrentPlaylist = currentPlaylist?.items?. map( (playlistItem: IPlaylistItem) => {

  //   // const { title, thumbnail, length, id } = playlistItem;
  //   return (
  //     <YoutubeResult
  //     onClick={handleClick}
  //     key={id}
  //     title={title}
  //     thumbnail={thumbnail}
  //     length={length}
  //     id={id}
  //   />

  //   )
  // })

  const resultsList =
    data.length > 0
      ? data.map((result) => {
          const { title, thumbnail, length, id } = result
          return (
            <YoutubeResult
              onAdd={handleAddToActivePlaylist}
              key={id}
              title={title}
              thumbnail={thumbnail}
              length={length}
              id={id}
            />
          )
        })
      : null

  const playlistListContent = (
    <>
      {playlists.length === 0 ? (
        <EmptyState>
          <div style={{ marginBottom: 10 }}>No playlists yet.</div>
          {!creating ? (
            <PrimaryButton
              type="button"
              onClick={() => {
                setCreating(true)
              }}
            >
              Create a new playlist
            </PrimaryButton>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <InputWrapper
                onSubmit={(event) => {
                  event.preventDefault()
                  const name = newPlaylistName.trim()
                  if (name === '') return

                  const id = uuidv4()
                  dispatch(createPlaylist({ id, name }))
                  dispatch(setActivePlaylistId(id))
                  setCreating(false)
                  setNewPlaylistName('')
                  setScreen('detail')
                }}
              >
                <InputTextField
                  autoFocus
                  fullWidth
                  placeholder="Playlist name"
                  value={newPlaylistName}
                  onChange={(e: React.FormEvent<HTMLInputElement>) => {
                    setNewPlaylistName(e.currentTarget.value)
                  }}
                />
              </InputWrapper>
              <div style={{ display: 'flex', gap: 8 }}>
                <PrimaryButton
                  type="button"
                  onClick={() => {
                    setCreating(false)
                    setNewPlaylistName('')
                  }}
                >
                  Cancel
                </PrimaryButton>
                <PrimaryButton
                  type="button"
                  onClick={() => {
                    const name = newPlaylistName.trim()
                    if (name === '') return

                    const id = uuidv4()
                    dispatch(createPlaylist({ id, name }))
                    dispatch(setActivePlaylistId(id))
                    setCreating(false)
                    setNewPlaylistName('')
                    setScreen('detail')
                  }}
                >
                  Create
                </PrimaryButton>
              </div>
            </div>
          )}
        </EmptyState>
      ) : (
        <>
          {!creating ? (
            <div style={{ padding: '0 0 10px 0' }}>
              <PrimaryButton
                type="button"
                onClick={() => {
                  setCreating(true)
                }}
              >
                <AddIcon fontSize="small" />
                New playlist
              </PrimaryButton>
            </div>
          ) : (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 0 10px 0' }}
            >
              <InputWrapper
                onSubmit={(event) => {
                  event.preventDefault()
                  const name = newPlaylistName.trim()
                  if (name === '') return

                  const id = uuidv4()
                  dispatch(createPlaylist({ id, name }))
                  dispatch(setActivePlaylistId(id))
                  setCreating(false)
                  setNewPlaylistName('')
                  setScreen('detail')
                }}
              >
                <InputTextField
                  autoFocus
                  fullWidth
                  placeholder="Playlist name"
                  value={newPlaylistName}
                  onChange={(e: React.FormEvent<HTMLInputElement>) => {
                    setNewPlaylistName(e.currentTarget.value)
                  }}
                />
              </InputWrapper>
              <div style={{ display: 'flex', gap: 8 }}>
                <PrimaryButton
                  type="button"
                  onClick={() => {
                    setCreating(false)
                    setNewPlaylistName('')
                  }}
                >
                  Cancel
                </PrimaryButton>
                <PrimaryButton
                  type="button"
                  onClick={() => {
                    const name = newPlaylistName.trim()
                    if (name === '') return

                    const id = uuidv4()
                    dispatch(createPlaylist({ id, name }))
                    dispatch(setActivePlaylistId(id))
                    setCreating(false)
                    setNewPlaylistName('')
                    setScreen('detail')
                  }}
                >
                  Create
                </PrimaryButton>
              </div>
            </div>
          )}
          <Tab>
            {playlists.map((p) => (
              <ListItem
                key={p.id}
                onClick={() => {
                  dispatch(setActivePlaylistId(p.id))
                  setScreen('detail')
                  setTab('playlist')
                }}
              >
                <section>
                  <h4>{p.name}</h4>
                </section>
                <section style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{p.items.length}</span>
                  {isInDJQueue && p.items.length > 0 && (
                    <IconButton
                      size="small"
                      title="Add all tracks to queue"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAddAllToQueue(p)
                      }}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  )}
                </section>
              </ListItem>
            ))}
          </Tab>
        </>
      )}
    </>
  )

  if (screen === 'home') {
    if (isInDJQueue) {
      return (
        <section style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <TabBar>
            <TabButton $active={djQueueTab === 'queue'} onClick={() => setDjQueueTab('queue')}>
              DJ Queue
            </TabButton>
            <TabButton
              $active={djQueueTab === 'playlists'}
              onClick={() => setDjQueueTab('playlists')}
            >
              My Playlists
            </TabButton>
          </TabBar>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {djQueueTab === 'queue' ? <DJQueueSection /> : playlistListContent}
          </div>
        </section>
      )
    }

    return <section>{playlistListContent}</section>
  }

  if (!activePlaylist) {
    return (
      <EmptyState>
        <PrimaryButton
          type="button"
          onClick={() => {
            setScreen('home')
          }}
        >
          Back to playlists
        </PrimaryButton>
      </EmptyState>
    )
  }

  const editingTrack =
    editingTrackId !== null
      ? (activePlaylist.items.find((item) => item.id === editingTrackId) ?? null)
      : null

  return (
    <section>
      <DetailHeader>
        <PrimaryButton
          type="button"
          onClick={() => {
            setScreen('home')
          }}
        >
          <ArrowBackIcon fontSize="small" />
          Back
        </PrimaryButton>
        <PlaylistTitle>{activePlaylist.name}</PlaylistTitle>
        <HeaderSpacer />
      </DetailHeader>

      <TabBar>
        <TabButton
          type="button"
          $active={tab === 'playlist'}
          onClick={() => {
            setTab('playlist')
            inputRef.current?.blur()
            dispatch(setFocused(false))
          }}
        >
          Tracks
        </TabButton>
        <TabButton
          type="button"
          $active={tab === 'search'}
          onClick={() => {
            setTab('search')
            dispatch(setFocused(true))
          }}
        >
          Search
        </TabButton>
        <TabButton
          type="button"
          $active={tab === 'link'}
          onClick={() => {
            setTab('link')
            inputRef.current?.blur()
            dispatch(setFocused(false))
          }}
        >
          Link
        </TabButton>
      </TabBar>

      {editingTrackId !== null && editingTrack ? (
        <TrackEditorWrapper>
          <PrimaryButton
            type="button"
            onClick={() => {
              setEditingTrackId(null)
            }}
          >
            <ArrowBackIcon fontSize="small" />
            Back to tracks
          </PrimaryButton>

          <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.9)' }}>
            {editingTrack.title}
          </div>

          <div>
            <Label>Visual URL</Label>
            <InputWrapper
              onSubmit={(event) => {
                event.preventDefault()
              }}
            >
              <InputTextField
                autoFocus
                fullWidth
                placeholder="YouTube link or image URL"
                value={editVisualUrl}
                onChange={(e: React.FormEvent<HTMLInputElement>) => {
                  setEditVisualUrl(e.currentTarget.value)
                }}
              />
            </InputWrapper>
          </div>

          <div>
            <Label>Track message</Label>
            <MultiLineField
              fullWidth
              multiline
              minRows={3}
              placeholder="Message to display on screen during this track"
              value={editTrackMessage}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                setEditTrackMessage(e.target.value)
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <PrimaryButton
              type="button"
              onClick={() => {
                if (!editingTrackId) return

                dispatch(
                  updateTrackMeta({
                    trackId: editingTrackId,
                    patch: {
                      visualUrl: editVisualUrl.trim() === '' ? undefined : editVisualUrl.trim(),
                      trackMessage:
                        editTrackMessage.trim() === '' ? undefined : editTrackMessage.trim(),
                    },
                  })
                )

                setEditingTrackId(null)
              }}
            >
              Save
            </PrimaryButton>
          </div>
        </TrackEditorWrapper>
      ) : tab === 'search' ? (
        <>
          <InputWrapper onSubmit={handleSubmit}>
            <InputTextField
              inputRef={inputRef}
              autoFocus={focused}
              fullWidth
              placeholder="Search"
              value={inputValue}
              onKeyDown={handleKeyDown}
              onChange={handleChange}
              onFocus={() => {
                if (!focused) dispatch(setFocused(true))
              }}
              onBlur={() => dispatch(setFocused(false))}
            />
          </InputWrapper>
          {isSearching ? (
            <EmptyState>Searching...</EmptyState>
          ) : inputValue.trim() !== '' && data.length === 0 ? (
            <EmptyState>No results found</EmptyState>
          ) : (
            <Tab>{resultsList}</Tab>
          )}
        </>
      ) : tab === 'link' ? (
        <>
          <InputWrapper
            onSubmit={(event) => {
              event.preventDefault()
              handleAddLinkToActivePlaylist()
            }}
          >
            <InputTextField
              autoFocus
              fullWidth
              placeholder="Paste a YouTube link"
              value={linkValue}
              onKeyDown={handleKeyDown}
              onChange={(e: React.FormEvent<HTMLInputElement>) => {
                setLinkValue(e.currentTarget.value)
              }}
              onFocus={() => {
                if (!focused) dispatch(setFocused(true))
              }}
              onBlur={() => dispatch(setFocused(false))}
            />
          </InputWrapper>
          {linkError ? (
            <EmptyState style={{ paddingTop: 8 }}>{linkError}</EmptyState>
          ) : (
            <EmptyState style={{ paddingTop: 8 }}>
              Add a track via a direct YouTube link.
            </EmptyState>
          )}
          <div style={{ paddingTop: 10 }}>
            <PrimaryButton
              type="button"
              onClick={() => {
                handleAddLinkToActivePlaylist()
              }}
            >
              <AddIcon fontSize="small" />
              Add
            </PrimaryButton>
          </div>
        </>
      ) : (
        <>
          <Tab>
            <UserPlaylist
              onEditTrack={(trackId) => {
                setEditingTrackId(trackId)
              }}
            />
          </Tab>
        </>
      )}
    </section>
  )
}

const ListItem = styled.li`
  border-radius: 0px;
  padding: 10px;
  display: flex;
  color: rgba(255, 255, 255, 0.85);
  flex-direction: row;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  justify-content: space-between;

  span {
    color: rgba(255, 255, 255, 0.75);
  }

  h4 {
    color: rgba(255, 255, 255, 0.85);
  }
`

const YoutubeResult = ({
  id,
  thumbnail,
  title,
  length,
  onAdd,
}: YoutubeSearchResult & {
  onAdd: (title: string, id: string, lengthText: string) => void
}) => {
  const lengthText = length?.simpleText ?? ''

  return (
    <ListItem>
      <section>
        <h4>{title}</h4>
      </section>
      <section style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{lengthText}</span>
        <IconButton
          size="small"
          onClick={() => {
            onAdd(title, id, lengthText)
          }}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </section>
    </ListItem>
  )
}

const UserPlaylist = ({ onEditTrack }: { onEditTrack: (trackId: string) => void }) => {
  const playlists = useAppSelector((state) => state.myPlaylist.playlists)
  const activePlaylistId = useAppSelector((state) => state.myPlaylist.activePlaylistId)
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null
  const connectedBoothIndex = useAppSelector((state) => state.musicBooth.musicBoothIndex)
  const isInDJQueue = useAppSelector((state) => state.djQueue.isInQueue)
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null)

  const game = phaserGame.scene.keys.game as Game
  const dispatch = useAppDispatch()

  const formatDuration = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return ''
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const handleAddToRoom = (item: PlaylistItem) => {
    if (!item.link) return
    game.network.addRoomPlaylistItem({
      title: item.title,
      link: item.link,
      duration: item.duration,
    })
  }

  const handleAddToDJQueue = (item: PlaylistItem) => {
    if (!item.link) return
    game.network.addToRoomQueuePlaylist({
      title: item.title,
      link: item.link,
      duration: item.duration,
    })
  }

  const items = activePlaylist?.items ?? []

  if (items.length === 0) {
    return <EmptyState>Add a track via Search or via Link.</EmptyState>
  }

  const renderMyPlaylistItems = items.map((item, index) => {
    const { title, duration } = item
    return (
      <ListItem
        key={item.id}
        draggable
        onDragStart={() => {
          setDragFromIndex(index)
        }}
        onDragOver={(e) => {
          e.preventDefault()
        }}
        onDrop={() => {
          if (dragFromIndex === null) return
          if (!activePlaylistId) return
          dispatch(
            reorderPlaylistItems({
              playlistId: activePlaylistId,
              fromIndex: dragFromIndex,
              toIndex: index,
            })
          )
          setDragFromIndex(null)
        }}
        style={{ cursor: 'grab' }}
      >
        <section>
          <h4>{title}</h4>
        </section>
        <section style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{formatDuration(duration)}</span>
          <IconButton
            size="small"
            onClick={() => {
              onEditTrack(item.id)
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
              if (!activePlaylistId) return
              dispatch(removeItemFromMyPlaylist({ playlistId: activePlaylistId, itemId: item.id }))
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
          {connectedBoothIndex !== null || isInDJQueue ? (
            <IconButton
              size="small"
              onClick={() => {
                if (isInDJQueue) {
                  handleAddToDJQueue(item)
                } else {
                  handleAddToRoom(item)
                }
              }}
              title={isInDJQueue ? 'Add to DJ Queue' : 'Add to Room Playlist'}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          ) : null}
        </section>
      </ListItem>
    )
  })

  return <MyPlaylistWrapper>{renderMyPlaylistItems}</MyPlaylistWrapper>
}
