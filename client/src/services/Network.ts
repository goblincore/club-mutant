import { Client, Room, getStateCallbacks } from 'colyseus.js'
import type { CollectionCallback, CallbackProxy } from '@colyseus/schema'

import {
  IOfficeState,
  IPlayer,
  IMusicBooth,
  IChatMessage,
  IPlaylistItem,
  PlaylistItem,
  IMusicStream,
  IRoomPlaylistItem,
} from '../../../types/IOfficeState'
import { Message } from '../../../types/Messages'
import { IRoomData, RoomType } from '../../../types/Rooms'
import { ItemType } from '../../../types/Items'
import { phaserEvents, Event } from '../events/EventCenter'
import store from '../stores'
import { setSessionId, setPlayerNameMap, removePlayerNameMap } from '../stores/UserStore'
import { connectToMusicBooth, disconnectFromMusicBooth } from '../stores/MusicBoothStore'
import {
  setLobbyJoined,
  setJoinedRoomData,
  setAvailableRooms,
  addAvailableRooms,
  removeAvailableRooms,
  setJoinedRoomType,
} from '../stores/RoomStore'
import {
  pushChatMessage,
  pushPlayerJoinedMessage,
  pushPlayerLeftMessage,
} from '../stores/ChatStore'
import {
  addItemToMyPlaylist,
  removeItemFromMyPlaylist,
  syncPlayQueue,
  removeFromPlayQueue,
} from '../stores/MyPlaylistStore'
import { setMusicStream, setVideoBackgroundEnabled } from '../stores/MusicStreamStore'
import {
  addRoomPlaylistItem,
  removeRoomPlaylistItem,
  setRoomPlaylist,
  type RoomPlaylistItem as RoomPlaylistItemState,
} from '../stores/RoomPlaylistStore'

// This class centralizes the handling of network events from the server
// mostly the socket events
// then dispatches them to update redux store
export default class Network {
  private client: Client
  private room?: Room<IOfficeState>
  private lobby!: Room

  mySessionId!: string

  constructor() {
    const protocol = window.location.protocol.replace('http', 'ws')

    const endpoint =
      import.meta.env.VITE_WS_ENDPOINT ??
      (import.meta.env.PROD
        ? `wss://sky-office.herokuapp.com`
        : `${protocol}//${window.location.hostname}:2567`)

    this.client = new Client(endpoint)
    this.joinLobbyRoom().then(() => {
      store.dispatch(setLobbyJoined(true))
    })

    phaserEvents.on(Event.MY_PLAYER_NAME_CHANGE, this.updatePlayerName, this)
    phaserEvents.on(Event.MY_PLAYER_TEXTURE_CHANGE, this.updatePlayerAction, this)
  }

  /**
   * method to join Colyseus' built-in LobbyRoom, which automatically notifies
   * connected clients whenever rooms with "realtime listing" have updates
   */
  async joinLobbyRoom() {
    this.lobby = await this.client.joinOrCreate(RoomType.LOBBY)

    this.lobby.onMessage('rooms', (rooms) => {
      store.dispatch(setAvailableRooms(rooms))
    })

    this.lobby.onMessage('+', ([roomId, room]) => {
      store.dispatch(addAvailableRooms({ roomId, room }))
    })

    this.lobby.onMessage('-', (roomId) => {
      store.dispatch(removeAvailableRooms(roomId))
    })
  }

  // method to join the public lobby
  async joinOrCreatePublic() {
    this.room = await this.client.joinOrCreate(RoomType.PUBLIC)
    store.dispatch(setJoinedRoomType(RoomType.PUBLIC))
    this.initialize()
  }

  // method to join a custom room
  async joinCustomById(roomId: string, password: string | null) {
    this.room = await this.client.joinById(roomId, { password })
    store.dispatch(setJoinedRoomType(RoomType.CUSTOM))
    this.initialize()
  }

  // method to create a custom room
  async createCustom(roomData: IRoomData) {
    const { name, description, password, autoDispose } = roomData
    this.room = await this.client.create(RoomType.CUSTOM, {
      name,
      description,
      password,
      autoDispose,
    })
    store.dispatch(setJoinedRoomType(RoomType.CUSTOM))
    this.initialize()
  }

