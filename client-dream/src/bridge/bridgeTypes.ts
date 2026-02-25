// ── Iframe Bridge Message Types ──
// Communication between client-3d (parent) and client-dream (iframe)

export interface DreamInitPayload {
  playerName: string
  collectedItems: string[]
  serverHttpUrl: string // base URL for Colyseus server
  dreamServiceUrl: string // base URL for dream-npc-go service (POST /dream/npc-chat)
}

export type DreamBridgeMessage =
  | { type: 'DREAM_READY' } // dream → 3d: loaded, ready
  | { type: 'DREAM_INIT'; payload: DreamInitPayload } // 3d → dream: player context
  | { type: 'DREAM_COLLECT'; collectibleId: string } // dream → 3d: picked up item
  | { type: 'DREAM_WAKE' } // dream → 3d: wants to wake
  | { type: 'DREAM_WAKE_CONFIRMED' } // 3d → dream: tear down

/** Send a message to the parent window (client-3d) */
export function sendToParent(msg: DreamBridgeMessage) {
  window.parent.postMessage(msg, '*')
}
