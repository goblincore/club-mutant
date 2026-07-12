import type { ClubMutant } from '../ClubMutant'
import { DJQueueEntry, DJUserInfo } from '@club-mutant/types/RoomState'
import { Message } from '@club-mutant/types/Messages'
import { prefetchVideo } from '../../youtubeService'

export const MAX_DJ_QUEUE_SIZE = 3

// Server-authoritative DJ booth slot coordinates. Joining DJs are teleported here
// so late-joining clients see the correct position (client sendPosition can be
// rejected by the speed check).
export const DJ_SLOT_SERVER_X = [100, 0, -100]
export const BEHIND_BOOTH_SERVER_Y = 430

/**
 * Play the first unplayed track in the current DJ's roomQueuePlaylist.
 * Sets musicStream state, broadcasts START_MUSIC_STREAM + DJ_PLAY_STARTED.
 */
export function playTrackForCurrentDJ(room: ClubMutant) {
  const djId = room.state.currentDjSessionId
  if (!djId) return

  const player = room.state.players.get(djId)
  if (!player) return

  // Find the first unplayed track (played tracks are pushed to the end)
  let track: any = null
  for (let i = 0; i < player.roomQueuePlaylist.length; i++) {
    if (!player.roomQueuePlaylist[i].played) {
      track = player.roomQueuePlaylist[i]
      break
    }
  }
  if (!track) return

  const musicStream = room.state.musicStream
  musicStream.status = 'playing'
  musicStream.streamId += 1
  musicStream.currentLink = track.link
  musicStream.currentTitle = track.title
  // F7: record WHICH item is playing so markTrackAsPlayed and the
  // remove/reorder guards target the real track, not index 0.
  musicStream.currentTrackId = track.id
  musicStream.isAmbient = false

  const djInfo = new DJUserInfo()
  djInfo.name = player.name
  djInfo.sessionId = djId
  musicStream.currentDj = djInfo

  musicStream.startTime = Date.now()
  musicStream.duration = track.duration

  console.log('[DJQueue] Playing track:', track.title, 'by DJ:', player.name)
  // F12: send the real elapsed offset (≈0 here since startTime was just set)
  // so the field is truthful on every path — late joiners get a nonzero one.
  room.broadcast(Message.START_MUSIC_STREAM, {
    musicStream,
    offset: (Date.now() - musicStream.startTime) / 1000,
  })
  room.broadcast(Message.DJ_PLAY_STARTED, {
    djSessionId: djId,
    trackId: track.id,
  })

  // Notify Lily NPC about the new track (she may comment spontaneously)
  room.notifyNpcMusicStarted(track.title)

  // Prefetch the next DJ's first unplayed track so rotation is instant
  prefetchNextDJTrack(room, djId)

  // F2/F3: the play path owns the watchdog. Every stream start (re-)arms it
  // here so out-of-band advances (onLeave promotion, watchdog auto-advance,
  // NPC rotation) can't leave a stale or missing watchdog. NpcDjManager
  // clears this immediately after when it arms its own timer (armTrackTimer)
  // — its timer is the sole timing authority for NPC tracks.
  room.startWatchdogIfPlaying()
}

/**
 * Look ahead in the DJ queue and prefetch the next DJ's first unplayed track.
 * Fire-and-forget — failures are logged but don't affect playback.
 */
function prefetchNextDJTrack(room: ClubMutant, currentDjId: string) {
  for (let i = 0; i < room.state.djQueue.length; i++) {
    const entry = room.state.djQueue[i]
    if (entry.sessionId === currentDjId) continue

    const nextPlayer = room.state.players.get(entry.sessionId)
    if (!nextPlayer) continue

    for (let j = 0; j < nextPlayer.roomQueuePlaylist.length; j++) {
      if (!nextPlayer.roomQueuePlaylist[j].played) {
        const nextTrack = nextPlayer.roomQueuePlaylist[j]
        console.log('[DJQueue] Prefetching next DJ track:', nextTrack.title, 'by:', entry.name)
        prefetchVideo(nextTrack.link, 'high')
        return
      }
    }
  }
}

