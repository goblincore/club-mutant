import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import type { ClubMutant } from '../ClubMutant'
import { PlaylistItem } from '../schema/OfficeState'
import type { PlaylistItemDto } from '../../../types/Dtos'

type Payload = {
  client?: Client
  index?: number
  item?: PlaylistItemDto
  items?: PlaylistItemDto[]
}

export class PlayerSetCurrentPlaylistItemCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const { client, item } = data

    if (!client || !item) return

    const player = this.state.players.get(client.sessionId)
    if (!player) return

    const newItem = new PlaylistItem()
    newItem.title = item.title
    newItem.link = item.link
    newItem.duration = item.duration
    newItem.visualUrl = item.visualUrl ?? null
    newItem.trackMessage = item.trackMessage ?? null
    player.currentPlaylistItem = newItem
  }
}

export class PlayerSetNextPlaylistItemCommand extends Command<ClubMutant, Payload> {
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
    newItem.visualUrl = item.visualUrl ?? null
    newItem.trackMessage = item.trackMessage ?? null
    player.nextPlaylistItem = newItem
  }
}
