/**
 * Bridge message types for postMessage communication
 * between the 3D client and the dream Phaser iframe.
 */

export interface DreamInitPayload {
  playerName: string
  collectedItems: string[]
  serverHttpUrl: string
  dreamServiceUrl: string // base URL for dream-npc service (POST /dream/npc-chat)
}

export type DreamBridgeMessage =
  | { type: 'DREAM_READY' }
  | { type: 'DREAM_INIT'; payload: DreamInitPayload }
  | { type: 'DREAM_COLLECT'; collectibleId: string }
  | { type: 'DREAM_WAKE' }
  | { type: 'DREAM_WAKE_CONFIRMED' }
