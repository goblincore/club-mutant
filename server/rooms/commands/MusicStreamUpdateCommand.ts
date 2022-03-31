import { Command } from '@colyseus/command'
import { Client } from 'colyseus'

import { IOfficeState, IPlaylistItem } from '../../../types/IOfficeState'
import { Message } from '../../../types/Messages'

type Payload = {
  item: IPlaylistItem
}

export class MusicStreamNextCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    console.log("//////////////////////MusicStreamNextCommand, data", data)
    this.clock.clear()
    const musicStream = this.room.state.musicStream
    const musicBooths = this.room.state.musicBooths
    console.log('currentMusicstream', musicStream);
    musicStream.status = 'seeking'
    musicStream.currentLink = null
    // seeking the next link
    let startIndex: number = 0
    if (musicBooths.length > 1 && musicStream.currentBooth < musicBooths.length - 1) {
      startIndex = musicStream.currentBooth + 1
    }

       // if no other players and not playing
       if (data?.item) {
        for (let i = 0; i < startIndex; i++) {
          const musicBooth = musicBooths[i]
          if (musicBooth.connectedUser !== null) {
            const player = this.room.state.players.get(musicBooth.connectedUser)
            console.log('player curreny playlistitem', player.currentPlaylistItem);
            if (player.currentPlaylistItem?.link) {
              musicStream.status = 'playing'
              musicStream.currentLink = data.item.link
              musicStream.currentBooth = i
              musicStream.startTime = new Date().getTime()
              musicStream.duration =  data.item.duration
              console.log("//////////////////////MusicStreamNextCommand, musicStream.currentLink", musicStream.currentLink)
              this.room.broadcast(
                Message.START_MUSIC_STREAM,
                { musicStream: musicStream, offset: 0 },
              )
              this.clock.setTimeout(() => {
                this.room.clients.forEach((client) => {
                  if (client.sessionId === musicBooth.connectedUser) {
                    client.send(Message.SYNC_MUSIC_STREAM, {})
                  }
                })
              }, musicStream.duration * 1000);
            }
          }
        }
      }

    // Check other booths to see if there is a connected user, if so set the link
    
    // for (let i = startIndex; i < musicBooths.length; i++) {
    //   const musicBooth = musicBooths[i]
    //   if (musicBooth.connectedUser !== null) {
    //     const player = this.room.state.players.get(musicBooth.connectedUser)
    //     if (player.currentPlaylistItem.link) {
    //       musicStream.status = 'playing'
    //       musicStream.currentLink = player.currentPlaylistItem.link
    //       musicStream.currentBooth = i
    //       musicStream.startTime = new Date().getTime()
    //       musicStream.duration = player.currentPlaylistItem.duration
    //       console.log("//////////////////////MusicStreamNextCommand, musicStream.currentLink", musicStream.currentLink)
    //       this.room.broadcast(
    //         Message.START_MUSIC_STREAM,
    //         { musicStream: musicStream },
    //       )
    //       this.clock.setTimeout(() => {
    //         this.room.clients.forEach((client) => {
    //           if (client.sessionId === musicBooth.connectedUser) {
    //             client.send(Message.SYNC_MUSIC_STREAM, {})
    //           }
    //         })
    //       }, musicStream.duration * 1000);
    //     }
    //   }
    // }
 
    console.log("//////////////////////MusicStreamNextCommand, musicStream.status", musicStream.status)
    // else stop music stream, broadcast message to room
    if (musicStream.status !== 'playing') {
      musicStream.status = 'waiting'
      this.room.broadcast(
        Message.STOP_MUSIC_STREAM,
        {},
      )
      console.log("//////////////////////MusicStreamNextCommand, broadcast, STOP_MUSIC_STREAM")
    }
  }
}
