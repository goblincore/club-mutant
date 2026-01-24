import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import type { SkyOffice } from '../SkyOffice'
import { IPlaylistItem } from '../../../types/IOfficeState'
import { PlaylistItem } from '../schema/OfficeState'

type Payload = {
  client?: Client
  index?: number
  item?: IPlaylistItem
  items?: IPlaylistItem[]
}

export class PlayerSyncShortPlaylist extends Command<SkyOffice, Payload> {
  execute(data: Payload) {
    const { client, items } = data

    if (!client || !items) return

    const player = this.state.players.get(client.sessionId)
    if (!player) return

    console.log('//Player sync next two playlist command', items, 'client', client.sessionId)

    items.forEach((item) => {
      const newItem = new PlaylistItem()
      newItem.title = item.title
      newItem.link = item.link
      newItem.id = item.id
      newItem.djId = client.sessionId
      newItem.duration = item.duration
      player.nextTwoPlaylist.push(newItem)
    })
  }
}

export class PlayerSetCurrentPlaylistItemCommand extends Command<SkyOffice, Payload> {
  execute(data: Payload) {
    const { client, item } = data

    if (!client || !item) return

    const player = this.state.players.get(client.sessionId)
    if (!player) return

    const newItem = new PlaylistItem()
    newItem.title = item.title
    newItem.link = item.link
    newItem.duration = item.duration
    player.currentPlaylistItem = newItem
  }
}

export class PlayerSetNextPlaylistItemCommand extends Command<SkyOffice, Payload> {
  execute(data: Payload) {
    const { client, item } = data
    console.log('////PlayerSetNextPlaylistItemCommand, item', item)

    if (!client || !item) return

    const player = this.state.players.get(client.sessionId)
    if (!player) return

    const newItem = new PlaylistItem()
    newItem.title = item.title
    newItem.link = item.link
    newItem.duration = item.duration
    player.nextPlaylistItem = newItem
  }
}
