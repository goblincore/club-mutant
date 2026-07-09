import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { v4 as uuidv4 } from 'uuid'
import type { ClubMutant } from '../ClubMutant'
import { RoomQueuePlaylistItem } from '@club-mutant/types/RoomState'
import { Message } from '@club-mutant/types/Messages'
import { prefetchVideo } from '../../youtubeService'
import { playTrackForCurrentDJ, clampTrackDuration } from './djHelpers'

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
    // F14: this value later drives the track watchdog — never trust it raw
    playlistItem.duration = clampTrackDuration(item.duration)
    playlistItem.addedAtMs = Date.now()
    playlistItem.played = false

    // Insert strategy: New tracks go after currently playing (if playing), otherwise at top.
    // F7: locate the playing track by id — it is not necessarily index 0.
    const playingIndex =
      this.state.currentDjSessionId === client.sessionId &&
      this.state.musicStream.status === 'playing'
        ? player.roomQueuePlaylist.findIndex(
            (t) => t.id === this.state.musicStream.currentTrackId
          )
        : -1

    if (playingIndex >= 0) {
      // Insert right after the currently playing track
      player.roomQueuePlaylist.splice(playingIndex + 1, 0, playlistItem)
    } else {
      // Insert at the top
      player.roomQueuePlaylist.unshift(playlistItem)
    }

    console.log('[RoomQueuePlaylist] Added:', item.title, 'for:', client.sessionId)

    // Pre-fetch video to cache it before playback
    prefetchVideo(item.link)

    // If no current DJ, promote this player so they can press play
    if (!this.state.currentDjSessionId) {
      this.state.currentDjSessionId = client.sessionId
      console.log('[RoomQueuePlaylist] No current DJ, promoted:', client.sessionId)

      this.room.broadcast(Message.DJ_QUEUE_UPDATED, {
        djQueue: this.state.djQueue.toArray(),
        currentDjSessionId: this.state.currentDjSessionId,
      })
    }

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

    // Don't allow removing the currently playing track (F7: match by id —
    // the playing track is not necessarily index 0)
    if (
      this.state.currentDjSessionId === client.sessionId &&
      this.state.musicStream.status === 'playing' &&
      player.roomQueuePlaylist[index]?.id === this.state.musicStream.currentTrackId
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

    // Don't allow moving the currently playing track (F7: match by id — the
    // playing track is not necessarily index 0). Moving OTHER tracks past it
    // is safe now that played-marking targets ids instead of positions.
    if (
      this.state.currentDjSessionId === client.sessionId &&
      this.state.musicStream.status === 'playing'
    ) {
      const movedItem = player.roomQueuePlaylist[fromIndex]
      if (movedItem && movedItem.id === this.state.musicStream.currentTrackId) {
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