// ─── DJ queue rotation helpers ──────────────────────────────────────────────
// Shared by the DJQueue*Command wrappers and the NPC DJ manager. These must
// never depend on a Colyseus `Client` — the NPC DJ has none. Commands keep
// their client.send(...) UI notifications; everything else lives here.

// F14: client-supplied durations drive the track watchdog — validate/clamp
// them server-side. youtubeService has no metadata plumbing (it only
// prefetches), so bounds are the best available validation: non-finite or
// non-positive values become 0 ("unknown" — the watchdog arms a conservative
// fallback instead of not arming), positives are clamped to [MIN, MAX].
export const MIN_TRACK_DURATION_S = 5
export const MAX_TRACK_DURATION_S = 4 * 60 * 60

export function clampTrackDuration(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
  if (n <= 0) return 0
  return Math.min(Math.max(n, MIN_TRACK_DURATION_S), MAX_TRACK_DURATION_S)
}

/** True if the player has at least one unplayed track in their room queue playlist. */
export function hasUnplayedTracks(player: any): boolean {
  for (let i = 0; i < player.roomQueuePlaylist.length; i++) {
    if (!player.roomQueuePlaylist[i].played) return true
  }
  return false
}

/** Find the first DJ in the queue that has unplayed tracks. */
export function findNextDJWithTracks(room: ClubMutant): {
  entry: DJQueueEntry | null
  player: any | null
} {
  for (let i = 0; i < room.state.djQueue.length; i++) {
    const entry = room.state.djQueue[i]
    const player = room.state.players.get(entry.sessionId)
    if (player && hasUnplayedTracks(player)) {
      return { entry, player }
    }
  }
  return { entry: null, player: null }
}

/** Advance the DJ rotation: move current DJ to the end, promote next DJ with tracks. */
export function advanceRotation(room: ClubMutant) {
  if (room.state.djQueue.length === 0) {
    room.state.currentDjSessionId = null

    // Stop music stream
    const musicStream = room.state.musicStream
    musicStream.status = 'waiting'
    musicStream.currentLink = null
    musicStream.currentTitle = null
    musicStream.currentTrackId = null

    console.log('[DJQueue] No more DJs, stopping music')
    room.clearTrackWatchdog() // F2: stop path kills the watchdog
    room.broadcast(Message.STOP_MUSIC_STREAM, {})
    return
  }

  // Move the CURRENT DJ to the end of the queue. F1: rotate the entry matching
  // state.currentDjSessionId — several promotion paths (join, DJ_PLAY
  // auto-promote, playlist-add promote) set a current DJ that is NOT at
  // index 0, so blindly rotating djQueue[0] starves that entry.
  const currentDjId = room.state.currentDjSessionId
  const currentIndex = currentDjId
    ? room.state.djQueue.findIndex((e) => e.sessionId === currentDjId)
    : -1

  if (currentIndex >= 0) {
    const currentEntry = room.state.djQueue[currentIndex]
    const currentPlayer = room.state.players.get(currentEntry.sessionId)

    room.state.djQueue.splice(currentIndex, 1) // Remove from current position

    // If player still connected, move to end of queue (even without unplayed tracks —
    // they can still add more tracks while at the booth). findNextDJWithTracks will
    // skip them for playback if they have no unplayed tracks.
    if (currentPlayer) {
      const newEntry = new DJQueueEntry()
      newEntry.sessionId = currentEntry.sessionId
      newEntry.name = currentEntry.name
      newEntry.joinedAtMs = Date.now()
      newEntry.queuePosition = room.state.djQueue.length
      newEntry.slotIndex = currentEntry.slotIndex
      room.state.djQueue.push(newEntry)
      console.log('[DJQueue] Moved DJ to end of queue:', currentEntry.sessionId)
    } else {
      console.log('[DJQueue] DJ removed from queue (disconnected):', currentEntry.sessionId)
    }
  }
  // currentIndex < 0: no current DJ (or they already left the queue) — nothing
  // to rotate; fall through to promoting the next DJ with tracks.

  // Update positions
  room.state.djQueue.forEach((entry, i) => {
    entry.queuePosition = i
  })

  // Find next DJ with tracks (skip those without)
  let { entry: nextEntry, player: nextPlayer } = findNextDJWithTracks(room)

  // F8: nobody has unplayed tracks but DJs are still queued — a full cycle
  // just finished. Reset played flags and loop the rotation instead of
  // stopping with DJs stranded at the booth in silence (recovery used to
  // require a human pressing ▶).
  if (!nextEntry && room.state.djQueue.length > 0) {
    let anyReset = false
    room.state.djQueue.forEach((entry) => {
      const p = room.state.players.get(entry.sessionId)
      if (!p) return
      for (const t of p.roomQueuePlaylist) {
        if (t.played) {
          t.played = false
          anyReset = true
        }
      }
    })

    if (anyReset) {
      console.log('[DJQueue] All queued DJs exhausted — resetting played flags to loop rotation')
      ;({ entry: nextEntry, player: nextPlayer } = findNextDJWithTracks(room))
    }
  }

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
    musicStream.currentTrackId = null

    console.log('[DJQueue] No DJs with tracks, waiting...')
    room.clearTrackWatchdog() // F2: stop path kills the watchdog
    room.broadcast(Message.STOP_MUSIC_STREAM, {})
  }

  room.broadcast(Message.DJ_QUEUE_UPDATED, {
    djQueue: room.state.djQueue.toArray(),
    currentDjSessionId: room.state.currentDjSessionId,
  })
}

