// Pub/sub bus for network → scene signals.
// Lets the network layer emit events without importing scene modules.

type PlayerJumpListener = (sessionId: string) => void

const jumpListeners = new Set<PlayerJumpListener>()

export function onPlayerJump(listener: PlayerJumpListener): () => void {
  jumpListeners.add(listener)
  return () => {
    jumpListeners.delete(listener)
  }
}

export function emitPlayerJump(sessionId: string): void {
  for (const listener of jumpListeners) listener(sessionId)
}
