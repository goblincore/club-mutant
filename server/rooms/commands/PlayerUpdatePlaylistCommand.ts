import { Command } from '@colyseus/command'
import { Client, Room } from 'colyseus'
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
    const player = this.state.players.get(client.sessionId)

    console.log('//Player sync next two playlist', items)

    player.nextTwoPlaylist = items?.map(item => {
      const newItem = new PlaylistItem()
      newItem.title = item.title
      newItem.link = item.link
      newItem.id = item.id
      newItem.djId = client.sessionId
      newItem.duration = item.duration
      return newItem
    })
  
  }
}

export class PlayerSetCurrentPlaylistItemCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, item } = data
    console.log('///////////////////////PlayerSetCurrentPlaylistItemCommand, item', item)
    const player = this.state.players.get(client.sessionId)
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
    const player = this.state.players.get(client.sessionId)
    const newItem = new PlaylistItem()
    newItem.title = item.title
    newItem.link = item.link
    newItem.duration = item.duration
    player.nextPlaylistItem = newItem
  }
}


