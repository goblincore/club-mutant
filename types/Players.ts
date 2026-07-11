export enum PlayerBehavior {
  IDLE,
  SITTING,
  DANCING,
  BOOMBOX,
  TRANSFORMING,
}

// Session-id prefix for the server-driven NPC automaton DJ. Shared so the
// client can recognize the NPC (click menu, takeover prompt) and the server
// can guard client-bound command paths against it.
export const NPC_DJ_SESSION_PREFIX = 'npc-dj:'
