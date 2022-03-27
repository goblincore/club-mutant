import { Command } from '@colyseus/command'
import { Client } from 'colyseus'

import { IOfficeState } from '../../../types/IOfficeState'
import { Message } from '../../../types/Messages'

type Payload = {
}

export class MusicStreamNextCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    console.log("//////////////////////MusicStreamNextCommand, data", data)
    this.clock.clear()
    const musicStream = this.room.state.musicStream
    const musicBooths = this.room.state.musicBooths
    musicStream.status = 'seeking'
    musicStream.currentLink = null
    // seeking the next link
    let startIndex: number = 0
    if (musicBooths.length > 1 && musicStream.currentBooth < musicBooths.length - 1) {
      startIndex = musicStream.currentBooth + 1
    }
    for (let i = startIndex; i < musicBooths.length; i++) {
      const musicBooth = musicBooths[i]
      if (musicBooth.connectedUser !== null) {
        const player = this.room.state.players.get(musicBooth.connectedUser)
        if (player.playlistItems.length > 0) {
          musicStream.status = 'playing'
          musicStream.currentLink = player.playlistItems[0].link
          musicStream.currentBooth = i
          musicStream.startTime = new Date().getTime()
          musicStream.duration = player.playlistItems[0].duration
          console.log("//////////////////////MusicStreamNextCommand, musicStream.currentLink", musicStream.currentLink)
          this.room.broadcast(
            Message.START_MUSIC_STREAM,
            { musicStream: musicStream },
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
    if (musicStream.status !== 'playing') {
      for (let i = 0; i < startIndex; i++) {
        const musicBooth = musicBooths[i]
        if (musicBooth.connectedUser !== null) {
          const player = this.room.state.players.get(musicBooth.connectedUser)
          if (player.playlistItems.length > 0) {
            musicStream.status = 'playing'
            musicStream.currentLink = player.playlistItems[0].link
            musicStream.currentBooth = i
            musicStream.startTime = new Date().getTime()
            musicStream.duration = player.playlistItems[0].duration
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
    console.log("//////////////////////MusicStreamNextCommand, musicStream.status", musicStream.status)
    
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
