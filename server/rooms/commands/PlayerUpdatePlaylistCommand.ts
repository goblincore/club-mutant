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

// Method to implement enqueue operation
export class PlayerPlaylistEnqueueCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, item } = data
    const player = this.room.state.players.get(client.sessionId)
    const newItem = new PlaylistItem()
    newItem.title = item.title
    newItem.link = item.link
    newItem.duration = item.duration
    console.log('ENQUEUE COMMAND')
    player.playlistQueue.enqueue(newItem)
  }
}

export class PlayerPlaylistDequeueCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client } = data
    const player = this.room.state.players.get(client.sessionId)

    console.log('DEQUEUE COMMAND')
    player.playlistQueue.dequeue()
  }
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

export class PlayerAddItemToPlaylistCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, item } = data
    console.log('///////////////////////PlayerAddItemToPlaylistCommand, item', item)
    const player = this.room.state.players.get(client.sessionId)

    const newItem = new PlaylistItem()
    newItem.title = item.title
    newItem.link = item.link
    newItem.duration = item.duration
    console.log('///////////////////////PlayerAddItemToPlaylistCommand, player', player)
    console.log(
      '///////////////////////PlayerAddItemToPlaylistCommand, player.playlistItems',
      player.playlistItems
    )
    player.playlistItems.push(newItem)
    console.log(
      '///////////////////////PlayerAddItemToPlaylistCommand, player.playlistItems.pushed'
    )
  }
}

export class PlayerRemoveItemFromPlaylistCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, index } = data
    const player = this.room.state.players.get(client.sessionId)
    player.playlistItems.slice(index, 1)
  }
}

export class PlayerUnshiftPlaylistCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const connectedUser =
      this.room.state.musicBooths[this.room.state.musicStream.currentBooth].connectedUser

    const player = this.room.state.players.get(connectedUser)
    player.playlistItems.unshift()
  }
}
