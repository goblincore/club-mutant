import { Schema, ArraySchema, SetSchema, MapSchema, type } from '@colyseus/schema'
import {
  IOfficeState,
  IPlayer,
  IMusicStream,
  IMusicBooth,
  IChatMessage,
  IPlaylistItem,
} from '../../../types/IOfficeState'

export class PlaylistItem extends Schema implements IPlaylistItem {
  @type('string') title = ''
  @type('string') link = null
  @type('number') duration = 0
}

export class Player extends Schema implements IPlayer {
  @type('string') name = ''
  @type('number') x = 705
  @type('number') y = 500
  @type('string') anim = 'adam_idle_down'
  @type('boolean') readyToConnect = false
  @type('boolean') videoConnected = false
  @type(PlaylistItem) currentPlaylistItem = new PlaylistItem()
  @type([PlaylistItem])
  playlistItems = new ArraySchema<PlaylistItem>()
  @type([PlaylistItem])
  playlistStack2 = new ArraySchema<PlaylistItem>()
}

export class ChatMessage extends Schema implements IChatMessage {
  @type('string') author = ''
  @type('number') createdAt = new Date().getTime()
  @type('string') content = ''
}

export class MusicStream extends Schema implements IMusicStream {
  @type('string') status = 'waiting' // waiting or seeking or playing
  @type('string') currentLink = null
  @type('number') currentBooth = 0
  @type('number') startTime = new Date().getTime()
  @type('number') duration = 0
}

export class MusicBooth extends Schema implements IMusicBooth {
  @type('string') connectedUser = null
}

export class OfficeState extends Schema implements IOfficeState {
  @type({ map: Player })
  players = new MapSchema<Player>()

  @type([MusicBooth])
  musicBooths = new ArraySchema<MusicBooth>()

  @type([ChatMessage])
  chatMessages = new ArraySchema<ChatMessage>()

  @type(MusicStream)
  musicStream = new MusicStream()
}

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const charactersLength = characters.length

function getRoomId() {
  let result = ''
  for (let i = 0; i < 12; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
}
