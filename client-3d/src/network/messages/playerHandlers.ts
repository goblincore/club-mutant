import { Room, getStateCallbacks } from '@colyseus/sdk'
import type { RoomState, Player } from '@club-mutant/types/RoomState'
import { useGameStore, setPlayerPosition, getPlayerPosition } from '../../stores/gameStore'
import { useChatStore } from '../../stores/chatStore'

// Clamp server positions to 3D room bounds (ROOM_SIZE=12, WORLD_SCALE=0.01 → ±550 server px)
const ROOM_MAX = 550
const clampPos = (v: number) => Math.max(-ROOM_MAX, Math.min(ROOM_MAX, v))

export function wirePlayerHandlers(
  room: Room<RoomState>,
  onLocalPlayerAdded: () => void,
): void {
  const $ = getStateCallbacks(room)
  const stateProxy = $(room.state) as any
  const playersProxy = stateProxy.players

  playersProxy.onAdd((player: Player, sessionId: string) => {
    const gameStore = useGameStore.getState()
    const chatStore = useChatStore.getState()

    const cx = clampPos(player.x)
    const cy = clampPos(player.y)

    console.log(
      `[network] onAdd ${sessionId} textureId=${player.textureId} name=${player.name} pos=(${player.x},${player.y})→(${cx},${cy})`
    )

    const isLocal = sessionId === room.sessionId
    const localSessionId = room.sessionId

    const playerProxy = $(player) as any

    playerProxy.listen('x', (value: number) => {
      if (sessionId === localSessionId) return
      const pos = getPlayerPosition(sessionId)
      if (pos) pos.x = clampPos(value)
    })

    playerProxy.listen('y', (value: number) => {
      if (sessionId === localSessionId) return
      const pos = getPlayerPosition(sessionId)
      if (pos) pos.y = clampPos(value)
    })

    setPlayerPosition(sessionId, cx, cy)

    gameStore.addPlayer(sessionId, {
      sessionId,
      name: player.name,
      textureId: player.textureId,
      animId: player.animId,
      scale: player.scale,
      isNpc: player.isNpc ?? false,
      npcCharacterPath: player.npcCharacterPath ?? '',
      npcAnimState: player.npcAnimState ?? '',
      nakamaId: player.nakamaId ?? '',
    })

    if (isLocal) {
      gameStore.setLocalPosition(0, 0)
      onLocalPlayerAdded()
    }

    playerProxy.listen('name', (value: string) => {
      useGameStore.getState().updatePlayer(sessionId, { name: value })
    })

    playerProxy.listen('animId', (value: number) => {
      useGameStore.getState().updatePlayer(sessionId, { animId: value })
    })

    playerProxy.listen('textureId', (value: number) => {
      console.log(`[network] textureId listen ${sessionId} -> ${value}`)
      useGameStore.getState().updatePlayer(sessionId, { textureId: value })
    })

    playerProxy.listen('scale', (value: number) => {
      useGameStore.getState().updatePlayer(sessionId, { scale: value })
    })

    playerProxy.listen('npcAnimState', (value: string) => {
      useGameStore.getState().updatePlayer(sessionId, { npcAnimState: value })
    })

    // Don't show "joined" message for NPC players — they're always present
    if (player.name && !player.isNpc) {
      chatStore.addMessage({
        id: crypto.randomUUID(),
        author: 'system',
        content: `${player.name} joined`,
        createdAt: Date.now(),
      })
    }
  }, true) // true = trigger for existing items

  playersProxy.onRemove((_player: Player, sessionId: string) => {
    const gameStore = useGameStore.getState()
    const chatStore = useChatStore.getState()

    const existing = gameStore.players.get(sessionId)
    const name = existing?.name ?? sessionId

    gameStore.removePlayer(sessionId)

    // Don't show "left" message for NPC players
    if (!existing?.isNpc) {
      chatStore.addMessage({
        id: crypto.randomUUID(),
        author: 'system',
        content: `${name} left`,
        createdAt: Date.now(),
      })
    }
  })
}
