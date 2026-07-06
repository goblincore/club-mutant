import { Room } from '@colyseus/sdk'
import type { RoomState } from '@club-mutant/types/RoomState'
import { Message } from '@club-mutant/types/Messages'
import { useMusicStore } from '../../stores/musicStore'
import { TimeSync } from '../TimeSync'

export function wireMusicHandlers(room: Room<RoomState>, timeSync: TimeSync | null): void {
  // Music stream messages
  room.onMessage(
    Message.START_MUSIC_STREAM,
    (data: { musicStream: any; offset: number }) => {
      const ms = data.musicStream
      if (!ms) return

      // Skip ambient background streams — no DJ is playing
      if (ms.isAmbient) return

      // Convert server startTime to client time using clock sync. Before
      // TimeSync is ready, derive startTime from the server-computed offset
      // (F11/F12): that value is skew-free (only off by one-way latency),
      // unlike the raw server-clock startTime.
      const clientStartTime = timeSync?.ready
        ? timeSync.toClientTime(ms.startTime ?? 0)
        : Date.now() - (data.offset ?? 0) * 1000

      useMusicStore.getState().setStream({
        currentLink: ms.currentLink ?? null,
        currentTitle: ms.currentTitle ?? null,
        currentDjName: ms.currentDj?.name ?? null,
        startTime: clientStartTime,
        duration: ms.duration ?? 0,
        isPlaying: true,
        streamId: ms.streamId ?? 0,
      })
    }
  )

  room.onMessage(Message.STOP_MUSIC_STREAM, () => {
    useMusicStore.getState().clearStream()
  })

  // Periodic drift correction — server sends streamId + startTime every 5s
  room.onMessage(
    Message.MUSIC_STREAM_TICK,
    (data: { streamId: number; startTime: number; serverNowMs: number }) => {
      const store = useMusicStore.getState()

      // Ignore ticks for a different stream
      if (!store.stream.isPlaying || store.stream.streamId !== data.streamId) return

      // Recompute client-local startTime from this tick's authoritative server time
      const clientStartTime = timeSync?.ready
        ? timeSync.toClientTime(data.startTime)
        : data.startTime

      const currentClientStart = store.stream.startTime
      const drift = Math.abs(clientStartTime - currentClientStart)

      // Only correct if drift > 2 seconds to avoid micro-jitter
      if (drift > 2000) {
        console.log(`[TimeSync] Drift correction: ${drift}ms, resyncing startTime`)

        store.setStream({ startTime: clientStartTime })
      }
    }
  )

  // Late-join: sync music state AFTER TimeSync is ready (correct seek offset)
  if (timeSync) {
    timeSync.onReady(() => {
      const rs = room.state as any
      const ms = rs?.musicStream
      if (!ms || ms.status !== 'playing' || !ms.currentLink || ms.isAmbient) return

      const store = useMusicStore.getState()
      const clientStartTime = timeSync.toClientTime(ms.startTime ?? 0)

      // START_MUSIC_STREAM may have set this stream BEFORE TimeSync was ready
      // (offset-derived startTime, off by one-way latency). Now that sync
      // samples exist, refresh startTime with the skew-corrected value
      // instead of skipping the stream entirely (F11).
      if (store.stream.isPlaying && store.stream.streamId === (ms.streamId ?? 0)) {
        store.setStream({ startTime: clientStartTime })
        return
      }

      store.setStream({
        currentLink: ms.currentLink,
        currentTitle: ms.currentTitle ?? null,
        currentDjName: ms.currentDj?.name ?? null,
        startTime: clientStartTime,
        duration: ms.duration ?? 0,
        isPlaying: true,
        streamId: ms.streamId ?? 0,
      })
    })
  }
}
