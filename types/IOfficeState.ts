import { Schema, ArraySchema, MapSchema } from '@colyseus/schema'
import { Room } from 'colyseus'

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
  connectedUser: string
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
  link: string
  thumb?: string
  type?: string
  duration: number
}

export type PlaylistItem = {
  id: string
  djId: string
  title: string
  link: string
  thumb?: string
  type?: string
  duration: number
}

export interface IMusicStream extends Room {
  status: string // waiting or seeking or playing
  currentLink: string
  currentTitle: string
  currentDj: IDJUserInfo
  currentBooth: number
  startTime: number
  duration: number
}

export interface IOfficeState extends Schema {
  players: MapSchema<IPlayer>
  musicBooths: ArraySchema<IMusicBooth>
  musicBoothQueue: ArraySchema<number>
  chatMessages: ArraySchema<IChatMessage>
  musicStream: IMusicStream
  nextStream: IMusicStream
}