  // set up all network listeners before the game starts
  initialize() {
    if (!this.room) return

    const syncMusicStreamFromState = () => {
      if (!this.room) return

      const ms = (this.room.state as unknown as { musicStream?: IMusicStream }).musicStream

      if (!ms) {
        store.dispatch(setMusicStream(null))
        store.dispatch(setVideoBackgroundEnabled(false))
        phaserEvents.emit(Event.STOP_PLAYING_MEDIA)
        return
      }

      if (ms.status !== 'playing' || !ms.currentLink) {
        store.dispatch(setMusicStream(null))
        phaserEvents.emit(Event.STOP_PLAYING_MEDIA)
        return
      }

      const currentTime: number = Date.now()
      const offset = (currentTime - ms.startTime) / 1000

      store.dispatch(
        setMusicStream({
          url: ms.currentLink,
          title: ms.currentTitle,
          startTime: ms.startTime,
          currentDj: ms.currentDj,
          isRoomPlaylist: ms.isRoomPlaylist,
          roomPlaylistIndex: ms.roomPlaylistIndex,
          videoBackgroundEnabled: ms.videoBackgroundEnabled,
          isAmbient: ms.isAmbient,
        })
      )

      phaserEvents.emit(Event.START_PLAYING_MEDIA, ms, offset)
    }

    this.lobby.leave()
    this.mySessionId = this.room.sessionId
    store.dispatch(setSessionId(this.room.sessionId))

    const callbacks = getStateCallbacks(this.room)

    const stateCallbacks = callbacks(this.room.state) as unknown as CallbackProxy<IOfficeState>

    const playersCallbacks = stateCallbacks.players as unknown as CollectionCallback<
      string,
      IPlayer
    >

    const musicBoothsCallbacks = stateCallbacks.musicBooths as unknown as CollectionCallback<
      number,
      IMusicBooth
    >

    const chatMessagesCallbacks = stateCallbacks.chatMessages as unknown as CollectionCallback<
      number,
      IChatMessage
    >

    const roomPlaylistCallbacks = stateCallbacks.roomPlaylist as unknown as CollectionCallback<
      number,
      IRoomPlaylistItem
    >

    // new instance added to the players MapSchema
    playersCallbacks.onAdd((player: IPlayer, key: string) => {
      if (key === this.mySessionId) {
        callbacks(player.nextTwoPlaylist).onRemove((_item, _index) => {
          console.log('////*player next two playlist onchange item', player.nextTwoPlaylist)
          // store.dispatch(removeFromPlayQueue(item))
        })
        return
      }

      let hasEmittedJoined = false

      if (player.name !== '') {
        hasEmittedJoined = true
        phaserEvents.emit(Event.PLAYER_JOINED, player, key)
        store.dispatch(setPlayerNameMap({ id: key, name: player.name }))
        store.dispatch(pushPlayerJoinedMessage(player.name))
      }

      const playerCallbacks = callbacks(player)

      playerCallbacks.listen('x', (value) => {
        phaserEvents.emit(Event.PLAYER_UPDATED, 'x', value, key)
      })

      playerCallbacks.listen('y', (value) => {
        phaserEvents.emit(Event.PLAYER_UPDATED, 'y', value, key)
      })

      playerCallbacks.listen('anim', (value) => {
        phaserEvents.emit(Event.PLAYER_UPDATED, 'anim', value, key)
      })

      playerCallbacks.listen('readyToConnect', (value) => {
        phaserEvents.emit(Event.PLAYER_UPDATED, 'readyToConnect', value, key)
      })

      playerCallbacks.listen('videoConnected', (value) => {
        phaserEvents.emit(Event.PLAYER_UPDATED, 'videoConnected', value, key)
      })

      playerCallbacks.listen('name', (value) => {
        phaserEvents.emit(Event.PLAYER_UPDATED, 'name', value, key)

        if (!hasEmittedJoined && value !== '') {
          hasEmittedJoined = true
          phaserEvents.emit(Event.PLAYER_JOINED, player, key)
          store.dispatch(setPlayerNameMap({ id: key, name: value }))
          store.dispatch(pushPlayerJoinedMessage(value))
        }
      })
    }, true)

    // when a player left the room, this instance will be removed from the players MapSchema
    playersCallbacks.onRemove((player: IPlayer, key: string) => {
      phaserEvents.emit(Event.PLAYER_LEFT, key)
      store.dispatch(pushPlayerLeftMessage(player.name))
      store.dispatch(removePlayerNameMap(key))
    })

    // new instance added to the music booth MapSchema
    musicBoothsCallbacks.onAdd((musicBooth: IMusicBooth, index: number) => {
      const boothCallbacks = callbacks(musicBooth)

      boothCallbacks.listen(
        'connectedUser',
        (value, previousValue) => {
          if (value === null || value === '') {
            if (previousValue === undefined) return

            const removedUserId = typeof previousValue === 'string' ? previousValue : ''
            phaserEvents.emit(Event.ITEM_USER_REMOVED, removedUserId, index, ItemType.MUSIC_BOOTH)

            const connectedIndex = store.getState().musicBooth.musicBoothIndex
            if (connectedIndex === index) {
              store.dispatch(disconnectFromMusicBooth())
            }
            return
          }

          if (typeof value !== 'string' || value === '') return

          console.log('USER JOINED MUSICBOOTH value', value)
          phaserEvents.emit(Event.ITEM_USER_ADDED, value, index, ItemType.MUSIC_BOOTH)

          if (value === this.mySessionId) {
            store.dispatch(connectToMusicBooth(index))
          }
        },
        true
      )
    }, true)

    // new instance added to the chatMessages ArraySchema
    chatMessagesCallbacks.onAdd((item: IChatMessage, _index: number) => {
      store.dispatch(pushChatMessage(item))
    }, true)

    const toRoomPlaylistItem = (item: IRoomPlaylistItem): RoomPlaylistItemState => ({
      id: item.id,
      title: item.title,
      link: item.link,
      duration: item.duration,
      addedAtMs: item.addedAtMs,
      addedBySessionId: item.addedBySessionId,
    })

    const roomPlaylist = (this.room.state as unknown as { roomPlaylist?: Array<IRoomPlaylistItem> })
      .roomPlaylist

    store.dispatch(setRoomPlaylist(roomPlaylist ? roomPlaylist.map(toRoomPlaylistItem) : []))

    if (stateCallbacks.roomPlaylist) {
      roomPlaylistCallbacks.onAdd((item: IRoomPlaylistItem, _index: number) => {
        store.dispatch(addRoomPlaylistItem(toRoomPlaylistItem(item)))
      }, true)

      roomPlaylistCallbacks.onRemove((item: IRoomPlaylistItem, _index: number) => {
        store.dispatch(removeRoomPlaylistItem(item.id))
      })
    }

    // when the server sends room data
    this.room.onMessage(Message.SEND_ROOM_DATA, (content) => {
      store.dispatch(setJoinedRoomData(content))
    })

    // when the server sends room data
    this.room.onMessage(Message.START_MUSIC_STREAM, ({ musicStream, offset }) => {
      console.log('start playing media on message START_USIC STREAM', musicStream, offset)
      phaserEvents.emit(Event.START_PLAYING_MEDIA, musicStream, offset)
    })

    // when the server sends room data
    this.room.onMessage(Message.STOP_MUSIC_STREAM, () => {
      phaserEvents.emit(Event.STOP_PLAYING_MEDIA)
    })

    this.room.onMessage(
      Message.UPDATE_PLAYER_ACTION,
      (payload: { x: number; y: number; anim: string; sessionId: string }) => {
        phaserEvents.emit(Event.PLAYER_UPDATED, 'x', payload.x, payload.sessionId)
        phaserEvents.emit(Event.PLAYER_UPDATED, 'y', payload.y, payload.sessionId)
        phaserEvents.emit(Event.PLAYER_UPDATED, 'anim', payload.anim, payload.sessionId)
      }
    )

    this.room.onMessage(
      Message.PUNCH_PLAYER,
      (payload: { anim: string; x?: number; y?: number }) => {
        if (!payload || typeof payload.anim !== 'string') return
        phaserEvents.emit(Event.MY_PLAYER_FORCED_ANIM, payload.anim, payload.x, payload.y)
      }
    )

    store.dispatch(setVideoBackgroundEnabled(false))
    store.dispatch(setMusicStream(null))

    syncMusicStreamFromState()

    stateCallbacks.musicStream.listen(
      'videoBackgroundEnabled',
      (value) => {
        store.dispatch(setVideoBackgroundEnabled(Boolean(value)))
      },
      true
    )

    stateCallbacks.musicStream.listen('status', () => {
      syncMusicStreamFromState()
    })

    stateCallbacks.musicStream.listen('currentLink', () => {
      syncMusicStreamFromState()
    })

    stateCallbacks.musicStream.listen('currentTitle', () => {
      syncMusicStreamFromState()
    })

    stateCallbacks.musicStream.listen('startTime', () => {
      syncMusicStreamFromState()
    })

    stateCallbacks.musicStream.listen('isRoomPlaylist', () => {
      syncMusicStreamFromState()
    })

    stateCallbacks.musicStream.listen('roomPlaylistIndex', () => {
      syncMusicStreamFromState()
    })

    stateCallbacks.musicStream.listen('isAmbient', () => {
      syncMusicStreamFromState()
    })
  }

