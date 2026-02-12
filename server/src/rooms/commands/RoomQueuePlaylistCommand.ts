import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { v4 as uuidv4 } from 'uuid'
import type { ClubMutant } from '../ClubMutant'
import { RoomQueuePlaylistItem } from '../schema/OfficeState'
import { Message } from '@club-mutant/types/Messages'
import { prefetchVideo } from '../../youtubeService'
import { playTrackForCurrentDJ } from './djHelpers'

type AddPayload = {
  client: Client
  item: {
    title: string
    link: string
    duration: number
  }
}

type RemovePayload = {
  client: Client
  itemId: string
}

type ReorderPayload = {
  client: Client
  fromIndex: number
  toIndex: number
}

export class RoomQueuePlaylistAddCommand extends Command<ClubMutant, AddPayload> {
  execute(data: AddPayload) {
    const { client, item } = data
    const player = this.state.players.get(client.sessionId)
    if (!player) return

    // Only allow if player is in DJ queue
    const inQueue = this.state.djQueue.some((e) => e.sessionId === client.sessionId)
    if (!inQueue) {
      console.log('[RoomQueuePlaylist] Add rejected - not in DJ queue:', client.sessionId)
      return
    }

    const playlistItem = new RoomQueuePlaylistItem()
    playlistItem.id = uuidv4()
    playlistItem.title = item.title
    playlistItem.link = item.link
    playlistItem.duration = item.duration
    playlistItem.addedAtMs = Date.now()
    playlistItem.played = false

    // Insert strategy: New tracks go after currently playing (if playing), otherwise at top
    const isCurrentlyPlaying =
      this.state.currentDjSessionId === client.sessionId &&
      this.state.musicStream.status === 'playing' &&
      player.roomQueuePlaylist.length > 0

    if (isCurrentlyPlaying) {
      // Insert at index 1 (right after currently playing track)
      player.roomQueuePlaylist.splice(1, 0, playlistItem)
    } else {
      // Insert at the top
      player.roomQueuePlaylist.unshift(playlistItem)
    }

    console.log('[RoomQueuePlaylist] Added:', item.title, 'for:', client.sessionId)

    // Pre-fetch video to cache it before playback
    prefetchVideo(item.link)

    // Playback is now explicit — current DJ must press play (DJ_PLAY message)

    // Notify client of update
    client.send(Message.ROOM_QUEUE_PLAYLIST_UPDATED, {
      items: [...player.roomQueuePlaylist],
    })
  }
}

export class RoomQueuePlaylistRemoveCommand extends Command<ClubMutant, RemovePayload> {
  execute(data: RemovePayload) {
    const { client, itemId } = data
    const player = this.state.players.get(client.sessionId)
    if (!player) return

    const index = player.roomQueuePlaylist.findIndex((i) => i.id === itemId)
    if (index < 0) return

    // Don't allow removing currently playing track
    if (
      this.state.currentDjSessionId === client.sessionId &&
      index === 0 &&
      this.state.musicStream.status === 'playing'
    ) {
      console.log('[RoomQueuePlaylist] Remove rejected - cannot remove currently playing track')
      return
    }

    const removed = player.roomQueuePlaylist.splice(index, 1)
    console.log('[RoomQueuePlaylist] Removed:', removed[0]?.title, 'for:', client.sessionId)

    // Notify client of update
    client.send(Message.ROOM_QUEUE_PLAYLIST_UPDATED, {
      items: [...player.roomQueuePlaylist],
    })
  }
}

export class RoomQueuePlaylistReorderCommand extends Command<ClubMutant, ReorderPayload> {
  execute(data: ReorderPayload) {
    const { client, fromIndex, toIndex } = data
    const player = this.state.players.get(client.sessionId)
    if (!player) return

    if (fromIndex === toIndex) return
    if (fromIndex < 0 || toIndex < 0) return
    if (fromIndex >= player.roomQueuePlaylist.length) return
    if (toIndex >= player.roomQueuePlaylist.length) return

    // Don't allow reordering currently playing track
    if (
      this.state.currentDjSessionId === client.sessionId &&
      this.state.musicStream.status === 'playing'
    ) {
      if (fromIndex === 0 || toIndex === 0) {
        console.log('[RoomQueuePlaylist] Reorder rejected - cannot move currently playing track')
        return
      }
    }

    const [item] = player.roomQueuePlaylist.splice(fromIndex, 1)

    if (item) {
      player.roomQueuePlaylist.splice(toIndex, 0, item)
      console.log(
        '[RoomQueuePlaylist] Reordered: moved from',
        fromIndex,
        'to',
        toIndex,
        'for:',
        client.sessionId
      )
    }

    // Notify client of update
    client.send(Message.ROOM_QUEUE_PLAYLIST_UPDATED, {
      items: [...player.roomQueuePlaylist],
    })
  }
}
