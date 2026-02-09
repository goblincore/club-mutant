import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import type { ClubMutant } from '../ClubMutant'
import { DJQueueEntry, DJUserInfo } from '../schema/OfficeState'
import { Message } from '@club-mutant/types/Messages'

type Payload = {
  client: Client
}

// Helper function to play track for current DJ
function playTrackForCurrentDJ(room: ClubMutant) {
  const djId = room.state.currentDjSessionId
  if (!djId) return

  const player = room.state.players.get(djId)
  if (!player) return

  const track = player.roomQueuePlaylist[0]
  if (!track) return

  const musicStream = room.state.musicStream
  musicStream.status = 'playing'
  musicStream.streamId += 1
  musicStream.currentLink = track.link
  musicStream.currentTitle = track.title

  const djInfo = new DJUserInfo()
  djInfo.name = player.name
  djInfo.sessionId = djId
  musicStream.currentDj = djInfo

  musicStream.startTime = Date.now()
  musicStream.duration = track.duration
  musicStream.isRoomPlaylist = false

  console.log('[DJQueue] Playing track:', track.title, 'by DJ:', player.name)
  room.broadcast(Message.START_MUSIC_STREAM, { musicStream, offset: 0 })
  room.broadcast(Message.DJ_PLAY_STARTED, {
    djSessionId: djId,
    trackId: track.id,
  })
}

// Helper function to find next DJ with tracks
function findNextDJWithTracks(room: ClubMutant): {
  entry: DJQueueEntry | null
  player: any | null
} {
  for (let i = 0; i < room.state.djQueue.length; i++) {
    const entry = room.state.djQueue[i]
    const player = room.state.players.get(entry.sessionId)
    if (player && player.roomQueuePlaylist.length > 0) {
      return { entry, player }
    }
  }
  return { entry: null, player: null }
}

// Helper function to advance rotation
function advanceRotation(room: ClubMutant) {
  if (room.state.djQueue.length === 0) {
    room.state.currentDjSessionId = null

    // Stop music stream
    const musicStream = room.state.musicStream
    musicStream.status = 'waiting'
    musicStream.currentLink = null
    musicStream.currentTitle = null

    console.log('[DJQueue] No more DJs, stopping music')
    room.broadcast(Message.STOP_MUSIC_STREAM, {})
    return
  }

  // Move current DJ to end of queue (if they still have tracks)
  const currentEntry = room.state.djQueue[0]
  const currentPlayer = room.state.players.get(currentEntry.sessionId)

  room.state.djQueue.shift() // Remove from front

  // If player still connected and has tracks, move to end
  if (currentPlayer && currentPlayer.roomQueuePlaylist.length > 0) {
    const newEntry = new DJQueueEntry()
    newEntry.sessionId = currentEntry.sessionId
    newEntry.name = currentEntry.name
    newEntry.joinedAtMs = Date.now()
    newEntry.queuePosition = room.state.djQueue.length
    room.state.djQueue.push(newEntry)
    console.log('[DJQueue] Moved DJ to end of queue:', currentEntry.sessionId)
  } else {
    console.log(
      '[DJQueue] DJ removed from queue (no tracks or disconnected):',
      currentEntry.sessionId
    )
  }

  // Update positions
  room.state.djQueue.forEach((entry, i) => {
    entry.queuePosition = i
  })

  // Find next DJ with tracks (skip those without)
  const { entry: nextEntry, player: nextPlayer } = findNextDJWithTracks(room)

  if (nextEntry && nextPlayer) {
    // Move this DJ to the front of the queue
    const index = room.state.djQueue.findIndex((e) => e.sessionId === nextEntry.sessionId)
    if (index > 0) {
      // Remove from current position and add to front
      room.state.djQueue.splice(index, 1)
      room.state.djQueue.unshift(nextEntry)
      // Re-update positions
      room.state.djQueue.forEach((entry, i) => {
        entry.queuePosition = i
      })
    }

    room.state.currentDjSessionId = nextEntry.sessionId
    console.log('[DJQueue] New current DJ:', room.state.currentDjSessionId)
    playTrackForCurrentDJ(room)
  } else {
    // No DJs with tracks - wait for someone to add tracks
    room.state.currentDjSessionId = null

    // Stop music stream
    const musicStream = room.state.musicStream
    musicStream.status = 'waiting'
    musicStream.currentLink = null
    musicStream.currentTitle = null

    console.log('[DJQueue] No DJs with tracks, waiting...')
    room.broadcast(Message.STOP_MUSIC_STREAM, {})
  }

  room.broadcast(Message.DJ_QUEUE_UPDATED, {
    djQueue: room.state.djQueue.toArray(),
    currentDjSessionId: room.state.currentDjSessionId,
  })
}

