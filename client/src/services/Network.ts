import { Client, Room } from 'colyseus.js'

import { IOfficeState, IPlayer, IMusicBooth, IPlaylistItem, IMusicStream } from '../../../types/IOfficeState'
import { Message } from '../../../types/Messages'
import { IRoomData, RoomType } from '../../../types/Rooms'
import { ItemType } from '../../../types/Items'
import { phaserEvents, Event } from '../events/EventCenter'
import store from '../stores'
import { setSessionId, setPlayerNameMap, removePlayerNameMap } from '../stores/UserStore'
import {
  setLobbyJoined,
  setJoinedRoomData,
  setAvailableRooms,
  addAvailableRooms,
  removeAvailableRooms,
} from '../stores/RoomStore'
import {
  pushChatMessage,
  pushPlayerJoinedMessage,
  pushPlayerLeftMessage,
} from '../stores/ChatStore'
import { addItemToPlaylist, removeItemFromPlaylist } from '../stores/PlaylistStore'

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
      process.env.NODE_ENV === 'production'
        ? `wss://sky-office.herokuapp.com`
        : `${protocol}//${window.location.hostname}:2567`
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
    this.initialize()
  }

  // method to join a custom room
  async joinCustomById(roomId: string, password: string | null) {
    this.room = await this.client.joinById(roomId, { password })
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
    this.initialize()
  }

  // set up all network listeners before the game starts
  initialize() {
    if (!this.room) return

    this.lobby.leave()
    this.mySessionId = this.room.sessionId
    store.dispatch(setSessionId(this.room.sessionId))

    // new instance added to the players MapSchema
    this.room.state.players.onAdd = (player: IPlayer, key: string) => {
      if (key === this.mySessionId) {
        player.playlistItems.onAdd = (item, index) => {
          store.dispatch(addItemToPlaylist(item))
        }
        player.playlistItems.onRemove = (item, index) => {
          store.dispatch(removeItemFromPlaylist(index))
        }
        return
      }

      // track changes on every child object inside the players MapSchema
      player.onChange = (changes) => {
        console.log('player onChange', changes);
        changes.forEach((change) => {
          const { field, value } = change
          phaserEvents.emit(Event.PLAYER_UPDATED, field, value, key)

     

          // when a new player finished setting up player name
          if (field === 'name' && value !== '') {
            phaserEvents.emit(Event.PLAYER_JOINED, player, key)
            store.dispatch(setPlayerNameMap({ id: key, name: value }))
            store.dispatch(pushPlayerJoinedMessage(value))
          }
        })
      }
    }


    // when a player left the room, this instance wiill be removed from the players MapSchema
    this.room.state.players.onRemove = (player: IPlayer, key: string) => {
      phaserEvents.emit(Event.PLAYER_LEFT, key)
      store.dispatch(pushPlayerLeftMessage(player.name))
      store.dispatch(removePlayerNameMap(key))
    }

    // new instance added to the music booth MapSchema
    this.room.state.musicBooths.onAdd = (musicBooth: IMusicBooth, index) => {
      // track changes on every child object's connectedUser
      musicBooth.onChange = (changes) => {
        changes.forEach((change) => {
          const { field, value } = change
          if (field === 'connectedUser') {
            if (value === null) {
              phaserEvents.emit(Event.ITEM_USER_REMOVED, index, ItemType.MUSIC_BOOTH)
            } else {
              phaserEvents.emit(Event.ITEM_USER_ADDED, index, value, ItemType.MUSIC_BOOTH)
            }
          }
        })
      }
    }

    // new instance added to the chatMessages ArraySchema
    this.room.state.chatMessages.onAdd = (item, index) => {
      store.dispatch(pushChatMessage(item))
    }

    // when the server sends room data
    this.room.onMessage(Message.SEND_ROOM_DATA, (content) => {
      store.dispatch(setJoinedRoomData(content))
    })

    // when the server sends room data
    this.room.onMessage(Message.START_MUSIC_STREAM, ({ musicStream, offset }) => {
      console.log('start playing media on message START_USIC STREAM', musicStream, offset);
      phaserEvents.emit(Event.START_PLAYING_MEDIA, musicStream, offset)
    })

    // when the server sends room data
    this.room.onMessage(Message.STOP_MUSIC_STREAM, ({}) => {
      console.log('STOP MUSIC STREAM');
      phaserEvents.emit(Event.STOP_PLAYING_MEDIA, {})
    })

    // when the server sends room data
    this.room.onMessage(Message.SYNC_MUSIC_STREAM, ({}) => {
      this.syncMusicStream()
    })

    this.room.onMessage(Message.ADD_PLAYLIST_ITEM, (data) => {
      console.log('playlistitem added', data);
    })

    // when a user sends a message
    this.room.onMessage(Message.ADD_CHAT_MESSAGE, ({ clientId, content }) => {
      phaserEvents.emit(Event.UPDATE_DIALOG_BUBBLE, clientId, content)
    })
  }

  /* The below are commands that can be accessed and invoked from a component, the above are handlers for when
  the message type is recieved from the functions below, what to do, eg update store, update in game etc */

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
  }

  // method to register event listener and call back function when a player left
  onPlayerLeft(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_LEFT, callback, context)
  }

  // method to register event listener and call back function when myPlayer is ready to connect
  onMyPlayerReady(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.MY_PLAYER_READY, callback, context)
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

  // method to send player name to Colyseus server
  updatePlayerName(currentName: string) {
    console.log('Update player name, currentName', currentName)
    this.room?.send(Message.UPDATE_PLAYER_NAME, { name: currentName })
  }

  // method to send ready-to-connect signal to Colyseus server
  readyToConnect() {
    console.log('Ready to connect')
    this.room?.send(Message.READY_TO_CONNECT)
    phaserEvents.emit(Event.MY_PLAYER_READY)
  }

  connectToMusicBooth(index: number) {
    console.log('Connect to music booth, index', index)
    this.room?.send(Message.CONNECT_TO_MUSIC_BOOTH, { musicBoothIndex: index })
  }

  disconnectFromMusicBooth(index: number) {
    console.log('Disconnect from music booth, index')
    this.room?.send(Message.DISCONNECT_FROM_MUSIC_BOOTH, { musicBoothIndex: index })
  }

  syncMusicStream() {
    console.log('Synchronize music stream');
    this.room?.send(Message.SYNC_MUSIC_STREAM, {})
  }

  addPlaylistItem(item: IPlaylistItem) {
    console.log('Add playlist item, item', item);
    this.room?.send(Message.ADD_PLAYLIST_ITEM, { item })
  }

  deletePlaylistItem(itemIndex: number) {
    console.log('Add playlist item, itemIndex', itemIndex);
    this.room?.send(Message.DELETE_PLAYLIST_ITEM, { itemIndex })
  }

  addChatMessage(content: string) {
    console.log('Add chat message, content', content);
    this.room?.send(Message.ADD_CHAT_MESSAGE, { content })
  }

  nextPlay(){
    this.room?.send(Message.NEXT_PLAY);
  }
}
