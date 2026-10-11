import { Room } from '@colyseus/sdk'
import type { RoomState } from '@club-mutant/types/RoomState'
import { Message } from '@club-mutant/types/Messages'
import { useMusicStore } from '../../stores/musicStore'
import { TimeSync } from '../TimeSync'

export function wireMusicHandlers(room: Room<RoomState>, timeSync: TimeSync | null): void {
  const reconcile = (ms: any, offset?: number) => {
    if (!ms) return
    const store = useMusicStore.getState()
    if ((ms.streamId ?? 0) < store.stream.streamId) return
    if (ms.status !== 'playing' || !ms.currentLink || ms.isAmbient) {
      if (store.stream.isPlaying || store.stream.streamId !== (ms.streamId ?? 0)) {
        store.clearStream(ms.streamId ?? 0)
      }
      return
    }

    const sameStream = store.stream.isPlaying && store.stream.streamId === ms.streamId
    // Schema state has no server-now timestamp. Keep the existing skew-free
    // anchor until START, a snapshot tick, or clock synchronization supplies one.
    const clientStartTime = timeSync?.ready
      ? timeSync.toClientTime(ms.startTime ?? 0)
      : offset !== undefined
        ? Date.now() - Math.max(0, offset) * 1000
        : sameStream ? store.stream.startTime : Date.now()

    const unchanged = sameStream &&
      store.stream.currentLink === ms.currentLink &&
      store.stream.currentTitle === (ms.currentTitle ?? null) &&
      store.stream.currentTrackId === (ms.currentTrackId ?? null) &&
      store.stream.currentDjName === (ms.currentDj?.name ?? null) &&
      store.stream.duration === (ms.duration ?? 0)
    if (unchanged && Math.abs(clientStartTime - store.stream.startTime) <= 2000) return

    store.setStream({
      currentLink: ms.currentLink,
      currentTitle: ms.currentTitle ?? null,
      currentTrackId: ms.currentTrackId ?? null,
      currentDjName: ms.currentDj?.name ?? null,
      startTime: clientStartTime,
      duration: ms.duration ?? 0,
      isPlaying: true,
      streamId: ms.streamId ?? 0,
    })
  }

  room.onMessage(Message.START_MUSIC_STREAM, (data: { musicStream: any; offset: number }) => {
    reconcile(data.musicStream, data.offset)
  })
  room.onMessage(Message.STOP_MUSIC_STREAM, (data: { streamId?: number }) => {
    const store = useMusicStore.getState()
    const id = data?.streamId ?? store.stream.streamId
    if (id >= store.stream.streamId) store.clearStream(id)
  })

  // Full snapshots include waiting state: a missed STOP now heals too.
  room.onMessage(Message.MUSIC_STREAM_TICK, (data: {
    musicStream?: any; streamId: number; startTime: number; serverNowMs: number
  }) => {
    const ms = data.musicStream ?? (room.state as any)?.musicStream
    if (!ms || ms.streamId !== data.streamId) return
    // Ignore delayed ticks for streams that have already been superseded locally.
    if (data.streamId < useMusicStore.getState().stream.streamId) return
    reconcile(ms, (data.serverNowMs - data.startTime) / 1000)
  })

  // State patches are authoritative even when a notification was missed.
  room.onStateChange(() => reconcile((room.state as any)?.musicStream))
  timeSync?.onReady(() => reconcile((room.state as any)?.musicStream))
}
