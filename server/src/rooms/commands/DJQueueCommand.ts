import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import type { ClubMutant } from '../ClubMutant'
import {
  advanceRotation,
  hasUnplayedTracks,
  joinDjQueue,
  markTrackAsPlayed,
  playTrackForCurrentDJ,
  removeDJFromQueue,
  resetPlaylistForLoop,
  sendPlaylistSnapshot,
  stopMusicStream,
} from './djHelpers'

// Re-exported for compatibility — the constant now lives with the queue helpers.
export { MAX_DJ_QUEUE_SIZE } from './djHelpers'

type Payload = {
  client: Client
  slotIndex?: number
}

type SkipPayload = Payload & { streamId?: number }

type TurnCompletePayload = {
  client: Client
  streamId: number
}

// Player commands share queue, playback and private snapshot helpers with
// the watchdog and NPC manager; those callers do not need a synthetic send().

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

export class DJSkipTurnCommand extends Command<ClubMutant, SkipPayload> {
  execute(data: SkipPayload) {
    const { client } = data

    // Only current DJ can skip their turn
    if (this.state.currentDjSessionId !== client.sessionId) {
      console.log('[DJQueue] Skip turn rejected - not current DJ:', client.sessionId)
      return
    }

    // A repeated skip for an active stream must not consume its successor.
    if (this.state.musicStream.status === 'playing') {
      if (data.streamId !== this.state.musicStream.streamId) return
      const player = this.state.players.get(client.sessionId)
      if (player && this.state.musicStream.currentTrackId) {
        markTrackAsPlayed(player, this.state.musicStream.currentTrackId)
      }
      sendPlaylistSnapshot(this.room, client.sessionId)
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
      } else if (inQueue && this.state.musicStream.status !== 'playing') {
        // F6: a current DJ with no unplayed tracks must not hold the booth
        // hostage. When nothing is playing and a queued DJ asks to play,
        // pass the turn instead of rejecting.
        const currentPlayer = this.state.players.get(this.state.currentDjSessionId!)
        if (currentPlayer && hasUnplayedTracks(currentPlayer)) {
          console.log('[DJQueue] Play rejected - not current DJ:', client.sessionId)
          return
        }

        console.log(
          '[DJQueue] Trackless current DJ — passing turn on play request from:',
          client.sessionId
        )
        advanceRotation(this.room)

        if (this.state.currentDjSessionId !== client.sessionId) {
          if (this.state.currentDjSessionId !== null) {
            // Rotation promoted another DJ and started their track —
            // the requester keeps waiting in queue order.
            return
          }
          // Nobody had unplayed tracks — promote the requester so the
          // loop-reset below can restart their playlist.
          this.state.currentDjSessionId = client.sessionId
          console.log('[DJQueue] No DJ with unplayed tracks, promoted requester:', client.sessionId)
        }
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

    resetPlaylistForLoop(this.room, client.sessionId)

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

    stopMusicStream(this.room)
  }
}

export class DJTurnCompleteCommand extends Command<ClubMutant, TurnCompletePayload> {
  execute(data: TurnCompletePayload) {
    const { client } = data

    // Completion belongs to one active playback, never a stopped turn or its successor.
    const stream = this.state.musicStream
    if (
      stream.status !== 'playing' ||
      !stream.currentTrackId ||
      data.streamId !== stream.streamId
    ) return

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

    // Mark played track and move to bottom (keep history). F7: target the
    // track that actually played (recorded when playTrackForCurrentDJ
    // started it), not index 0.
    markTrackAsPlayed(player, this.state.musicStream.currentTrackId)

    sendPlaylistSnapshot(this.room, client.sessionId)

    // ALWAYS advance to next DJ after playing one track
    console.log('[DJQueue] Track finished, advancing to next DJ')
    advanceRotation(this.room)
  }
}
