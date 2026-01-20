import { Command } from '@colyseus/command'

import { Client } from 'colyseus'
import { PlaylistItem, DJUserInfo } from '../schema/OfficeState'
import { IOfficeState, IPlaylistItem, IPlayer } from '../../../types/IOfficeState'
import { Message } from '../../../types/Messages'

type Payload = {
  client: Client
  item: IPlaylistItem
}

export class MusicStreamNextCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    console.log('////MusicStreamNextCommand, Payload, data', data)
    this.clock.clear()
    const musicStream = this.state.musicStream
    const musicBooths = this.state.musicBooths
    const musicBoothQueue = this.state.musicBoothQueue
    musicStream.status = 'seeking'
    musicStream.currentLink = null
    console.log('////MusicStreamNextCommand, musicStream.currentBooth', musicStream.currentBooth)

    if (!musicBoothQueue || musicBoothQueue.length === 0) {
      musicStream.status = 'waiting'
      this.room.broadcast(Message.STOP_MUSIC_STREAM, {})
      console.log('////MusicStreamNextCommand, no queued booths -> STOP_MUSIC_STREAM')
      return
    }

    // seeking the next link
    let startIndex: number = 0
    if (musicBooths.length > 1 && musicStream.currentBooth) {
      startIndex = musicStream.currentBooth
    }

    if (this.state.musicBoothQueue?.length === 1) {
      startIndex = musicBoothQueue[0]
    }
    console.log(
      '////MusicStreamNextCommand, this.state.musicBoothQueue[0]',
      this.state.musicBoothQueue[0]
    )
    const nextMusicBoothIndex = this.state.musicBoothQueue.shift()
    if (nextMusicBoothIndex === undefined || nextMusicBoothIndex === null) {
      musicStream.status = 'waiting'
      this.room.broadcast(Message.STOP_MUSIC_STREAM, {})
      console.log('////MusicStreamNextCommand, shift() returned empty -> STOP_MUSIC_STREAM')
      return
    }

    this.state.musicBoothQueue.push(nextMusicBoothIndex)

    console.log(
      '////MusicStreamNextCommand, this.state.musicBoothQueue[0]',
      this.state.musicBoothQueue[0]
    )
    console.log(
      '////MusicStreamNextCommand, musicBooths[nextMusicBoothIndex].connectedUser)',
      musicBooths[nextMusicBoothIndex].connectedUser
    )
    console.log('////MusicStreamNextCommand, startIndex', startIndex)

    let nextBoothIndex =
      this.state.musicBoothQueue?.length === 1 ? musicBoothQueue[0] : this.state.musicBoothQueue[0]

    console.log('////MusicStreamNextCommand, nextBoothIndex', nextBoothIndex)

    const queueBoothIndex = this.state.musicBoothQueue[0]
    if (queueBoothIndex === undefined || queueBoothIndex === null) {
      musicStream.status = 'waiting'
      this.room.broadcast(Message.STOP_MUSIC_STREAM, {})
      console.log('////MusicStreamNextCommand, queue empty after rotate -> STOP_MUSIC_STREAM')
      return
    }

    const musicBooth = musicBooths[queueBoothIndex]
    if (musicBooth.connectedUser !== null) {
      const player: IPlayer = this.state.players.get(musicBooth.connectedUser)

      // This is to handle a case where the player next two playlist may be not in sync / up to date
      if (
        this.state.musicBoothQueue?.length === 1 &&
        data.item &&
        data.item?.link &&
        musicBooth.connectedUser === data.item.djId
      ) {
        console.log('////MusicStreamNextCommand, data.item', data.item)
        const newItem = new PlaylistItem()
        newItem.title = data.item.title
        newItem.link = data.item.link
        newItem.id = data.item.id
        newItem.djId = data.item.djId
        newItem.duration = data.item.duration

        player.nextTwoPlaylist.setAt(0, newItem)
      }

      console.log(
        '////MusicStreamNextCommand, player.nextTwoPlaylist length',
        player.nextTwoPlaylist.length
      )

      if (player.nextTwoPlaylist.length > 0) {
        // Set room musicStream state
        const playbackItem = player.nextTwoPlaylist[0]
        const djInfo = new DJUserInfo()
        djInfo.name = player.name
        djInfo.sessionId = playbackItem.djId
        musicStream.status = 'playing'
        musicStream.currentLink = playbackItem.link
        musicStream.currentBooth = nextBoothIndex
        musicStream.currentDj = djInfo
        musicStream.currentTitle = playbackItem.title
        musicStream.startTime = Date.now()
        musicStream.duration = playbackItem.duration
        player.nextTwoPlaylist.shift()
        console.log('////MusicStreamNextCommand, musicStream.currentLink', musicStream.currentLink)
        this.room.broadcast(Message.START_MUSIC_STREAM, { musicStream: musicStream, offset: 0 })
        this.clock.setTimeout(() => {
          this.room.clients.forEach((client) => {
            if (client.sessionId === musicBooths[nextMusicBoothIndex].connectedUser) {
              // client.send(Message.SYNC_MUSIC_STREAM, {})
            }
          })
        }, musicStream.duration * 1000)
      }
    }
    console.log('////MusicStreamNextCommand, musicStream.status', musicStream.status)

    if (musicStream.status !== 'playing') {
      musicStream.status = 'waiting'
      this.room.broadcast(Message.STOP_MUSIC_STREAM, {})
      console.log('////MusicStreamNextCommand, broadcast, STOP_MUSIC_STREAM')
    }
  }
}
