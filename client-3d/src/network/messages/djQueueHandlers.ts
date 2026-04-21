import { Room, getStateCallbacks } from '@colyseus/sdk'
import type { RoomState } from '@club-mutant/types/RoomState'
import { Message } from '@club-mutant/types/Messages'
import { useBoothStore, type DJQueueEntry } from '../../stores/boothStore'

export function wireDJQueueHandlers(room: Room<RoomState>): void {
  const $ = getStateCallbacks(room)
  const stateProxy = $(room.state) as any

  // Helper to sync DJ queue from schema state into boothStore
  const syncDJQueueFromSchema = () => {
    const rs = room.state as any
    if (!rs) return

    const dq = rs.djQueue
    const entries: DJQueueEntry[] = dq
      ? Array.from(dq as Iterable<any>).map((e: any) => ({
          sessionId: e.sessionId as string,
          name: e.name as string,
          position: (e.queuePosition ?? 0) as number,
          slotIndex: (e.slotIndex ?? 0) as number,
        }))
      : []

    const booth = useBoothStore.getState()
    booth.setDJQueue(entries, rs.currentDjSessionId ?? null)

    const myId = room.sessionId
    booth.setIsInQueue(entries.some((e) => e.sessionId === myId))
  }

  // Schema callbacks — sole mechanism for DJ queue sync.
  // Fires on late-join (initial state delivery) AND on every live mutation
  // (join/leave/skip/rotation). No separate message handler needed.
  try {
    const djQueueProxy = stateProxy.djQueue
    djQueueProxy.onAdd(() => syncDJQueueFromSchema())
    djQueueProxy.onRemove(() => syncDJQueueFromSchema())
    stateProxy.listen('currentDjSessionId', () => syncDJQueueFromSchema())
  } catch (err) {
    console.warn('[network] Schema callbacks for djQueue failed:', err)
  }

  // Per-player queue playlist updates
  room.onMessage(Message.ROOM_QUEUE_PLAYLIST_UPDATED, (payload: { items: any[] }) => {
    useBoothStore.getState().setQueuePlaylist(
      payload.items.map((item) => ({
        id: item.id,
        title: item.title,
        link: item.link,
        duration: item.duration ?? 0,
        played: item.played ?? false,
      }))
    )
  })
}
