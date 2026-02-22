import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { getPhaserConfig } from './phaser/config'
import { DreamChatPanel } from './ui/DreamChatPanel'
import { DreamHUD } from './ui/DreamHUD'
import { useDreamClientStore } from './stores/dreamClientStore'
import { initBridge } from './bridge/iframeBridge'

export function App() {
  const gameRef = useRef<Phaser.Game | null>(null)
  const initialized = useDreamClientStore((s) => s.initialized)

  // Initialize iframe bridge on mount
  useEffect(() => {
    const cleanup = initBridge()
    return cleanup
  }, [])

  // Create Phaser game once we receive DREAM_INIT from parent
  useEffect(() => {
    if (!initialized || gameRef.current) return

    const config = getPhaserConfig()
    gameRef.current = new Phaser.Game(config)

    // Expose on window so React UI (DreamChatPanel) can disable keyboard input during chat
    ;(window as unknown as { __phaserGame: Phaser.Game }).__phaserGame = gameRef.current

    return () => {
      gameRef.current?.destroy(true)
      gameRef.current = null
    }
  }, [initialized])

  return (
    <>
      {/* React UI overlay */}
      {initialized && (
        <>
          <DreamChatPanel />
          <DreamHUD />
        </>
      )}
    </>
  )
}
