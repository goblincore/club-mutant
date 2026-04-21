import { Room } from '@colyseus/sdk'
import type { RoomState } from '@club-mutant/types/RoomState'
import { Message } from '@club-mutant/types/Messages'
import { emitPlayerJump } from '../events'

export function wireJumpHandlers(room: Room<RoomState>): void {
  // Trampoline jump from other players.
  // Emits a pub/sub event; scene-layer subscribers (PlayerEntity + TrampolineRipples)
  // handle the visual reaction. This keeps network/ free of scene/ imports.
  room.onMessage(Message.PLAYER_JUMP, (data: { sessionId: string }) => {
    if (!data.sessionId) return
    emitPlayerJump(data.sessionId)
  })
}
