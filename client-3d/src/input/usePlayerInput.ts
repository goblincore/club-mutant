import { useEffect, useRef } from 'react'

import { useGameStore } from '../stores/gameStore'
import { getNetwork } from '../network/NetworkManager'

const SPEED = 150 // pixels per second (server coordinates)
const CLICK_ARRIVE_THRESHOLD = 3 // server pixels — close enough to stop

// Shared click target — set by ClickPlane (in GameScene), consumed by tick loop
let clickTarget: { x: number; y: number } | null = null

export function setClickTarget(x: number, y: number) {
  clickTarget = { x, y }
}

export function clearClickTarget() {
  clickTarget = null
}

// WASD + click-to-move input hook
export function usePlayerInput() {
  const keysDown = useRef(new Set<string>())

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      keysDown.current.add(e.key.toLowerCase())

      // Any WASD key cancels click-to-move
      if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(
          e.key.toLowerCase()
        )
      ) {
        clickTarget = null
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.current.delete(e.key.toLowerCase())
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    let lastTime = performance.now()

    const tick = () => {
      const now = performance.now()
      const dt = (now - lastTime) / 1000
      lastTime = now

      const keys = keysDown.current
      let dx = 0
      let dy = 0

      // WASD input
      if (keys.has('w') || keys.has('arrowup')) dy += 1
      if (keys.has('s') || keys.has('arrowdown')) dy -= 1
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1
      if (keys.has('d') || keys.has('arrowright')) dx += 1

      const hasKeyInput = dx !== 0 || dy !== 0

      // Click-to-move input
      if (!hasKeyInput && clickTarget) {
        const state = useGameStore.getState()
        const toDx = clickTarget.x - state.localX
        const toDy = clickTarget.y - state.localY
        const dist = Math.sqrt(toDx * toDx + toDy * toDy)

        if (dist < CLICK_ARRIVE_THRESHOLD) {
          clickTarget = null
        } else {
          dx = toDx / dist
          dy = toDy / dist
        }
      }

      if (dx !== 0 || dy !== 0) {
        if (hasKeyInput) {
          const len = Math.sqrt(dx * dx + dy * dy)
          dx = (dx / len) * SPEED * dt
          dy = (dy / len) * SPEED * dt
        } else {
          dx = dx * SPEED * dt
          dy = dy * SPEED * dt
        }

        const state = useGameStore.getState()
        const newX = state.localX + dx
        const newY = state.localY + dy

        state.setLocalPosition(newX, newY)

        if (state.mySessionId) {
          state.updatePlayer(state.mySessionId, { x: newX, y: newY })
        }

        getNetwork().sendPosition(newX, newY, 'walk')
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
