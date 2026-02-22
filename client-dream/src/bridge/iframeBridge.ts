import type { DreamBridgeMessage } from './bridgeTypes'
import { sendToParent } from './bridgeTypes'
import { useDreamClientStore } from '../stores/dreamClientStore'

/**
 * Initialize the iframe bridge — listens for messages from the parent (client-3d).
 * Call once on mount. Returns a cleanup function.
 */
export function initBridge(): () => void {
  function handleMessage(event: MessageEvent<DreamBridgeMessage>) {
    const msg = event.data
    if (!msg || typeof msg.type !== 'string') return

    switch (msg.type) {
      case 'DREAM_INIT': {
        const { playerName, collectedItems, serverHttpUrl, dreamServiceUrl } = msg.payload
        useDreamClientStore.getState().init(playerName, collectedItems, serverHttpUrl, dreamServiceUrl)
        break
      }

      case 'DREAM_WAKE_CONFIRMED': {
        // Parent confirmed wake — Phaser scene will handle teardown
        useDreamClientStore.getState().setWaking(true)
        break
      }
    }
  }

  window.addEventListener('message', handleMessage)

  // Tell parent we're ready
  sendToParent({ type: 'DREAM_READY' })

  return () => {
    window.removeEventListener('message', handleMessage)
  }
}
