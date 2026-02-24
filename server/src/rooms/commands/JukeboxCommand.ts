import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { v4 as uuidv4 } from 'uuid'
import type { ClubMutant } from '../ClubMutant'
import { JukeboxItem, DJUserInfo } from '../schema/OfficeState'
import { Message } from '@club-mutant/types/Messages'
import { prefetchVideo } from '../../youtubeService'

type ClientPayload = {
  client: Client
}

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

type TrackCompletePayload = {
  client: Client
  streamId?: number
}

/**
 * Play the first track in the jukebox playlist.
 * Sets musicStream state and broadcasts START_MUSIC_STREAM to all clients.
 */
export function playNextJukeboxTrack(room: ClubMutant) {
  const playlist = room.state.jukeboxPlaylist
  if (playlist.length === 0) return

  const track = playlist[0]
  const musicStream = room.state.musicStream

  musicStream.status = 'playing'
  musicStream.streamId += 1
  musicStream.currentLink = track.link
  musicStream.currentTitle = track.title

  const djInfo = new DJUserInfo()
  djInfo.name = track.addedByName
  djInfo.sessionId = track.addedBySessionId
  musicStream.currentDj = djInfo

  musicStream.startTime = Date.now()
  musicStream.duration = track.duration

  console.log('[Jukebox] Playing track:', track.title, 'added by:', track.addedByName)
  room.broadcast(Message.START_MUSIC_STREAM, { musicStream, offset: 0 })

  // Notify Lily NPC about the new track (she may comment spontaneously)
  room.notifyNpcMusicStarted(track.title)
}

/**
 * Stop the jukebox stream. Clears musicStream but does NOT remove tracks.
 */
export function stopJukeboxStream(room: ClubMutant) {
  const musicStream = room.state.musicStream
  musicStream.status = 'waiting'
  musicStream.currentLink = null
  musicStream.currentTitle = null

  console.log('[Jukebox] Stream stopped')
  room.broadcast(Message.STOP_MUSIC_STREAM, {})
}

/**
 * Add a track to the shared jukebox playlist.
 * Auto-starts playback if the jukebox is idle.
 */
export class JukeboxAddCommand extends Command<ClubMutant, AddPayload> {
  execute(data: AddPayload) {
    const { client, item } = data
    const player = this.state.players.get(client.sessionId)
    if (!player) return

    // Validate required fields
    if (!item?.title || !item?.link) {
      console.warn('[Jukebox] Add rejected - missing title or link')
      return
    }

    // Cap the playlist size to 50 items to prevent huge room state payloads
    if (this.state.jukeboxPlaylist.length >= 50) {
      console.log('[Jukebox] Add rejected - playlist full (max 50 tracks)')
      return
    }

    const jukeboxItem = new JukeboxItem()
    jukeboxItem.id = uuidv4()
    jukeboxItem.title = String(item.title)
    jukeboxItem.link = String(item.link)
    jukeboxItem.duration = typeof item.duration === 'number' ? item.duration : 0
    jukeboxItem.addedBySessionId = client.sessionId
    jukeboxItem.addedByName = player.name
    jukeboxItem.addedAtMs = Date.now()

    this.state.jukeboxPlaylist.push(jukeboxItem)

    console.log(
      '[Jukebox] Added:',
      item.title,
      'by:',
      player.name,
      'total:',
      this.state.jukeboxPlaylist.length
    )

    // Pre-fetch video to cache it before playback
    prefetchVideo(item.link)

    // Do NOT auto-play when adding to an idle jukebox.
    // Players should hit Play explicitly to start.
    // Auto-advance only happens via JukeboxTrackCompleteCommand / JukeboxSkipCommand.
  }
}

/**
 * Remove a track from the jukebox playlist.
 * Only the adder can remove their own track.
 * If removing the currently-playing track (index 0), skip to next.
 */