// Helper function to mark track as played and move to bottom
function markTrackAsPlayed(player: any) {
  if (player.roomQueuePlaylist.length === 0) return

  const track = player.roomQueuePlaylist[0]
  if (!track) return

  // Mark as played
  track.played = true

  // Move to the bottom of the queue
  player.roomQueuePlaylist.push(track)
  player.roomQueuePlaylist.shift()

  console.log('[DJQueue] Marked track as played and moved to bottom:', track.title)
}

// Helper function to remove DJ from queue
function removeDJFromQueue(room: ClubMutant, sessionId: string) {
  const index = room.state.djQueue.findIndex((e) => e.sessionId === sessionId)
  if (index < 0) return

  const wasCurrentDJ = room.state.currentDjSessionId === sessionId
  const wasPlaying = room.state.musicStream.status === 'playing'

  console.log('[DJQueue] Removing from queue:', sessionId, wasCurrentDJ ? '(was current DJ)' : '')

  // If current DJ was playing, stop their track first
  if (wasCurrentDJ && wasPlaying) {
    console.log('[DJQueue] Current DJ left during track, stopping playback')
    const musicStream = room.state.musicStream
    musicStream.status = 'waiting'
    musicStream.currentLink = null
    musicStream.currentTitle = null
    room.broadcast(Message.STOP_MUSIC_STREAM, {})
  }

  // Remove the leaving DJ from the queue
  room.state.djQueue.splice(index, 1)

  // Reassign queue positions
  room.state.djQueue.forEach((entry, i) => {
    entry.queuePosition = i
  })

  if (wasCurrentDJ) {
    // Promote next person in queue to current DJ (regardless of whether they have tracks)
    const nextEntry = room.state.djQueue[0] ?? null

    if (nextEntry) {
      room.state.currentDjSessionId = nextEntry.sessionId
      console.log('[DJQueue] Promoted next DJ:', nextEntry.sessionId)

      // Auto-start the next DJ's track if they have one queued up
      const nextPlayer = room.state.players.get(nextEntry.sessionId)

      if (nextPlayer && nextPlayer.roomQueuePlaylist.length > 0) {
        playTrackForCurrentDJ(room)
      }
    } else {
      // Queue is empty
      room.state.currentDjSessionId = null
      console.log('[DJQueue] Queue empty, no current DJ')
    }
  }

  room.broadcast(Message.DJ_QUEUE_UPDATED, {
    djQueue: room.state.djQueue.toArray(),
    currentDjSessionId: room.state.currentDjSessionId,
  })
}

export class DJQueueJoinCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const { client } = data
    const player = this.state.players.get(client.sessionId)
    if (!player) return

    // Check if already in queue
    const existingIndex = this.state.djQueue.findIndex(
      (entry) => entry.sessionId === client.sessionId
    )
    if (existingIndex >= 0) return

    // Add to queue
    const entry = new DJQueueEntry()
    entry.sessionId = client.sessionId
    entry.name = player.name
    entry.joinedAtMs = Date.now()
    entry.queuePosition = this.state.djQueue.length

    this.state.djQueue.push(entry)

    console.log('[DJQueue] Joined:', client.sessionId, 'Position:', entry.queuePosition)

    // If first DJ, set as current (playback requires explicit DJ_PLAY)
    if (this.state.djQueue.length === 1) {
      this.state.currentDjSessionId = client.sessionId
      console.log('[DJQueue] First DJ, set as current:', client.sessionId)
    } else if (!this.state.currentDjSessionId) {
      // No current DJ — set this one as current
      this.state.currentDjSessionId = client.sessionId
      console.log('[DJQueue] No current DJ, set as current:', client.sessionId)
    }

    this.room.broadcast(Message.DJ_QUEUE_UPDATED, {
      djQueue: this.state.djQueue.toArray(),
      currentDjSessionId: this.state.currentDjSessionId,
    })
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
        items: player.roomQueuePlaylist.toArray(),
      })
    }

    console.log('[DJQueue] Current DJ skipping turn:', client.sessionId)
    advanceRotation(this.room)
  }
}

export class DJPlayCommand extends Command<ClubMutant, Payload> {
  execute(data: Payload) {
    const { client } = data

    // Only current DJ can start playback
    if (this.state.currentDjSessionId !== client.sessionId) {
      console.log('[DJQueue] Play rejected - not current DJ:', client.sessionId)
      return
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

    // Notify client so their playlist UI updates
    client.send(Message.ROOM_QUEUE_PLAYLIST_UPDATED, {
      items: player.roomQueuePlaylist.toArray(),
    })

    // ALWAYS advance to next DJ after playing one track
    console.log('[DJQueue] Track finished, advancing to next DJ')
    advanceRotation(this.room)
  }
}
