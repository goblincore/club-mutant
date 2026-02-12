import type { ClubMutant } from '../ClubMutant'
import { DJUserInfo } from '../schema/OfficeState'
import { Message } from '@club-mutant/types/Messages'

/**
 * Play the first unplayed track in the current DJ's roomQueuePlaylist.
 * Sets musicStream state, broadcasts START_MUSIC_STREAM + DJ_PLAY_STARTED.
 */
export function playTrackForCurrentDJ(room: ClubMutant) {
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

  console.log('[DJQueue] Playing track:', track.title, 'by DJ:', player.name)
  room.broadcast(Message.START_MUSIC_STREAM, { musicStream, offset: 0 })
  room.broadcast(Message.DJ_PLAY_STARTED, {
    djSessionId: djId,
    trackId: track.id,
  })
}
