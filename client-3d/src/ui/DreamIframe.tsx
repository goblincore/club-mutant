import { useRef, useEffect, useCallback } from 'react'
import { useGameStore } from '../stores/gameStore'
import { useDreamStore } from '../dream/dreamStore'
import { useUIStore } from '../stores/uiStore'
import { getNetwork } from '../network/NetworkManager'
import type { DreamBridgeMessage, DreamInitPayload } from '../dream/dreamBridgeTypes'

// In dev mode, dream app runs on separate port; in prod, it's embedded
const DREAM_URL = import.meta.env.DEV
  ? 'http://localhost:5176'
  : '/dream/index.html'

/**
 * DreamIframe — Fullscreen iframe overlay for the Phaser dream app.
 * Handles postMessage bridge between 3D client and dream client.
 */
export function DreamIframe() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const isDreaming = useDreamStore((s) => s.isDreaming)

  // Handle messages from dream iframe
  const handleMessage = useCallback((event: MessageEvent<DreamBridgeMessage>) => {
    const msg = event.data
    if (!msg || typeof msg.type !== 'string') return

    switch (msg.type) {
      case 'DREAM_READY': {
        // Dream app loaded — send init data
        const network = getNetwork()
        const payload: DreamInitPayload = {
          playerName: useGameStore.getState().playerName || 'dreamer',
          collectedItems: Array.from(useDreamStore.getState().collectedItems),
          serverHttpUrl: import.meta.env.VITE_HTTP_ENDPOINT || 'http://localhost:2567',
          dreamServiceUrl: import.meta.env.VITE_DREAM_SERVICE_URL || 'http://localhost:4000',
        }
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'DREAM_INIT', payload } satisfies DreamBridgeMessage,
          '*'
        )
        break
      }

      case 'DREAM_COLLECT': {
        // Player picked up a collectible in the dream
        if ('collectibleId' in msg) {
          useDreamStore.getState().addCollectedItem(msg.collectibleId)
          getNetwork().sendDreamCollect(msg.collectibleId)
        }
        break
      }

      case 'DREAM_WAKE': {
        // Player wants to wake up — show the wake prompt
        useUIStore.getState().setWakePromptOpen(true)
        break
      }
    }
  }, [])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  // When wake is confirmed, notify the dream iframe
  const wakeConfirmed = useUIStore((s) => !s.wakePromptOpen) && isDreaming
  useEffect(() => {
    // This fires when the wake prompt closes while still dreaming
    // The actual dream exit happens in WakePrompt.tsx via exitDream()
  }, [wakeConfirmed])

  if (!isDreaming) return null

  return (
    <div
      className="fixed inset-0 bg-black"
      style={{ zIndex: 50 }}
    >
      <iframe
        ref={iframeRef}
        src={DREAM_URL}
        title="Dream Mode"
        className="w-full h-full border-0"
        allow="autoplay"
      />
    </div>
  )
}
