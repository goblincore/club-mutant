import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { IOfficeState, IPlaylistItem } from '../../../types/IOfficeState'
import { PlaylistItem } from '../schema/OfficeState'

type Payload = {
  client?: Client
  index?: number
  item?: IPlaylistItem
}

export class PlayerAddItemToPlaylistCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, item } = data
    console.log("///////////////PlayerAddItemToPlaylistCommand, item", item)
    const player = this.room.state.players.get(client.sessionId)
    
    const newItem = new PlaylistItem()
    newItem.title = item.title
    newItem.link = item.link
    newItem.duration = item.duration
    console.log("///////////////PlayerAddItemToPlaylistCommand, player", player)
    console.log("///////////////PlayerAddItemToPlaylistCommand, player.playlistItems", player.playlistItems)
    player.playlistItems.push(newItem)
    console.log("///////////////PlayerAddItemToPlaylistCommand, player.playlistItems.pushed")
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
    const connectedUser = this.room.state.musicBooths[this.room.state.musicStream.currentBooth].connectedUser
    
    const player = this.room.state.players.get(connectedUser)
    player.playlistItems.unshift()
  }
}
