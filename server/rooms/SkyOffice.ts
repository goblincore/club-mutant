import bcrypt from 'bcrypt'
import { Room, Client, ServerError } from 'colyseus'
import { Dispatcher } from '@colyseus/command'

import { Player, OfficeState, MusicBooth, PlaylistItem } from './schema/OfficeState'
import { IRoomData } from '../../types/Rooms'
import { Message } from '../../types/Messages'

import PlayerUpdateActionCommand from './commands/PlayerUpdateActionCommand'
import PlayerUpdateNameCommand from './commands/PlayerUpdateNameCommand'
import {
  PlayerSetCurrentPlaylistItemCommand,
  PlayerSetNextPlaylistItemCommand,
  PlayerSyncShortPlaylist,
} from './commands/PlayerUpdatePlaylistCommand'

import {
  MusicBoothConnectUserCommand,
  MusicBoothDisconnectUserCommand,
} from './commands/MusicBoothUpdateCommand'

import { MusicStreamNextCommand } from './commands/MusicStreamUpdateCommand'

import ChatMessageUpdateCommand from './commands/ChatMessageUpdateCommand'

export class SkyOffice extends Room<OfficeState> {
  private dispatcher = new Dispatcher(this)
  private name: string
  private description: string
  private password: string | null = null

  async onCreate(options: IRoomData) {
    const { name, description, password, autoDispose } = options
    this.name = name
    this.description = description
    this.autoDispose = autoDispose

    let hasPassword = false
    if (password) {
      const salt = await bcrypt.genSalt(10)
      this.password = await bcrypt.hash(password, salt)
      hasPassword = true
    }
    this.setMetadata({ name, description, hasPassword })

    this.setState(new OfficeState())

    // add 3 musicbooths in a room
    for (let i = 0; i < 3; i++) {
      this.state.musicBooths.push(new MusicBooth())
    }

    // when a player starts playing a song
    this.onMessage(Message.SYNC_MUSIC_STREAM, (client, message: { item?: PlaylistItem }) => {
      // Dequeue
      // this.dispatcher.dispatch(new PlayerPlaylistDequeueCommand(), {client})
      console.log('///ON MESSSAGE SYNYC MUSIC STREAM', message?.item)
      console.log('///ON MESSSAGE SYNC USER PLAYLIST QUEUE', message?.item)
      // this is not ideal, would like to take the popped item and call enqueue with it?
      // const musicStream = this.state.musicStream;
      // const item = new PlaylistItem()
      // item.title = musicStream.currentLink
      // item.link = musicStream.currentLink
      // item.duration = musicStream.duration
      // this.dispatcher.dispatch(new PlayerPlaylistEnqueueCommand(), {client, item })
     
      this.dispatcher.dispatch(new MusicStreamNextCommand(), { client, item: message?.item })
    })

    // when a player connects to a music booth
    this.onMessage(
      Message.CONNECT_TO_MUSIC_BOOTH,
      (client, message: { musicBoothIndex: number }) => {
        console.log('/////onMessage, CONNECT_TO_USER_BOOth client sesiondId', client.sessionId)
        console.log(
          '///////////////////////onMessage, CONNECT_TO_MUSIC_BOOTH, message.musicBoothIndex',
          message.musicBoothIndex
        )
        this.dispatcher.dispatch(new MusicBoothConnectUserCommand(), {
          client,
          musicBoothIndex: message.musicBoothIndex,
        })

        this.state.musicBoothQueue.push(this.state.musicBooths[message.musicBoothIndex])
       
        console.log('///////connectToMusicBooth client', client.sessionId)
        console.log(
          '///////////////////////onMessage, CONNECT_TO_MUSIC_BOOTH, musicStream.status',
          this.state.musicStream.status
        )
        if ((this.state.musicStream.status === 'waiting' || this.state.musicStream.status === 'seeking')) {
          console.log('////////MUSIC STREAM NEXT COMMAND INVOKE')
          const player = this.state.players.get(client.sessionId)
          // console.log('////GET PLAYER', player);

          // const currentItem = player.nextTwoPlaylist.shift();

          // console.log('///currentItem title', currentItem.title);
          this.dispatcher.dispatch(new MusicStreamNextCommand(), {})
        }
      }
    )

    // when a player disconnects from a music booth, remove the user to the musicBooth connectedUser array
    this.onMessage(
      Message.DISCONNECT_FROM_MUSIC_BOOTH,
      (client, message: { musicBoothIndex: number }) => {
        this.dispatcher.dispatch(new MusicBoothDisconnectUserCommand(), {
          client,
          musicBoothIndex: message.musicBoothIndex,
        })
        if (this.state.musicStream.currentBooth === message.musicBoothIndex) {
          this.dispatcher.dispatch(new MusicStreamNextCommand(), {})
        }
      }
    )

    // when receiving updatePlayer message, call the PlayerUpdateActionCommand
    this.onMessage(
      Message.UPDATE_PLAYER_ACTION,
      (client, message: { x: number; y: number; anim: string }) => {
        this.dispatcher.dispatch(new PlayerUpdateActionCommand(), {
          client,
          x: message.x,
          y: message.y,
          anim: message.anim,
        })
      }
    )

    // when receiving updatePlayerName message, call the PlayerUpdateNameCommand
    this.onMessage(Message.UPDATE_PLAYER_NAME, (client, message: { name: string }) => {
      this.dispatcher.dispatch(new PlayerUpdateNameCommand(), {
        client,
        name: message.name,
      })
    })

    // when a player is ready to connect, call the PlayerReadyToConnectCommand
    this.onMessage(Message.READY_TO_CONNECT, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) player.readyToConnect = true
    })

    // when a player send a chat message, update the message array and broadcast to all connected clients except the sender
    this.onMessage(Message.ADD_CHAT_MESSAGE, (client, message: { content: string }) => {
      // update the message array (so that players join later can also see the message)
      this.dispatcher.dispatch(new ChatMessageUpdateCommand(), {
        client,
        content: message.content,
      })

      // broadcast to all currently connected clients except the sender (to render in-game dialog on top of the character)
      this.broadcast(
        Message.ADD_CHAT_MESSAGE,
        { clientId: client.sessionId, content: message.content },
        { except: client }
      )
    })

    this.onMessage(
      Message.SYNC_USER_SHORT_PLAYLIST,
      (client, message: { items: PlaylistItem[] }) => {
        console.log('/////////onMessage, SYNC USER SHORT PLAYLIST', message.items)
        this.dispatcher.dispatch(new PlayerSyncShortPlaylist(), {
          client,
          items: message.items,
        })
      }
    )

    this.onMessage(
      Message.SET_USER_NEXT_PLAYLIST_ITEM,
      (client, message: { item: PlaylistItem }) => {
        console.log('////SET NEXT USER PLAYLIST ITEM', message.item)
        this.dispatcher.dispatch(new PlayerSetNextPlaylistItemCommand(), {
          client,
          item: message.item,
        })
      }
    )

    this.onMessage(Message.SET_USER_PLAYLIST_ITEM, (client, message: { item: PlaylistItem }) => {
      console.log('////SET USER PLAYLIST ITEM', message.item)
      this.dispatcher.dispatch(new PlayerSetCurrentPlaylistItemCommand(), {
        client,
        item: message.item,
      })
    })
  }

  async onAuth(client: Client, options: { password: string | null }) {
    if (this.password) {
      const isValidPassword = await bcrypt.compare(options.password, this.password)
      if (!isValidPassword) {
        throw new ServerError(403, 'Password is incorrect!')
      }
    }
    return true
  }

  // when a new player joins, send room data
  onJoin(client: Client, options: any) {
    console.log('///////////////onJoin, client', client)
    this.state.players.set(client.sessionId, new Player())
    client.send(Message.SEND_ROOM_DATA, {
      id: this.roomId,
      name: this.name,
      description: this.description,
    })
    console.log('///////////////onJoin, Message.SEND_ROOM_DATA')

    const musicStream = this.state.musicStream
    console.log('this state musicStream', musicStream)
    if (musicStream.status === 'playing') {
      const currentTime: number = new Date().getTime()
      client.send(Message.START_MUSIC_STREAM, {
        musicStream: musicStream,
        offset: (currentTime - musicStream.startTime) / 1000,
      })
    }
    console.log('///////////////onJoin, musicStream.status', musicStream.status)
  }

  onLeave(client: Client, consented: boolean) {
    if (this.state.players.has(client.sessionId)) {
      this.state.players.delete(client.sessionId)
    }
    this.state.musicBooths.forEach((musicBooth, index) => {
      if (musicBooth.connectedUser === client.sessionId) {
        this.dispatcher.dispatch(new MusicBoothDisconnectUserCommand(), {
          client,
          musicBoothIndex: index,
        })
        if (this.state.musicStream.currentBooth === index) {
          this.dispatcher.dispatch(new MusicStreamNextCommand(), {})
        }
      }
    })
  }

  onDispose() {
    console.log('room', this.roomId, 'disposing...')
    this.dispatcher.stop()
  }
}
