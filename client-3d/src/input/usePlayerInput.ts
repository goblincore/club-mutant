import { useEffect, useRef } from 'react'

import { useGameStore } from '../stores/gameStore'
import { getNetwork } from '../network/NetworkManager'

const SPEED = 150 // pixels per second (server coordinates)

// WASD input hook — updates local player position and sends to server
export function usePlayerInput() {
  const keysDown = useRef(new Set<string>())

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      keysDown.current.add(e.key.toLowerCase())
    }

    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.current.delete(e.key.toLowerCase())
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // Movement tick
    let lastTime = performance.now()

    const tick = () => {
      const now = performance.now()
      const dt = (now - lastTime) / 1000
      lastTime = now

      const keys = keysDown.current
      let dx = 0
      let dy = 0

      if (keys.has('w') || keys.has('arrowup')) dy -= 1
      if (keys.has('s') || keys.has('arrowdown')) dy += 1
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1
      if (keys.has('d') || keys.has('arrowright')) dx += 1

      if (dx !== 0 || dy !== 0) {
        // Normalize diagonal movement
        const len = Math.sqrt(dx * dx + dy * dy)
        dx = (dx / len) * SPEED * dt
        dy = (dy / len) * SPEED * dt

        const state = useGameStore.getState()
        const newX = state.localX + dx
        const newY = state.localY + dy

        state.setLocalPosition(newX, newY)

        // Also update our player in the players map
        if (state.mySessionId) {
          state.updatePlayer(state.mySessionId, { x: newX, y: newY })
        }

        // Send to server
        const anim = 'walk'
        getNetwork().sendPosition(newX, newY, anim)
      }

      requestAnimationFrame(tick)
    }

    const frameId = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      cancelAnimationFrame(frameId)
    }
  }, [])
}