  // method to register event listener and call back function when a item user added
  onChatMessageAdded(callback: (playerId: string, content: string) => void, context?: any) {
    phaserEvents.on(Event.UPDATE_DIALOG_BUBBLE, callback, context)
  }

  onStartMusicStream(callback: (musicStream: IMusicStream, offset: number) => void, context?: any) {
    phaserEvents.on(Event.START_PLAYING_MEDIA, callback, context) // how to update within phaser game instance
  }

  onStopMusicStream(callback: () => void, context?: any) {
    phaserEvents.on(Event.STOP_PLAYING_MEDIA, callback, context) // how to update within phaser game instance
  }

  // method to register event listener and call back function when a item user added
  onItemUserAdded(
    callback: (playerId: string, itemId: number, itemType: ItemType) => void,
    context?: any
  ) {
    phaserEvents.on(Event.ITEM_USER_ADDED, callback, context)

    if (!this.room) return

    const musicBooths = (
      this.room.state as unknown as {
        musicBooths?: {
          forEach?: (cb: (value: unknown, index: number) => void) => void
        }
      }
    ).musicBooths

    if (!musicBooths || typeof musicBooths.forEach !== 'function') return

    musicBooths.forEach((booth, index) => {
      const connectedUser = (booth as unknown as { connectedUser?: unknown }).connectedUser
      if (typeof connectedUser !== 'string' || connectedUser === '') return

      if (context) {
        callback.call(context, connectedUser, index, ItemType.MUSIC_BOOTH)
      } else {
        callback(connectedUser, index, ItemType.MUSIC_BOOTH)
      }
    })
  }

