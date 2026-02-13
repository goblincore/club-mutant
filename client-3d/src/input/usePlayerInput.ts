import { useEffect, useRef } from 'react'

import { useGameStore, setPlayerPosition } from '../stores/gameStore'
import { useBoothStore } from '../stores/boothStore'
import { getNetwork } from '../network/NetworkManager'
import { cameraAzimuth } from '../scene/Camera'

const SPEED = 150 // pixels per second (server coordinates)
const CLICK_ARRIVE_THRESHOLD = 3 // server pixels — close enough to stop
const JUMP_COOLDOWN = 0.3 // seconds between jump triggers

// ── Collision (server coordinates) ──

const ROOM_HALF = 580 // room boundary with character radius padding

// DJ booth: table (2.8w × 0.7d) + speakers (±1.85 x, 0.65w × 0.55d)
// Combined AABB with ~15px padding for character radius
const BOOTH_BOX = { minX: -230, maxX: 230, minY: 305, maxY: 395 }

function clampPosition(x: number, y: number): [number, number] {
  // Room boundaries
  x = Math.max(-ROOM_HALF, Math.min(ROOM_HALF, x))
  y = Math.max(-ROOM_HALF, Math.min(ROOM_HALF, y))

  // DJ booth — push out along shortest axis
  const b = BOOTH_BOX

  if (x > b.minX && x < b.maxX && y > b.minY && y < b.maxY) {
    const pushL = x - b.minX
    const pushR = b.maxX - x
    const pushD = y - b.minY
    const pushU = b.maxY - y
    const min = Math.min(pushL, pushR, pushD, pushU)

    if (min === pushL) x = b.minX
    else if (min === pushR) x = b.maxX
    else if (min === pushD) y = b.minY
    else y = b.maxY
  }

  return [x, y]
}

// Shared click target — set by ClickPlane (in GameScene), consumed by tick loop
let clickTarget: { x: number; y: number } | null = null

// Jump signal — consumed (reset to false) by PlayerEntity each frame
let _jumpRequested = false
let _jumpCooldownTimer = 0

export function consumeJumpRequest(): boolean {
  if (_jumpRequested) {
    _jumpRequested = false
    return true
  }

  return false
}

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

      const key = e.key.toLowerCase()
      keysDown.current.add(key)

      // Any WASD key cancels click-to-move
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        clickTarget = null
      }

      // Spacebar triggers jump
      if (key === ' ' && !useBoothStore.getState().isConnected && _jumpCooldownTimer <= 0) {
        _jumpRequested = true
        _jumpCooldownTimer = JUMP_COOLDOWN
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

      // Tick jump cooldown
      if (_jumpCooldownTimer > 0) {
        _jumpCooldownTimer -= dt
      }

      // Lock movement when at the DJ booth
      if (useBoothStore.getState().isConnected) {
        requestAnimationFrame(tick)
        return
      }

      const keys = keysDown.current
      let dx = 0
      let dy = 0

      // WASD input (camera-relative)
      let rawDx = 0
      let rawDy = 0

      if (keys.has('w') || keys.has('arrowup')) rawDy += 1
      if (keys.has('s') || keys.has('arrowdown')) rawDy -= 1
      if (keys.has('a') || keys.has('arrowleft')) rawDx -= 1
      if (keys.has('d') || keys.has('arrowright')) rawDx += 1

      const hasKeyInput = rawDx !== 0 || rawDy !== 0

      // Rotate WASD by camera azimuth so movement is relative to where the camera faces.
      // Camera convention: azimuth=0 → camera behind +Z looking toward -Z → "forward" = server +Y.
      // Rotation: server_dx = rawDx*cos(θ) - rawDy*sin(θ), server_dy = rawDx*sin(θ) + rawDy*cos(θ)
      if (hasKeyInput) {
        const cosA = Math.cos(cameraAzimuth)
        const sinA = Math.sin(cameraAzimuth)

        dx = rawDx * cosA - rawDy * sinA
        dy = rawDx * sinA + rawDy * cosA
      }

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
        const [newX, newY] = clampPosition(state.localX + dx, state.localY + dy)

        state.setLocalPosition(newX, newY)

        if (state.mySessionId) {
          setPlayerPosition(state.mySessionId, newX, newY)
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
