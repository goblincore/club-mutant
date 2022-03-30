import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { IOfficeState, IPlaylistItem } from '../../../types/IOfficeState'
import { PlaylistItem } from '../schema/OfficeState'

type Payload = {
  client?: Client
  index?: number
  item?: IPlaylistItem
}

// Method to implement enqueue operation
export class PlayerPlaylistEnqueueCommand extends Command<IOfficeState, Payload> {
  execute(data:Payload) {
    const { client, item } = data
    const player = this.room.state.players.get(client.sessionId)
    const stack2 = player.playlistStack2;
    console.log('playerplayliststack2', stack2?.length);
      // if dequeue was called before actual
      // enqueue operation
      if (player.playlistStack2.length > 0) {
          let len = player.playlistStack2.length;
          for (let i = 0; i < len; i++) {
              let p = player.playlistStack2.pop();
              player.playlistItems.push(p);
          }
      }
      const newItem = new PlaylistItem()
      newItem.title = item.title
      newItem.link = item.link
      newItem.duration = item.duration

      player.playlistItems.push(newItem);
      console.log("Elements after Enqueue: ", player.playlistItems);
  }
}


export class PlayerPlaylistDequeueCommand extends Command<IOfficeState, Payload> {
  execute(data:Payload) {
    const { client } = data
    const player = this.room.state.players.get(client.sessionId)

    console.log('DEQUEUE COMMAND');

      // If dequeue was called consecutively, all
     // the elements would be in stack2
      if ( player.playlistStack2.length > 0) {
          player.playlistStack2.pop();
      // If enqueue was called right before
      // this dequeue, stack2 is empty
      } else if ( player.playlistStack2.length === 0) {
          if (player.playlistItems.length === 0) {
              // If the first operation is
              // dequeue itself
              console.log("Queue is empty");
          } else if (player.playlistItems.length === 1) {
              // If a single operation as
              // enqueue was performed
              player.playlistItems.pop();
            // If enqueue was called before this
            // operation, all the elements are in
            // stack1, so pop them and push the 
            // elements into stack2,  then pop()
          } else if (player.playlistItems.length > 0) {
              let len = player.playlistItems.length;
              for (let i = 0; i < len; i++) {
                  let p = player.playlistItems.pop();
                  player.playlistStack2.push(p);
              }
              // Element after dequeue
              player.playlistStack2.pop(); // would be nice to be able to return this?
               // playerplaylistItems is now empty
               // all items are in playlistStack2 but reversed
          }
      }
  }
}


export class PlayerAddItemToPlaylistCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, item } = data
    console.log("///////////////////////PlayerAddItemToPlaylistCommand, item", item)
    const player = this.room.state.players.get(client.sessionId)
    
    const newItem = new PlaylistItem()
    newItem.title = item.title
    newItem.link = item.link
    newItem.duration = item.duration
    console.log("///////////////////////PlayerAddItemToPlaylistCommand, player", player)
    console.log("///////////////////////PlayerAddItemToPlaylistCommand, player.playlistItems", player.playlistItems)
    player.playlistItems.push(newItem)
    console.log("///////////////////////PlayerAddItemToPlaylistCommand, player.playlistItems.pushed")
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