/**
 * Mark the played track and move it to the bottom of the playlist.
 * F7: callers pass musicStream.currentTrackId so the track that ACTUALLY
 * played gets marked — playTrackForCurrentDJ plays the first unplayed track,
 * which can sit at index > 0 (e.g. after a while-stopped reorder). Falls back
 * to index 0 when no id is available (legacy callers / nothing was playing).
 */
export function markTrackAsPlayed(player: any, trackId?: string | null) {
  if (player.roomQueuePlaylist.length === 0) return

  let index = 0
  if (trackId) {
    index = player.roomQueuePlaylist.findIndex((t: any) => t.id === trackId)
    if (index < 0) {
      // The played track is no longer in this playlist — mark nothing rather
      // than flagging an innocent bystander at index 0.
      console.log('[DJQueue] Played track not found in playlist, skipping mark:', trackId)
      return
    }
  }

  const track = player.roomQueuePlaylist[index]
  if (!track) return

  // Mark as played
  track.played = true

  // Move to the bottom of the queue
  player.roomQueuePlaylist.splice(index, 1)
  player.roomQueuePlaylist.push(track)

  console.log('[DJQueue] Marked track as played and moved to bottom:', track.title)
}

/** Remove a DJ from the queue, promoting the next entry if they were current. */
export function removeDJFromQueue(room: ClubMutant, sessionId: string) {
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
    musicStream.currentTrackId = null
    // F2: the leaving DJ's watchdog must die with their stream — if a new DJ
    // is promoted below, playTrackForCurrentDJ re-arms it for the new track.
    room.clearTrackWatchdog()
    room.broadcast(Message.STOP_MUSIC_STREAM, {})
  }

  // Remove the leaving DJ from the queue
  room.state.djQueue.splice(index, 1)

  // Reassign queue positions
  room.state.djQueue.forEach((entry, i) => {
    entry.queuePosition = i
  })

  if (wasCurrentDJ) {
    // F5: promote like advanceRotation does — skip DJs with no UNPLAYED
    // tracks instead of blindly promoting djQueue[0]. The old length check
    // let a fully-played playlist through, playTrackForCurrentDJ no-opped,
    // and the room stalled silently.
    const { entry: nextEntry, player: nextPlayer } = findNextDJWithTracks(room)

    if (nextEntry && nextPlayer) {
      // Move this DJ to the front so queue order reflects the rotation
      const nextIndex = room.state.djQueue.findIndex((e) => e.sessionId === nextEntry.sessionId)
      if (nextIndex > 0) {
        room.state.djQueue.splice(nextIndex, 1)
        room.state.djQueue.unshift(nextEntry)
        room.state.djQueue.forEach((entry, i) => {
          entry.queuePosition = i
        })
      }

      room.state.currentDjSessionId = nextEntry.sessionId
      console.log('[DJQueue] Promoted next DJ with unplayed tracks:', nextEntry.sessionId)
      playTrackForCurrentDJ(room)
    } else if (room.state.djQueue.length > 0) {
      // Nobody has unplayed tracks. Promote the head anyway (they hold the
      // booth and can add tracks) — and if their playlist is merely
      // exhausted, apply the same loop-reset DJPlayCommand does so the room
      // keeps playing instead of stalling (F5).
      const headEntry = room.state.djQueue[0]
      room.state.currentDjSessionId = headEntry.sessionId

      const headPlayer = room.state.players.get(headEntry.sessionId)
      if (headPlayer && headPlayer.roomQueuePlaylist.length > 0) {
        console.log('[DJQueue] All tracks played — loop-reset for promoted DJ:', headEntry.sessionId)
        for (let i = 0; i < headPlayer.roomQueuePlaylist.length; i++) {
          headPlayer.roomQueuePlaylist[i].played = false
        }
        playTrackForCurrentDJ(room)
      } else {
        console.log('[DJQueue] Promoted next DJ (no tracks):', headEntry.sessionId)
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

/**
 * Join the DJ queue: queue-size/slot validation, entry creation,
 * server-authoritative teleport to the booth slot, current-DJ promotion and
 * DJ_QUEUE_UPDATED broadcast. Extracted from DJQueueJoinCommand.execute.
 * Returns true if the join succeeded.
 */
export function joinDjQueue(
  room: ClubMutant,
  sessionId: string,
  name: string,
  slotIndex?: number,
  teleport = true
): boolean {
  const player = room.state.players.get(sessionId)
  if (!player) return false

  // Check if already in queue
  const existingIndex = room.state.djQueue.findIndex((entry) => entry.sessionId === sessionId)
  if (existingIndex >= 0) return false

  // Enforce max queue size
  if (room.state.djQueue.length >= MAX_DJ_QUEUE_SIZE) {
    console.log('[DJQueue] Queue full, rejecting:', sessionId)
    return false
  }

  // Validate slotIndex (0, 1, or 2) and ensure it's not already taken
  const slot = typeof slotIndex === 'number' && slotIndex >= 0 && slotIndex <= 2 ? slotIndex : 0

  const slotTaken = room.state.djQueue.some((e) => e.slotIndex === slot)

  if (slotTaken) {
    console.log('[DJQueue] Slot', slot, 'already taken, rejecting:', sessionId)
    return false
  }

  // Add to queue
  const entry = new DJQueueEntry()
  entry.sessionId = sessionId
  entry.name = name
  entry.joinedAtMs = Date.now()
  entry.queuePosition = room.state.djQueue.length
  entry.slotIndex = slot

  room.state.djQueue.push(entry)

  // Teleport player behind the booth (must be server-authoritative so late-joining
  // clients see the correct position — client sendPosition can be rejected by speed
  // check). The NPC DJ passes teleport=false and walks to the slot instead — its
  // movement is server-driven, so authority is preserved either way.
  if (teleport) {
    player.x = DJ_SLOT_SERVER_X[slot] ?? 0
    player.y = BEHIND_BOOTH_SERVER_Y
  }

  console.log(
    '[DJQueue] Joined:',
    sessionId,
    'Position:',
    entry.queuePosition,
    teleport ? `teleported to (${player.x}, ${player.y})` : 'walking to slot'
  )

  // If first DJ, set as current (playback requires explicit DJ_PLAY)
  if (room.state.djQueue.length === 1) {
    room.state.currentDjSessionId = sessionId
    console.log('[DJQueue] First DJ, set as current:', sessionId)
  } else if (!room.state.currentDjSessionId) {
    // No current DJ — set this one as current
    room.state.currentDjSessionId = sessionId
    console.log('[DJQueue] No current DJ, set as current:', sessionId)
  }

  room.broadcast(Message.DJ_QUEUE_UPDATED, {
    djQueue: room.state.djQueue.toArray(),
    currentDjSessionId: room.state.currentDjSessionId,
  })

  return true
}
