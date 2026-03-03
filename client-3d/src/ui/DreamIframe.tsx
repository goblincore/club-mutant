import { useDreamStore } from '../dream/dreamStore'
import { DreamScene } from './DreamScene'
import { DreamChatOverlay } from './DreamChatOverlay'

/**
 * DreamIframe — Fullscreen dream overlay.
 * Renders the video dreamscape and NPC chat overlay when the player is dreaming.
 * (Originally loaded a Phaser 2D app in an iframe — now replaced with native R3F.)
 */
export function DreamIframe() {
  const isDreaming = useDreamStore((s) => s.isDreaming)

  if (!isDreaming) return null

  return (
    <>
      <DreamScene />
      <DreamChatOverlay />
    </>
  )
}
