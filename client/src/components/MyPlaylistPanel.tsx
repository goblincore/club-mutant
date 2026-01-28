import React, { useRef, useEffect, useState } from 'react'
import styled from 'styled-components'
import InputBase from '@mui/material/InputBase'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
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
} from '../stores/MyPlaylistStore'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import type { PlaylistItem } from '../../../types/IOfficeState'

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  width: 100vw;
  height: 50vh;
  background: transparent;
  overflow: hidden;
  max-width: 400px;
  padding: 16px 16px 16px 16px;
  pointer-events: auto;
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
  // const game = phaserGame.scene.keys.game as Game
  const playlists = useAppSelector((state) => state.myPlaylist.playlists)
  const activePlaylistId = useAppSelector((state) => state.myPlaylist.activePlaylistId)
  const playQueue = useAppSelector((state) => state.myPlaylist.playQueue)
  const currentMusicStream = useAppSelector((state) => state.musicStream)

  const previousInputEnabledRef = useRef<boolean | null>(null)
  const previousKeyboardEnabledRef = useRef<boolean | null>(null)

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null
  const activeItems = activePlaylist?.items ?? []

  useEffect(() => {
    if (activeItems.length > 0) {
      /* This currently handle syncing the players playlist on the server with the client */

      console.log('currentlyPlayingsong', currentMusicStream)

      if (activeItems.length < 2 && !currentMusicStream.link) {
        const queueItems = activeItems.slice(0, 2)
        console.log('queueItems', queueItems)
        game.network.syncPlayerPlaylistQueue(queueItems)
      }

      if (currentMusicStream.link && currentMusicStream?.link === activeItems?.[0]?.link) {
        const queueItems = activeItems.slice(0, 2)
        console.log('queueItems', queueItems)
        game.network.syncPlayerPlaylistQueue(queueItems)
      }

      if (currentMusicStream.link && currentMusicStream?.link !== activeItems?.[0]?.link) {
        const queueItems = activeItems.slice(0, 2)
        console.log('queueItems', queueItems)
        game.network.syncPlayerPlaylistQueue(queueItems)
      }
    }
  }, [activeItems])

  useEffect(() => {
    const input = game?.input
    if (!input) return

    const keyboard = input.keyboard

    const restore = () => {
      if (previousInputEnabledRef.current !== null) {
        input.enabled = previousInputEnabledRef.current
        previousInputEnabledRef.current = null
      }

      if (keyboard && previousKeyboardEnabledRef.current !== null) {
        keyboard.enabled = previousKeyboardEnabledRef.current
        previousKeyboardEnabledRef.current = null
      }
    }

    if (showPlaylistDialog) {
      if (previousInputEnabledRef.current === null) {
        previousInputEnabledRef.current = input.enabled
      }
      input.enabled = false

      if (keyboard) {
        if (previousKeyboardEnabledRef.current === null) {
          previousKeyboardEnabledRef.current = keyboard.enabled
        }
        keyboard.enabled = false
      }
    } else {
      restore()
    }

    return () => {
      restore()
    }
  }, [game, showPlaylistDialog])

  useEffect(() => {
    console.log('player short queue changed', playQueue)
    // game.network.syncPlayerPlaylistQueue(playQueue);
  }, [playQueue])

  const handlePlay = () => {
    console.log('handlePlay')
    game.network.syncMusicStream()
  }

  return (
    <Backdrop>
      {showPlaylistDialog ? (
        <Wrapper>
          <>
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
          </>
        </Wrapper>
      ) : (
        <div style={{ textAlign: 'right' }}>
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
  const [creating, setCreating] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [linkValue, setLinkValue] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dispatch = useAppDispatch()
  const panelOpen = useAppSelector((state) => state.myPlaylist.myPlaylistPanelOpen)
  const focused = useAppSelector((state) => state.myPlaylist.focused)
  const playlists = useAppSelector((state) => state.myPlaylist.playlists)
  const activePlaylistId = useAppSelector((state) => state.myPlaylist.activePlaylistId)
  const game = phaserGame.scene.keys.game as Game

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null

  useEffect(() => {
    if (!panelOpen) return

    setScreen('home')
    setTab('playlist')
    setCreating(false)
    setNewPlaylistName('')
    setInputValue('')
    setLinkValue('')
    setLinkError(null)
  }, [panelOpen])

  useEffect(() => {
    if (tab !== 'search') {
      setData([])
      return
    }

    const query = inputValue.trim()
    if (query === '') {
      setData([])
      return
    }

    axios.get(`http://localhost:2567/youtube/${encodeURIComponent(query)}`).then((response) => {
      setData((response?.data?.items as YoutubeSearchResult[]) ?? [])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue])

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

  if (screen === 'home') {
    return (
      <section>
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
                  <section>
                    <span>{p.items.length}</span>
                  </section>
                </ListItem>
              ))}
            </Tab>
          </>
        )}
      </section>
    )
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

      {tab === 'search' ? (
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
          <Tab>{resultsList}</Tab>
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
            <UserPlaylist />
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

const UserPlaylist = () => {
  const playlists = useAppSelector((state) => state.myPlaylist.playlists)
  const activePlaylistId = useAppSelector((state) => state.myPlaylist.activePlaylistId)
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null
  const connectedBoothIndex = useAppSelector((state) => state.musicBooth.musicBoothIndex)
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

  const items = activePlaylist?.items ?? []

  if (items.length === 0) {
    return <EmptyState>Add a track via Search or via Link.</EmptyState>
  }

  const renderMyPlaylistItems = items.map((item, index) => {
    const { link, title, duration } = item
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
              if (!activePlaylistId) return
              dispatch(removeItemFromMyPlaylist({ playlistId: activePlaylistId, itemId: item.id }))
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
          {connectedBoothIndex !== null ? (
            <IconButton
              size="small"
              onClick={() => {
                handleAddToRoom(item)
              }}
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
