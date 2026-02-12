import { Schema, ArraySchema, MapSchema, type } from '@colyseus/schema'
import { TEXTURE_IDS, packDirectionalAnimId } from '@club-mutant/types/AnimationCodec'

// Per-player room queue playlist item for DJ rotation (server-only, not synced to clients)
export class RoomQueuePlaylistItem {
  id = ''
  title = ''
  link = ''
  duration = 0
  addedAtMs = 0
  played = false
}

// NEW: DJ Queue Entry for tracking rotation
export class DJQueueEntry extends Schema {
  @type('string') sessionId = ''
  @type('string') name = ''
  @type('number') joinedAtMs = 0
  @type('number') queuePosition = 0 // Visual position (0 = current DJ)
}

export class Player extends Schema {
  @type('string') id: string | null = null
  @type('string') djId: string | null = null
  @type('string') name = ''
  @type('float32') x = 705
  @type('float32') y = 500
  @type('uint8') textureId: number = TEXTURE_IDS.mutant
  @type('uint8') animId: number = packDirectionalAnimId('idle', 'down')
  @type('uint8') scale = 100 // Scale where 100 = 1.0x, 50 = 0.5x, etc.
  @type('boolean') readyToConnect = false
  roomQueuePlaylist: RoomQueuePlaylistItem[] = [] // Server-only, not synced (clients use targeted messages)
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
  @type('boolean') isAmbient = false
}

export class MusicBooth extends Schema {
  @type(['string']) connectedUsers = new ArraySchema<string>('', '', '', '')
}

export class OfficeState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>()
  @type([MusicBooth]) musicBooths = new ArraySchema<MusicBooth>()
  @type([ChatMessage]) chatMessages = new ArraySchema<ChatMessage>()
  @type(MusicStream) musicStream = new MusicStream()
  @type([DJQueueEntry]) djQueue = new ArraySchema<DJQueueEntry>()
  @type('string') currentDjSessionId: string | null = null
}

// const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
// const charactersLength = characters.length

// function getRoomId() {
//   let result = ''
//   for (let i = 0; i < 12; i++) {
//     result += characters.charAt(Math.floor(Math.random() * charactersLength))
//   }
// }
