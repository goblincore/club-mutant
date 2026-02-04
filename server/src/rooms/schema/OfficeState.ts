import { Schema, ArraySchema, MapSchema, type } from '@colyseus/schema'
import { TEXTURE_IDS, packDirectionalAnimId } from '@club-mutant/types/AnimationCodec'

export class PlaylistItem extends Schema {
  @type('string') id = ''
  @type('string') djId = ''
  @type('string') title = ''
  @type('string') link: string | null = null
  @type('number') duration = 0
  @type('string') visualUrl: string | null = null
  @type('string') trackMessage: string | null = null
}

export class RoomPlaylistItem extends Schema {
  @type('string') id = ''
  @type('string') title = ''
  @type('string') link = ''
  @type('number') duration = 0
  @type('number') addedAtMs = 0
  @type('string') addedBySessionId = ''
}

export class Player extends Schema {
  @type('string') id: string | null = null
  @type('string') djId: string | null = null
  @type('string') name = ''
  @type('float32') x = 705
  @type('float32') y = 500
  @type('uint8') textureId: number = TEXTURE_IDS.mutant
  @type('uint8') animId: number = packDirectionalAnimId('idle', 'down')
  @type('boolean') readyToConnect = false
  @type('boolean') videoConnected = false
  @type(PlaylistItem) currentPlaylistItem = new PlaylistItem()
  @type(PlaylistItem) nextPlaylistItem = new PlaylistItem()
  @type([PlaylistItem]) nextTwoPlaylist = new ArraySchema<PlaylistItem>()
}

export class ChatMessage extends Schema {
  @type('string') author = ''
  @type('number') createdAt = new Date().getTime()
  @type('string') content = ''
}

export class DJUserInfo extends Schema {
  @type('string') name = ''
  @type('string') sessionId = ''
}

export class MusicStream extends Schema {
  @type('string') status = 'waiting' // waiting or seeking or playing
  @type('number') streamId = 0
  @type('string') currentLink: string | null = null
  @type('string') currentTitle: string | null = null
  @type('string') currentVisualUrl: string | null = null
  @type('string') currentTrackMessage: string | null = null
  @type('number') currentBooth = 0
  @type(DJUserInfo) currentDj = new DJUserInfo()
  @type('number') startTime = Date.now()
  @type('number') duration = 0
  @type('boolean') isRoomPlaylist = false
  @type('number') roomPlaylistIndex = 0
  @type('boolean') videoBackgroundEnabled = false
  @type('boolean') isAmbient = false
}

export class MusicBooth extends Schema {
  @type('string') connectedUser: string | null = null
}

export class OfficeState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>()
  @type([MusicBooth]) musicBooths = new ArraySchema<MusicBooth>()
  @type(['number']) musicBoothQueue = new ArraySchema<number>()
  @type([ChatMessage]) chatMessages = new ArraySchema<ChatMessage>()
  @type(MusicStream) musicStream = new MusicStream()
  @type(MusicStream) nextStream = new MusicStream()
  @type([RoomPlaylistItem]) roomPlaylist = new ArraySchema<RoomPlaylistItem>()
}

// const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
// const charactersLength = characters.length

// function getRoomId() {
//   let result = ''
//   for (let i = 0; i < 12; i++) {
//     result += characters.charAt(Math.floor(Math.random() * charactersLength))
//   }
// }
