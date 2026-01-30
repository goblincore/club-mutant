import { Command } from '@colyseus/command'

import { Client } from 'colyseus'
import { PlaylistItem, DJUserInfo } from '../schema/OfficeState'
import type { ClubMutant } from '../ClubMutant'
import { Message } from '../../../types/Messages'
import type { PlaylistItemDto } from '../../../types/Dtos'

type Payload = {
  client?: Client
  item?: PlaylistItemDto
}

export class MusicStreamNextCommand extends Command<ClubMutant, Payload | undefined> {
  execute(data: Payload | undefined) {
    console.log('////MusicStreamNextCommand, Payload, data', data)
    this.clock.clear()
    const musicStream = this.state.musicStream
    const musicBooths = this.state.musicBooths
    musicStream.status = 'seeking'
    musicStream.currentLink = null
    console.log('////MusicStreamNextCommand, musicStream.currentBooth', musicStream.currentBooth)

    const musicBoothIndex = 0
    const djSessionId = musicBooths[musicBoothIndex]?.connectedUser

    if (!djSessionId) {
      musicStream.status = 'waiting'
      musicStream.currentLink = null
      this.room.broadcast(Message.STOP_MUSIC_STREAM, {})
      console.log('////MusicStreamNextCommand, no DJ connected -> STOP_MUSIC_STREAM')
      return
    }

    const player = this.state.players.get(djSessionId)
    if (!player) {
      musicStream.status = 'waiting'
      musicStream.currentLink = null
      this.room.broadcast(Message.STOP_MUSIC_STREAM, {})
      console.log('////MusicStreamNextCommand, DJ not in players map -> STOP_MUSIC_STREAM')
      return
    }

    if (data?.item?.link && data.item.djId === djSessionId) {
      const existing = player.nextTwoPlaylist[0]
      if (!existing || existing.id !== data.item.id) {
        const newItem = new PlaylistItem()
        newItem.title = data.item.title
        newItem.link = data.item.link
        newItem.id = data.item.id
        newItem.djId = data.item.djId
        newItem.duration = data.item.duration
        newItem.visualUrl = data.item.visualUrl ?? null
        newItem.trackMessage = data.item.trackMessage ?? null

        if (player.nextTwoPlaylist.length === 0) {
          player.nextTwoPlaylist.push(newItem)
        } else {
          player.nextTwoPlaylist.splice(0, 1, newItem)
        }
      }
    }

    if (player.nextTwoPlaylist.length > 0) {
      const playbackItem = player.nextTwoPlaylist[0]
      const djInfo = new DJUserInfo()
      djInfo.name = player.name
      djInfo.sessionId = playbackItem.djId

      musicStream.status = 'playing'
      musicStream.streamId += 1
      musicStream.currentLink = playbackItem.link
      musicStream.currentBooth = musicBoothIndex
      musicStream.currentDj = djInfo
      musicStream.currentTitle = playbackItem.title
      musicStream.currentVisualUrl = playbackItem.visualUrl ?? null
      musicStream.currentTrackMessage = playbackItem.trackMessage ?? null
      musicStream.startTime = Date.now()
      musicStream.duration = playbackItem.duration

      player.nextTwoPlaylist.shift()

      this.room.broadcast(Message.START_MUSIC_STREAM, { musicStream: musicStream, offset: 0 })
    }
    console.log('////MusicStreamNextCommand, musicStream.status', musicStream.status)

    if (musicStream.status !== 'playing') {
      musicStream.status = 'waiting'
      this.room.broadcast(Message.STOP_MUSIC_STREAM, {})
      console.log('////MusicStreamNextCommand, broadcast, STOP_MUSIC_STREAM')
    }
  }
}
