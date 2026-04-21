import { Room, getStateCallbacks } from '@colyseus/sdk'
import type { RoomState } from '@club-mutant/types/RoomState'
import type { JukeboxItemDto } from '@club-mutant/types/Dtos'
import { useGameStore } from '../../stores/gameStore'
import { useJukeboxStore } from '../../stores/jukeboxStore'
import { usePanelStore } from '../../stores/panelStore'
import { useToastStore } from '../../stores/toastStore'

export function wireJukeboxHandlers(room: Room<RoomState>): void {
  const $ = getStateCallbacks(room)
  const stateProxy = $(room.state) as any

  // Jukebox playlist schema callbacks — syncs shared playlist to jukeboxStore.
  // Fires on late-join (initial state) and every live mutation (add/remove/splice).
  try {
    const jukeboxPlaylistProxy = stateProxy.jukeboxPlaylist

    const syncJukeboxPlaylist = () => {
      const rs = room.state as any
      if (!rs?.jukeboxPlaylist) return

      const items: JukeboxItemDto[] = Array.from(
        rs.jukeboxPlaylist as Iterable<any>
      ).map((item: any) => ({
        id: item.id as string,
        title: item.title as string,
        link: item.link as string,
        duration: (item.duration ?? 0) as number,
        addedBySessionId: item.addedBySessionId as string,
        addedByName: item.addedByName as string,
        addedAtMs: (item.addedAtMs ?? 0) as number,
      }))

      useJukeboxStore.getState().setPlaylist(items)
    }

    jukeboxPlaylistProxy.onAdd(() => syncJukeboxPlaylist())
    jukeboxPlaylistProxy.onRemove(() => syncJukeboxPlaylist())
  } catch (err) {
    console.warn('[network] Schema callbacks for jukeboxPlaylist failed:', err)
  }

  // Jukebox occupant sync — track who's using the jukebox
  try {
    const syncJukeboxOccupant = () => {
      const rs = room.state as any
      const uid = rs?.jukeboxUserId ?? ''
      const uname = rs?.jukeboxUserName ?? ''
      useJukeboxStore
        .getState()
        .setOccupant(uid || null, uname || null)

      // Auto-open panel if we just became the occupant
      if (uid === useGameStore.getState().mySessionId) {
        usePanelStore.getState().setDjQueueOpen(true)
      }
    }

    stateProxy.listen('jukeboxUserId', syncJukeboxOccupant)
    stateProxy.listen('jukeboxUserName', syncJukeboxOccupant)

    // Late-join: sync initial occupant state
    syncJukeboxOccupant()
  } catch (err) {
    console.warn('[network] Schema callbacks for jukebox occupant failed:', err)
  }

  // Jukebox busy rejection — server tells us someone else is using it
  room.onMessage('jukebox_busy', (data: { name: string }) => {
    useToastStore.getState().addToast(`${data.name} is using the jukebox`)
  })
}
