import Phaser from 'phaser'
import type { DreamWorldDef } from '../types'

const MOVE_SPEED = 120 // pixels per second
const ARRIVAL_THRESHOLD = 4 // pixels — stop when this close to click target

/**
 * DreamPlayer — the player character in the dream.
 * Uses mutant_ripped multi-atlas with standard mutant animations.
 * Smooth continuous movement with tile-based collision checking.
 * Supports both WASD keyboard movement and click-to-move.
 */
export class DreamPlayer extends Phaser.GameObjects.Sprite {
  private direction: string = 'down'
  private moving = false
  private prevDir = ''

  // Click-to-move state
  private moveTarget: { x: number; y: number } | null = null

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Use correct frame name format: "mutant-unarmed-idle-48" (frame 48 = down idle first frame)
    super(scene, x, y, 'mutant_ripped', 'mutant-unarmed-idle-48')
    scene.add.existing(this)
    this.setDepth(10)
    this.setScale(0.5) // Scale down — ripped frames are large

    // Start with idle animation
    this.play('mutant_idle_down')
  }

  /** Set a click-to-move target. Cleared when arrived or when keyboard input is pressed. */
  setMoveTarget(worldX: number, worldY: number) {
    this.moveTarget = { x: worldX, y: worldY }
  }

  /** Clear any active click-to-move target */
  clearMoveTarget() {
    this.moveTarget = null
  }

  /**
   * @param dt - delta time in seconds
   */
  handleMovement(left: boolean, right: boolean, up: boolean, down: boolean, world: DreamWorldDef, dt: number) {
    let dx = 0
    let dy = 0

    const hasKeyboardInput = left || right || up || down

    // Keyboard input cancels click-to-move
    if (hasKeyboardInput) {
      this.moveTarget = null
    }

    if (hasKeyboardInput) {
      if (left) dx -= 1
      if (right) dx += 1
      if (up) dy -= 1
      if (down) dy += 1
    } else if (this.moveTarget) {
      // Click-to-move — compute direction toward target
      dx = this.moveTarget.x - this.x
      dy = this.moveTarget.y - this.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < ARRIVAL_THRESHOLD) {
        // Arrived at target
        this.moveTarget = null
        dx = 0
        dy = 0
      }
      // dx/dy will be normalized below
    }

    if (dx === 0 && dy === 0) {
      // No input — play idle
      if (this.moving) {
        this.moving = false
        this.play(`mutant_idle_${this.direction}`, true)
      }
      return
    }

    // Determine direction from raw dx/dy (before normalization)
    const newDir = this.computeDirection(dx, dy)
    this.direction = newDir

    // Normalize movement vector
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 0) {
      dx /= len
      dy /= len
    }

    // Calculate new position using delta time
    const step = MOVE_SPEED * dt
    const newX = this.x + dx * step
    const newY = this.y + dy * step

    // Check collision at new position
    if (!this.isBlocked(newX, newY, world)) {
      this.x = newX
      this.y = newY
    } else {
      // Try sliding along walls
      if (!this.isBlocked(newX, this.y, world)) {
        this.x = newX
      } else if (!this.isBlocked(this.x, newY, world)) {
        this.y = newY
      } else {
        // Fully blocked — cancel click-to-move target
        this.moveTarget = null
      }
    }

    // Play walk animation (only change if direction changed or just started moving)
    if (!this.moving || this.prevDir !== newDir) {
      this.moving = true
      this.prevDir = newDir
      this.play(`mutant_walk_${this.direction}`, true)
    }
  }

  /** Compute 8-directional string from raw dx/dy */
  private computeDirection(dx: number, dy: number): string {
    // Use atan2 for smooth 8-direction mapping
    const angle = Math.atan2(dy, dx) // radians, 0 = right
    const deg = ((angle * 180) / Math.PI + 360) % 360

    // 8 sectors of 45° each, offset by 22.5° so "right" spans -22.5 to 22.5
    if (deg < 22.5 || deg >= 337.5) return 'right'
    if (deg < 67.5) return 'down_right'
    if (deg < 112.5) return 'down'
    if (deg < 157.5) return 'down_left'
    if (deg < 202.5) return 'left'
    if (deg < 247.5) return 'up_left'
    if (deg < 292.5) return 'up'
    return 'up_right'
  }

  private isBlocked(x: number, y: number, world: DreamWorldDef): boolean {
    const tileX = Math.floor(x / world.tileSize)
    const tileY = Math.floor(y / world.tileSize)

    // Out of bounds
    if (tileX < 0 || tileX >= world.width || tileY < 0 || tileY >= world.height) {
      return true
    }

    // Check collision layer
    const collisionLayer = world.layers.find((l) => l.name === 'collision')
    if (!collisionLayer) return false

    const idx = tileY * world.width + tileX
    return collisionLayer.data[idx] > 0
  }

  stopMoving() {
    if (this.moving) {
      this.moving = false
      this.play(`mutant_idle_${this.direction}`, true)
    }
  }
}
