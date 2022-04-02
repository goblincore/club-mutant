import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { IOfficeState, IPlaylistItem } from '../../../types/IOfficeState'
import { Player, PlaylistItem } from '../schema/OfficeState'

type Payload = {
  client?: Client
  index?: number
  item?: IPlaylistItem
  items?: IPlaylistItem[]
}


export class PlayerSyncShortPlaylist extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, items } = data
    const player = this.room.state.players.get(client.sessionId)

    console.log('//Player sync next two playlist', items)
    if (items?.length > 0) {
      const newItem = new PlaylistItem()
      const item = items?.[0]
      if (item) {
        newItem.title = item.title
        newItem.link = item.link
        newItem.duration = item.duration
        player.nextTwoPlaylist.setAt(0, newItem)
      }
    }
    if (items?.length > 1) {
      const newItem = new PlaylistItem()
      const item = items?.[1]
      if (item) {
        newItem.title = item.title
        newItem.link = item.link
        newItem.duration = item.duration
        player.nextTwoPlaylist.setAt(1, newItem)
      }
    }
  }
}

export class PlayerSetCurrentPlaylistItemCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, item } = data
    console.log('///////////////////////PlayerSetCurrentPlaylistItemCommand, item', item)
    const player = this.room.state.players.get(client.sessionId)
    const newItem = new PlaylistItem()
    newItem.title = item.title
    newItem.link = item.link
    newItem.duration = item.duration
    player.currentPlaylistItem = newItem
  }
}


export class PlayerSetNextPlaylistItemCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, item } = data
    console.log('///////////////////////PlayerSetNextPlaylistItemCommand, item', item)
    const player = this.room.state.players.get(client.sessionId)
    const newItem = new PlaylistItem()
    newItem.title = item.title
    newItem.link = item.link
    newItem.duration = item.duration
    player.nextPlaylistItem = newItem
  }
}


