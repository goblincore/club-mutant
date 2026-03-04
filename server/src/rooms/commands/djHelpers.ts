import type { ClubMutant } from '../ClubMutant'
import { DJUserInfo } from '../schema/OfficeState'
import { Message } from '@club-mutant/types/Messages'
import { prefetchVideo } from '../../youtubeService'

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
  musicStream.isAmbient = false

  const djInfo = new DJUserInfo()
  djInfo.name = player.name
  djInfo.sessionId = djId
  musicStream.currentDj = djInfo

  musicStream.startTime = Date.now()
  musicStream.duration = track.duration

  console.log('[DJQueue] Playing track:', track.title, 'by DJ:', player.name)
  room.broadcast(Message.START_MUSIC_STREAM, { musicStream, offset: 0 })
  room.broadcast(Message.DJ_PLAY_STARTED, {
    djSessionId: djId,
    trackId: track.id,
  })

  // Notify Lily NPC about the new track (she may comment spontaneously)
  room.notifyNpcMusicStarted(track.title)

  // Prefetch the next DJ's first unplayed track so rotation is instant
  prefetchNextDJTrack(room, djId)
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
