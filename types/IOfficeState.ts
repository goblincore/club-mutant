import { Schema, ArraySchema, MapSchema } from '@colyseus/schema'

export interface IPlayer extends Schema {
  name: string
  x: number
  y: number
  textureId: number
  animId: number
  scale: number
  readyToConnect: boolean
  roomQueuePlaylist: ArraySchema<IRoomQueuePlaylistItem>
}

export interface IDJUserInfo extends Schema {
  name: string
  sessionId: string
}

export interface IMusicBooth extends Schema {
  connectedUsers: ArraySchema<string>
}

export interface IChatMessage extends Schema {
  author: string
  createdAt: number
  content: string
}

export interface IRoomQueuePlaylistItem extends Schema {
  id: string
  title: string
  link: string
  duration: number
  addedAtMs: number
  played: boolean
}

export interface IDJQueueEntry extends Schema {
  sessionId: string
  name: string
  joinedAtMs: number
  queuePosition: number
}

export interface IMusicStream extends Schema {
  status: string // waiting or seeking or playing
  streamId: number
  currentLink: string | null
  currentTitle: string | null
  currentVisualUrl: string | null
  currentTrackMessage: string | null
  currentDj: IDJUserInfo
  currentBooth: number
  startTime: number
  duration: number
  isAmbient: boolean
}

export interface IOfficeState extends Schema {
  players: MapSchema<IPlayer>
  musicBooths: ArraySchema<IMusicBooth>
  chatMessages: ArraySchema<IChatMessage>
  musicStream: IMusicStream
  djQueue: ArraySchema<IDJQueueEntry>
  currentDjSessionId: string | null
}
