import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import type { ClubMutant } from '../ClubMutant'
import { Message } from '@club-mutant/types/Messages'
import {
  advanceRotation,
  joinDjQueue,
  markTrackAsPlayed,
  playTrackForCurrentDJ,
  removeDJFromQueue,
} from './djHelpers'

// Re-exported for compatibility — the constant now lives with the queue helpers.
export { MAX_DJ_QUEUE_SIZE } from './djHelpers'

type Payload = {
  client: Client
  slotIndex?: number
}

// Thin wrappers over the djHelpers queue functions. Commands keep their
// client.send(...) UI notifications; all queue/rotation logic lives in
// djHelpers.ts so the NPC DJ manager can drive the same code paths without
// a Colyseus Client.

export class DJQueueJoinCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const { client } = data
    const player = this.state.players.get(client.sessionId)
    if (!player) return

    joinDjQueue(this.room, client.sessionId, player.name, data.slotIndex)
  }
}

export class DJQueueLeaveCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const { client } = data
    removeDJFromQueue(this.room, client.sessionId)
  }
}

export class DJSkipTurnCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const { client } = data

    // Only current DJ can skip their turn
    if (this.state.currentDjSessionId !== client.sessionId) {
      console.log('[DJQueue] Skip turn rejected - not current DJ:', client.sessionId)
      return
    }

    const player = this.state.players.get(client.sessionId)
    if (player) {
      // Mark current track as played even when skipping
      markTrackAsPlayed(player)

      // Notify client so their playlist UI updates
      client.send(Message.ROOM_QUEUE_PLAYLIST_UPDATED, {
        items: [...player.roomQueuePlaylist],
      })
    }

    console.log('[DJQueue] Current DJ skipping turn:', client.sessionId)
    advanceRotation(this.room)
  }
}

export class DJPlayCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const { client } = data

    // Only current DJ can start playback — auto-promote if no current DJ and player is in queue
    if (this.state.currentDjSessionId !== client.sessionId) {
      const inQueue = this.state.djQueue.some((e: any) => e.sessionId === client.sessionId)

      if (!this.state.currentDjSessionId && inQueue) {
        this.state.currentDjSessionId = client.sessionId
        console.log('[DJQueue] No current DJ, promoted on play:', client.sessionId)
      } else {
        console.log('[DJQueue] Play rejected - not current DJ:', client.sessionId)
        return
      }
    }

    const player = this.state.players.get(client.sessionId)
    if (!player || player.roomQueuePlaylist.length === 0) {
      console.log('[DJQueue] Play rejected - no tracks')
      return
    }

    // Don't restart if already playing
    if (this.state.musicStream.status === 'playing' && this.state.musicStream.currentLink) {
      console.log('[DJQueue] Already playing, ignoring play request')
      return
    }

    // If all tracks are played, reset them to loop through the playlist again
    const hasUnplayed = player.roomQueuePlaylist.some((t: any) => !t.played)

    if (!hasUnplayed) {
      console.log('[DJQueue] All tracks played, resetting for loop:', client.sessionId)

      for (let i = 0; i < player.roomQueuePlaylist.length; i++) {
        player.roomQueuePlaylist[i].played = false
      }
    }

    console.log('[DJQueue] Explicit play by current DJ:', client.sessionId)
    playTrackForCurrentDJ(this.room)
  }
}

export class DJStopCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const { client } = data

    // Only current DJ can stop playback
    if (this.state.currentDjSessionId !== client.sessionId) {
      console.log('[DJQueue] Stop rejected - not current DJ:', client.sessionId)
      return
    }

    // Only stop if actually playing
    if (this.state.musicStream.status !== 'playing' || !this.state.musicStream.currentLink) {
      console.log('[DJQueue] Stop rejected - not currently playing')
      return
    }

    console.log('[DJQueue] DJ stopped playback:', client.sessionId)

    const musicStream = this.state.musicStream
    musicStream.status = 'waiting'
    musicStream.currentLink = null
    musicStream.currentTitle = null

    this.room.broadcast(Message.STOP_MUSIC_STREAM, {})
  }
}

export class DJTurnCompleteCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const { client } = data

    // Only current DJ can complete their turn
    if (this.state.currentDjSessionId !== client.sessionId) {
      console.log('[DJQueue] Turn complete rejected - not current DJ:', client.sessionId)
      return
    }

    const player = this.state.players.get(client.sessionId)
    if (!player) {
      console.log('[DJQueue] Player not found, advancing rotation')
      advanceRotation(this.room)
      return
    }

    // Mark played track and move to bottom (keep history)
    markTrackAsPlayed(player)

    // Notify client so their playlist UI updates. The track watchdog (and any
    // NPC-related path) dispatches this command with a synthetic Client that
    // only carries a sessionId — it has no send().
    if (typeof client.send === 'function') {
      client.send(Message.ROOM_QUEUE_PLAYLIST_UPDATED, {
        items: [...player.roomQueuePlaylist],
      })
    }

    // ALWAYS advance to next DJ after playing one track
    console.log('[DJQueue] Track finished, advancing to next DJ')
    advanceRotation(this.room)
  }
}
