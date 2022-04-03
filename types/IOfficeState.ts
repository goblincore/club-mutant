import { Schema, ArraySchema, SetSchema, MapSchema } from '@colyseus/schema'
import Queue from "../server/Queue"

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
  name: string
  sessionId: string
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
  title: string
  link: string
  duration: number
}

export interface IMusicStream extends Schema {
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
  musicBoothQueue: ArraySchema<IMusicBooth>
  chatMessages: ArraySchema<IChatMessage>
  musicStream: IMusicStream
  nextStream: IMusicStream
}
