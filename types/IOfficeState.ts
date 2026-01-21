import { Schema, ArraySchema, MapSchema } from '@colyseus/schema'

export interface IPlayer extends Schema {
  name: string
  x: number
  y: number
  anim: string
  readyToConnect: boolean
  videoConnected: boolean
  currentPlaylistItem: IPlaylistItem
  nextPlaylistItem: IPlaylistItem
  nextTwoPlaylist: ArraySchema<IPlaylistItem>
}

export interface IDJUserInfo extends Schema {
  name: string | null
  sessionId: string | null
}

export interface IMusicBooth extends Schema {
  connectedUser: string | null
}

export interface IChatMessage extends Schema {
  author: string
  createdAt: number
  content: string
}

export interface IPlaylistItem extends Schema {
  id: string
  djId: string
  title: string
  link: string | null
  thumb?: string
  type?: string
  duration: number
}

export interface IRoomPlaylistItem extends Schema {
  id: string
  title: string
  link: string
  duration: number
  addedAtMs: number
  addedBySessionId: string
}

export type PlaylistItem = {
  id: string
  djId: string
  title: string
  link: string | null
  thumb?: string
  type?: string
  duration: number
}

export interface IMusicStream extends Schema {
  status: string // waiting or seeking or playing
  currentLink: string | null
  currentTitle: string | null
  currentDj: IDJUserInfo
  currentBooth: number
  startTime: number
  duration: number
  isRoomPlaylist: boolean
  roomPlaylistIndex: number
}

export interface IOfficeState extends Schema {
  players: MapSchema<IPlayer>
  musicBooths: ArraySchema<IMusicBooth>
  musicBoothQueue: ArraySchema<number>
  chatMessages: ArraySchema<IChatMessage>
  musicStream: IMusicStream
  nextStream: IMusicStream
  roomPlaylist: ArraySchema<IRoomPlaylistItem>
}
