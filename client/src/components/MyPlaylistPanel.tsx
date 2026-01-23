import React, { useRef, useEffect, useState } from 'react'
import styled from 'styled-components'
import InputBase from '@mui/material/InputBase'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import Fab from '@mui/material/Fab'
import Game from '../scenes/Game'
import phaserGame from '../PhaserGame'
import { useAppSelector, useAppDispatch } from '../hooks'
import { openMyPlaylistPanel, closeMyPlaylistPanel, setFocused } from '../stores/MyPlaylistStore'
import axios from 'axios'
import store from '../stores'
import { addItemToMyPlaylist, syncPlayQueue } from '../stores/MyPlaylistStore'
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
  const currentPlaylist = useAppSelector((state) => state.myPlaylist)
  const playQueue = useAppSelector((state) => state.myPlaylist.playQueue)
  const currentMusicStream = useAppSelector((state) => state.musicStream)

  useEffect(() => {
    if (currentPlaylist && currentPlaylist?.items) {
      /* This currently handle syncing the players playlist on the server with the client */

      console.log('currentlyPlayingsong', currentMusicStream)

      if (currentPlaylist?.items?.length < 2 && !currentMusicStream.link) {
        const queueItems = currentPlaylist.items.slice(0, 2)
        console.log('queueItems', queueItems)
        game.network.syncPlayerPlaylistQueue(queueItems)
      }

      if (
        currentMusicStream.link &&
        currentMusicStream?.link === currentPlaylist.items?.[0]?.link
      ) {
        const queueItems = currentPlaylist.items.slice(0, 2)
        console.log('queueItems', queueItems)
        game.network.syncPlayerPlaylistQueue(queueItems)
      }

      if (
        currentPlaylist?.items &&
        currentMusicStream.link &&
        currentMusicStream?.link !== currentPlaylist.items?.[0]?.link
      ) {
        const queueItems = currentPlaylist.items.slice(0, 2)
        console.log('queueItems', queueItems)
        game.network.syncPlayerPlaylistQueue(queueItems)
      }
    }
  }, [currentPlaylist.items])

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
                My Playlist
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
          )
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

const Tab = styled.ul`
  padding: 0px;
  margin: 0px;

  button {
    color: rgba(255, 255, 255, 0.9);
  }
`

const MusicSearch = () => {
  const [data, setData] = useState([])
  const [tab, setTab] = useState<'search' | 'playlist'>('search')
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dispatch = useAppDispatch()
  const focused = useAppSelector((state) => state.myPlaylist.focused)
  const currentPlaylist = useAppSelector((state) => state.myPlaylist)
  const game = phaserGame.scene.keys.game as Game

  useEffect(() => {
    axios.get(`http://localhost:2567/youtube/${inputValue}`).then((response) => {
      setData(response?.data?.items)
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

  const handleClick = (title: string, id: string, lengthText: string) => {
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
    console.log('////MusicSearch, handleClick, duration', duration)

    const item: PlaylistItem = {
      title,
      link: id,
      djId: game.myPlayer.playerId,
      id: uuidv4(),
      duration,
    }
    store.dispatch(addItemToMyPlaylist(item))
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
    data?.length > 0 &&
    data?.map((result) => {
      const { title, thumbnail, length, id } = result
      return (
        <YoutubeResult
          onClick={handleClick}
          key={id}
          title={title}
          thumbnail={thumbnail}
          length={length}
          id={id}
        />
      )
    })

  return (
    <section>
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

      <button style={{ color: 'rgba(255, 255, 255, 0.9)' }} onClick={() => setTab('search')}>
        Search
      </button>
      <button style={{ color: 'rgba(255, 255, 255, 0.9)' }} onClick={() => setTab('playlist')}>
        Playlist
      </button>

      {tab === 'search' && <Tab>{resultsList}</Tab>}

      {tab === 'playlist' && (
        <Tab>
          <UserPlaylist />
        </Tab>
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

const YoutubeResult = ({ id, thumbnail, title, length, onClick }) => {
  const lengthText = length?.simpleText ?? ''

  return (
    <ListItem onClick={() => onClick(title, id, lengthText)}>
      <section>
        <h4>{title}</h4>
      </section>
      <section>{lengthText}</section>
    </ListItem>
  )
}

const UserPlaylist = (props) => {
  const myPlaylist = useAppSelector((state) => state.myPlaylist)
  const connectedBoothIndex = useAppSelector((state) => state.musicBooth.musicBoothIndex)

  const game = phaserGame.scene.keys.game as Game

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

  const renderMyPlaylistItems = myPlaylist?.items?.map((item) => {
    const { link, title, duration } = item
    return (
      <ListItem>
        <section>
          <h4>{title}</h4>
        </section>
        <section style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{formatDuration(duration)}</span>
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