  // method to register event listener and call back function when a item user removed
  onItemUserRemoved(
    callback: (playerId: string, itemId: number, itemType: ItemType) => void,
    context?: any
  ) {
    phaserEvents.on(Event.ITEM_USER_REMOVED, callback, context)
  }

  // method to register event listener and call back function when a player joined
  onPlayerJoined(callback: (Player: IPlayer, key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_JOINED, callback, context)

    if (!this.room) return

    const players = (
      this.room.state as unknown as {
        players?: {
          forEach?: (cb: (player: IPlayer, key: string) => void) => void
        }
      }
    ).players

    if (!players || typeof players.forEach !== 'function') return

    players.forEach((player, key) => {
      if (key === this.mySessionId) return
      if (player.name === '') return

      if (context) {
        callback.call(context, player, key)
      } else {
        callback(player, key)
      }
    })
  }

  // method to register event listener and call back function when a player left
  onPlayerLeft(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_LEFT, callback, context)
  }

  // method to register event listener and call back function when myPlayer is ready to connect
  onMyPlayerReady(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.MY_PLAYER_READY, callback, context)
  }

  onMyPlayerForcedAnim(
    callback: (animKey: string, x?: number, y?: number) => void,
    context?: unknown
  ) {
    phaserEvents.on(Event.MY_PLAYER_FORCED_ANIM, callback, context)
  }

  // method to register event listener and call back function when a player updated
  onPlayerUpdated(
    callback: (field: string, value: number | string, key: string) => void,
    context?: any
  ) {
    phaserEvents.on(Event.PLAYER_UPDATED, callback, context)
  }

  // method to send player action updates to Colyseus server
  updatePlayerAction(currentX: number, currentY: number, currentAnim: string) {
    // console.log('Update player action')
    this.room?.send(Message.UPDATE_PLAYER_ACTION, { x: currentX, y: currentY, anim: currentAnim })
  }

  punchPlayer(targetId: string) {
    if (!targetId) return
    this.room?.send(Message.PUNCH_PLAYER, { targetId })
  }

  // method to send player name to Colyseus server
  updatePlayerName(currentName: string) {
    console.log('////Network, initialize, updatePlayerName, currentName', currentName)
    this.room?.send(Message.UPDATE_PLAYER_NAME, { name: currentName })
  }

  // method to send ready-to-connect signal to Colyseus server
  readyToConnect() {
    console.log('////Network, initialize, readyToConnect')
    this.room?.send(Message.READY_TO_CONNECT)
    phaserEvents.emit(Event.MY_PLAYER_READY)
  }

  connectToMusicBooth(index: number) {
    console.log('////Network, initialize, connectToMusicBooth, index', index)
    this.room?.send(Message.CONNECT_TO_MUSIC_BOOTH, { musicBoothIndex: index })
  }

  disconnectFromMusicBooth(index: number) {
    console.log('////Network, initialize, disconnectFromMusicBooth, index')
    this.room?.send(Message.DISCONNECT_FROM_MUSIC_BOOTH, { musicBoothIndex: index })
  }

  syncPlayerPlaylistQueue(items: PlaylistItem[]) {
    console.log('//Synchronize player queue playlist', items)
    this.room?.send(Message.SYNC_USER_SHORT_PLAYLIST, { items })
  }

  syncMusicStream(item?: PlaylistItem) {
    console.log('Synchronize music stream', item)
    this.room?.send(Message.SYNC_MUSIC_STREAM, { item })
  }

  addRoomPlaylistItem(item: Pick<PlaylistItem, 'title' | 'link' | 'duration'>) {
    if (!item.link) return
    this.room?.send(Message.ROOM_PLAYLIST_ADD, {
      title: item.title,
      link: item.link,
      duration: item.duration,
    })
  }

  removeRoomPlaylistItem(id: string) {
    this.room?.send(Message.ROOM_PLAYLIST_REMOVE, { id })
  }

  skipRoomPlaylist() {
    this.room?.send(Message.ROOM_PLAYLIST_SKIP, {})
  }

  prevRoomPlaylist() {
    this.room?.send(Message.ROOM_PLAYLIST_PREV, {})
  }

  playRoomPlaylist() {
    this.room?.send(Message.ROOM_PLAYLIST_PLAY, {})
  }

  setVideoBackgroundEnabled(enabled: boolean) {
    this.room?.send(Message.SET_VIDEO_BACKGROUND, { enabled })
  }

  addMyPlaylistItem(item: PlaylistItem) {
    console.log('Add playlist item, item', item)
    this.room?.send(Message.ADD_PLAYLIST_ITEM, { item })
  }

  deleteMyPlaylistItem(itemIndex: number) {
    console.log('Add playlist item, itemIndex', itemIndex)
    this.room?.send(Message.DELETE_PLAYLIST_ITEM, { itemIndex })
  }

  addChatMessage(content: string) {
    console.log('Add chat message, content', content)
    this.room?.send(Message.ADD_CHAT_MESSAGE, { content })
  }

  setUserPlaylistItem(item: PlaylistItem) {
    console.log('Set User Playlist Item', item)
    this.room?.send(Message.SET_USER_PLAYLIST_ITEM, { item })
  }

  setNextUserPlaylistItem(item: PlaylistItem) {
    console.log('Set User Playlist Item', item)
    this.room?.send(Message.SET_USER_NEXT_PLAYLIST_ITEM, { item })
  }
}
