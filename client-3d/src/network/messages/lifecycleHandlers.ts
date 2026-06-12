import { Room } from '@colyseus/sdk'
import type { RoomState } from '@club-mutant/types/RoomState'
import { useGameStore } from '../../stores/gameStore'
import { useMusicStore } from '../../stores/musicStore'
import { useBoothStore } from '../../stores/boothStore'
import { useJukeboxStore } from '../../stores/jukeboxStore'
import { TimeSync } from '../TimeSync'

export function wireLifecycleHandlers(
  room: Room<RoomState>,
  timeSync: TimeSync | null,
  onLeave: () => void,
): void {
  // Reconnection: connection dropped unexpectedly
  room.onDrop((code: number, reason?: string) => {
    console.log(`[network] Connection dropped! code=${code} reason=${reason}`)
    useGameStore.getState().setConnectionStatus('reconnecting')
  })

  // Reconnection: successfully reconnected
  room.onReconnect(() => {
    console.log('[network] Reconnected successfully!')
    useGameStore.getState().setConnectionStatus('connected')

    // Re-sync TimeSync after reconnection
    timeSync?.start()
  })

  // Room leave — permanent (either consented or failed to reconnect)
  room.onLeave((code: number) => {
    console.log('[network] Left room, code:', code)
    onLeave()
    useGameStore.getState().setConnectionStatus('disconnected')
    useMusicStore.getState().clearStream()
    useBoothStore.getState().setBoothConnected(false)
    useBoothStore.getState().setIsInQueue(false)
    useJukeboxStore.getState().clear()
  })
}