export class JukeboxRemoveCommand extends Command<ClubMutant, RemovePayload> {
  execute(data: RemovePayload) {
    const { client, itemId } = data

    const index = this.state.jukeboxPlaylist.findIndex(
      (item: JukeboxItem) => item.id === itemId
    )
    if (index < 0) return

    const item = this.state.jukeboxPlaylist[index]

    // Only the adder can remove their own track
    if (item.addedBySessionId !== client.sessionId) {
      console.log('[Jukebox] Remove rejected - not the adder:', client.sessionId)
      return
    }

    const wasPlaying = index === 0 && this.state.musicStream.status === 'playing'

    // Remove the track (destructive)
    this.state.jukeboxPlaylist.splice(index, 1)
    console.log('[Jukebox] Removed:', item.title, 'by:', client.sessionId)

    // If we removed the currently-playing track, handle playback transition
    if (wasPlaying) {
      if (this.state.jukeboxPlaylist.length > 0) {
        // Play next track
        playNextJukeboxTrack(this.room)
      } else {
        // No more tracks
        stopJukeboxStream(this.room)
      }
    }
  }
}

/**
 * Start/resume jukebox playback.
 * Any player can trigger this.
 */
export class JukeboxPlayCommand extends Command<ClubMutant, ClientPayload> {
  execute(_data: ClientPayload) {
    if (this.state.jukeboxPlaylist.length === 0) {
      console.log('[Jukebox] Play rejected - no tracks')
      return
    }

    // Don't restart if already playing
    if (this.state.musicStream.status === 'playing' && this.state.musicStream.currentLink) {
      console.log('[Jukebox] Already playing, ignoring play request')
      return
    }

    console.log('[Jukebox] Play triggered by:', _data.client.sessionId)
    playNextJukeboxTrack(this.room)
  }
}

/**
 * Stop jukebox playback. Keeps tracks in the playlist.
 * Any player can trigger this.
 */
export class JukeboxStopCommand extends Command<ClubMutant, ClientPayload> {
  execute(_data: ClientPayload) {
    if (this.state.musicStream.status !== 'playing' || !this.state.musicStream.currentLink) {
      console.log('[Jukebox] Stop rejected - not currently playing')
      return
    }

    console.log('[Jukebox] Stop triggered by:', _data.client.sessionId)
    stopJukeboxStream(this.room)
  }
}

/**
 * Skip the current track (destructive — removes it from the playlist).
 * Any player can trigger this.
 */
export class JukeboxSkipCommand extends Command<ClubMutant, ClientPayload> {
  execute(_data: ClientPayload) {
    if (this.state.jukeboxPlaylist.length === 0) {
      console.log('[Jukebox] Skip rejected - no tracks')
      return
    }

    const skipped = this.state.jukeboxPlaylist[0]
    console.log('[Jukebox] Skipping:', skipped.title, 'triggered by:', _data.client.sessionId)

    // Remove the current track (destructive)
    this.state.jukeboxPlaylist.splice(0, 1)

    if (this.state.jukeboxPlaylist.length > 0) {
      playNextJukeboxTrack(this.room)
    } else {
      stopJukeboxStream(this.room)
    }
  }
}

/**
 * Current track finished playing (auto-advance).
 * Any client can report this — server deduplicates via streamId.
 */
export class JukeboxTrackCompleteCommand extends Command<ClubMutant, TrackCompletePayload> {
  execute(data: TrackCompletePayload) {
    // Dedup: only process if the streamId matches current (prevents double-fires)
    if (
      data.streamId !== undefined &&
      data.streamId !== this.state.musicStream.streamId
    ) {
      console.log(
        '[Jukebox] Track complete ignored - streamId mismatch:',
        data.streamId,
        'vs',
        this.state.musicStream.streamId
      )
      return
    }

    if (this.state.jukeboxPlaylist.length === 0) {
      console.log('[Jukebox] Track complete but playlist empty')
      stopJukeboxStream(this.room)
      return
    }

    const finished = this.state.jukeboxPlaylist[0]
    console.log('[Jukebox] Track complete:', finished.title)

    // Remove the finished track (destructive)
    this.state.jukeboxPlaylist.splice(0, 1)

    if (this.state.jukeboxPlaylist.length > 0) {
      playNextJukeboxTrack(this.room)
    } else {
      console.log('[Jukebox] Playlist empty, stopping')
      stopJukeboxStream(this.room)
    }
  }
}
