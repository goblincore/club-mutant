import React, { useRef, useEffect, useState } from 'react'
import styled from 'styled-components'
import InputBase from '@mui/material/InputBase'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import Fab from '@mui/material/Fab'
import Game from '../scenes/Game'
import phaserGame from '../PhaserGame'
import { useAppSelector, useAppDispatch } from '../hooks'
import { openMyPlaylistPanel, closeMyPlaylistPanel, setFocused } from '../stores/MyPlaylistStore'
import axios from 'axios'
import store from '../stores'
import { addItemToMyPlaylist, syncPlayQueue } from '../stores/MyPlaylistStore'
import { v4 as uuidv4 } from 'uuid';
import { IPlaylistItem } from '../../../types/IOfficeState'

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
`
const Wrapper = styled.div`
  width: 100%;
  height: 100%;
  background: #eee;
  border-radius: 16px;
  padding: 0;
  color: #eee;
  display: flex;
  flex-direction: column;

  .close {
    margin: 0 0 0 auto;
    padding: 0;
  }
`

const MyPlaylistWrapper = styled.div`
  flex: 1;
  border-radius: 0px;
  border-top: 1px solid #aaa;
  overflow-y: auto;
  padding: 5px 5px;
  width: 100%;
  height: 100%;
`

const FabWrapper = styled.div`
  button {
    font-size: 14px;
    color: #666;
    text-transform: lowercase !important;
    line-height: 100%;
    background-color: white !important;
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

      console.log('currentlyPlayingsong', currentMusicStream);

      if (currentPlaylist?.items?.length < 2 && !currentMusicStream.link) {
        const queueItems = currentPlaylist.items.slice(0, 2)
        console.log('queueItems', queueItems)
        game.network.syncPlayerPlaylistQueue(queueItems)
      }

      if (currentMusicStream.link && currentMusicStream?.link === currentPlaylist.items?.[0]?.link) {
        const queueItems = currentPlaylist.items.slice(0, 2)
        console.log('queueItems', queueItems)
        game.network.syncPlayerPlaylistQueue(queueItems)
      }

      if (currentPlaylist?.items && currentMusicStream.link && currentMusicStream?.link !== currentPlaylist.items?.[0]?.link) {
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
                  color: '#888',
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
              My Playlist
            </Fab>
          </FabWrapper>
        </div>
      )}
    </Backdrop>
  )
}

const InputWrapper = styled.form`
  border: 1px solid #42eacb;
  border-radius: 10px;
  display: flex;
  flex-direction: row;
`

const InputTextField = styled(InputBase)`
  border-radius: 10px;
  input {
    padding: 5px;
    color: #222;
  }
`

const Tab = styled.ul`
  padding: 0px;
  margin: 0px;
  button {
    color: #222;
  }
`

const MusicSearch = () => {
  const [data, setData] = useState([])
  const [tab, setTab] = useState('search')
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dispatch = useAppDispatch()
  const focused = useAppSelector((state) => state.myPlaylist.focused)
  const currentPlaylist =  useAppSelector((state) => state.myPlaylist);
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

  console.log('////MusicSearchPanel, data', data);

  const handleChange = (event: React.FormEvent<HTMLInputElement>) => {
    setInputValue(event.currentTarget.value)
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    inputRef.current?.blur()
    setInputValue('')
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    console.log("////handleKeyDown")
    if (event.key === 'Escape') {
      inputRef.current?.blur()
      dispatch(closeMyPlaylistPanel())
    }
  }

  const handleClick = (title: string, id: string, lengthText: string) => {
    const durationParts = lengthText.split(':')
    let duration = 0

    if (durationParts.length === 3) {
      duration =
        Number(durationParts[0]) * 60 * 60 +
        Number(durationParts[1]) * 60 +
        Number(durationParts[2])
    }

    if (durationParts.length === 2) {
      duration = Number(durationParts[0]) * 60 +
        Number(durationParts[1]) * 60
    }
    console.log('////MusicSearch, handleClick, duration', duration)

    const item: any = {
      title,
      link: id,
      djId: game.myPlayer.playerId,
      id: uuidv4(),
      duration,
    }
    store.dispatch(addItemToMyPlaylist(item))
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

      <button style={{ color: '#222' }} onClick={() => setTab('search')}>
        Search
      </button>
      <button style={{ color: '#222' }} onClick={() => setTab('playlist')}>
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
  color: #666;
  flex-direction: row;
  border-bottom: 1px solid grey;
  justify-content: space-between;

  h4 {
    color: #666;
  }
`

const YoutubeResult = ({ id, thumbnail, title, length, onClick }) => {
  const lengthText = length?.simpleText

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

  const game = phaserGame.scene.keys.game as Game
  const handleClick = () => {}

  const renderMyPlaylistItems = myPlaylist?.items?.map((item) => {
    const { link, title, duration } = item
    return (
      <ListItem onClick={() => handleClick()}>
        <section>
          <h4>{title}</h4>
        </section>
        <section>{duration}</section>
      </ListItem>
    )
  })

  return (
    <MyPlaylistWrapper>
      {renderMyPlaylistItems}
    </MyPlaylistWrapper>
  )
}
