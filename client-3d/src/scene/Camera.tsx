import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { useGameStore } from '../stores/gameStore'

const WORLD_SCALE = 0.01
const LERP_SPEED = 5

// Spherical camera defaults
const DEFAULT_DISTANCE = 6
const DEFAULT_POLAR = 1.0 // radians from top — ~57° from vertical (fairly top-down)
const DEFAULT_AZIMUTH = 0 // radians — looking from +Z toward origin

const MIN_DISTANCE = 3
const MAX_DISTANCE = 15
const MIN_POLAR = 0.3 // almost top-down
const MAX_POLAR = 1.4 // near horizon

const ROTATE_SPEED = 0.005
const ZOOM_SPEED = 0.8
const DRAG_THRESHOLD = 5 // pixels — below this, it's a click not a drag

// Idle sway
const SWAY_AMPLITUDE = 15 * (Math.PI / 180) // 15 degrees in radians
const SWAY_PERIOD = 8 // seconds for a full back-and-forth cycle
const SWAY_RESUME_DELAY = 3 // seconds of no input before sway resumes

// Exported so ClickPlane can skip click-to-move after a camera drag
export let wasCameraDrag = false

// Orbit camera: follows player, hold-drag to rotate, scroll to zoom
export function FollowCamera() {
  const { camera, gl } = useThree()
  const targetRef = useRef(new THREE.Vector3())

  const azimuth = useRef(DEFAULT_AZIMUTH)
  const polar = useRef(DEFAULT_POLAR)
  const distance = useRef(DEFAULT_DISTANCE)

  const isDragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })

  const lastInteractionTime = useRef(0)
  const swayTime = useRef(0)
  const userAzimuth = useRef(DEFAULT_AZIMUTH) // tracks user's manual azimuth offset

  useEffect(() => {
    const canvas = gl.domElement

    const startMouse = { x: 0, y: 0 }
    let totalDragDist = 0

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return

      isDragging.current = true
      wasCameraDrag = false
      totalDragDist = 0
      startMouse.x = e.clientX
      startMouse.y = e.clientY
      lastMouse.current = { x: e.clientX, y: e.clientY }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return

      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y

      totalDragDist += Math.abs(dx) + Math.abs(dy)
      lastMouse.current = { x: e.clientX, y: e.clientY }

      // Only rotate if we've moved past the drag threshold
      if (totalDragDist > DRAG_THRESHOLD) {
        wasCameraDrag = true
        lastInteractionTime.current = performance.now() / 1000
        userAzimuth.current -= dx * ROTATE_SPEED
        polar.current = Math.max(MIN_POLAR, Math.min(MAX_POLAR, polar.current - dy * ROTATE_SPEED))
      }
    }

    const onPointerUp = () => {
      isDragging.current = false
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? ZOOM_SPEED : -ZOOM_SPEED
      distance.current = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance.current + delta))
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [gl])

  useFrame((_, delta) => {
    const state = useGameStore.getState()
    const myId = state.mySessionId
    if (!myId) return

    const me = state.players.get(myId)
    if (!me) return

    // Target = player world position, raised to character center height
    targetRef.current.set(me.x * WORLD_SCALE, 0.7, -me.y * WORLD_SCALE)

    // Idle sway: oscillate azimuth when user hasn't interacted recently
    const now = performance.now() / 1000
    const timeSinceInteraction = now - lastInteractionTime.current

    if (timeSinceInteraction > SWAY_RESUME_DELAY) {
      swayTime.current += delta
    } else {
      swayTime.current = 0
    }

    const swayOffset = Math.sin((swayTime.current / SWAY_PERIOD) * Math.PI * 2) * SWAY_AMPLITUDE
    azimuth.current = userAzimuth.current + swayOffset

    // Spherical → Cartesian offset
    const r = distance.current
    const phi = polar.current
    const theta = azimuth.current

    const offsetX = r * Math.sin(phi) * Math.sin(theta)
    const offsetY = r * Math.cos(phi)
    const offsetZ = r * Math.sin(phi) * Math.cos(theta)

    const desiredPos = targetRef.current.clone().add(new THREE.Vector3(offsetX, offsetY, offsetZ))

    camera.position.lerp(desiredPos, delta * LERP_SPEED)
    camera.lookAt(targetRef.current)
  })

  return null
}
