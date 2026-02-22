import type { NPC } from '../entities/NPC'
import type { DreamPlayer } from '../entities/DreamPlayer'
import type { DreamWorldDef } from '../types'

/**
 * NPC Behavior FSM — 100% client-side, no API needed.
 *
 * States:
 *   IDLE → WANDER (timer) or FACE_PLAYER (player enters range)
 *   WANDER → IDLE (arrived) or FACE_PLAYER (player enters range)
 *   FACE_PLAYER → CONVERSING (player sends message) or IDLE (player leaves)
 *   CONVERSING → IDLE (timeout or player leaves)
 *   FOLLOWING → CONVERSING or IDLE (timer expires)
 *   FLEEING → IDLE (timer expires)
 */

export type NpcState = 'idle' | 'wander' | 'face_player' | 'conversing' | 'following' | 'fleeing'

const WANDER_SPEED = 60 // px/s — half player speed
const IDLE_MIN_MS = 3000
const IDLE_MAX_MS = 8000
const CONVERSE_TIMEOUT_MS = 20000
const FOLLOW_DURATION_MS = 8000
const FLEE_DURATION_MS = 3000

export class NpcBehaviorFSM {
  state: NpcState = 'idle'
  private stateTimer = 0
  private wanderTarget: { x: number; y: number } | null = null
  private idleDuration = 0
  private lastConversationTime = 0

  constructor(
    private npc: NPC,
    private wanderRadius: number,
    private interactRadius: number,
    private stationary: boolean
  ) {
    this.resetIdleTimer()
  }

  update(dt: number, player: DreamPlayer, world: DreamWorldDef) {
    this.stateTimer += dt

    const distToPlayer = this.distanceTo(player.x, player.y)
    const inRange = distToPlayer <= this.interactRadius * world.tileSize

    switch (this.state) {
      case 'idle':
        this.updateIdle(dt, inRange, world)
        break
      case 'wander':
        this.updateWander(dt, inRange, player, world)
        break
      case 'face_player':
        this.updateFacePlayer(dt, inRange, player)
        break
      case 'conversing':
        this.updateConversing(dt, inRange, player)
        break
      case 'following':
        this.updateFollowing(dt, player, world)
        break
      case 'fleeing':
        this.updateFleeing(dt, player, world)
        break
    }
  }

  // External trigger from AI response
  triggerBehavior(behavior: string) {
    switch (behavior) {
      case 'follow':
        this.state = 'following'
        this.stateTimer = 0
        break
      case 'flee':
        this.state = 'fleeing'
        this.stateTimer = 0
        break
      case 'idle':
        this.transitionToIdle()
        break
      case 'wander':
        this.state = 'wander'
        this.stateTimer = 0
        this.wanderTarget = null
        break
      case 'turn_to_player':
        this.state = 'face_player'
        this.stateTimer = 0
        break
    }
  }

  onPlayerMessage() {
    this.state = 'conversing'
    this.stateTimer = 0
    this.lastConversationTime = Date.now()
  }

  // ── State updates ──

  private updateIdle(_dt: number, inRange: boolean, world: DreamWorldDef) {
    if (inRange) {
      this.state = 'face_player'
      this.stateTimer = 0
      return
    }

    if (this.stateTimer * 1000 >= this.idleDuration && !this.stationary) {
      // Pick a random walkable tile within wander radius
      this.pickWanderTarget(world)
      if (this.wanderTarget) {
        this.state = 'wander'
        this.stateTimer = 0
      } else {
        this.resetIdleTimer()
      }
    }
  }

  private updateWander(dt: number, inRange: boolean, _player: DreamPlayer, _world: DreamWorldDef) {
    if (inRange) {
      this.state = 'face_player'
      this.stateTimer = 0
      this.wanderTarget = null
      return
    }

    if (!this.wanderTarget) {
      this.transitionToIdle()
      return
    }

    // Move toward target
    const dx = this.wanderTarget.x - this.npc.x
    const dy = this.wanderTarget.y - this.npc.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 4) {
      // Arrived
      this.npc.setPosition(this.wanderTarget.x, this.wanderTarget.y)
      this.wanderTarget = null
      this.transitionToIdle()
      return
    }

    const speed = WANDER_SPEED * dt
    this.npc.x += (dx / dist) * speed
    this.npc.y += (dy / dist) * speed

    // Update facing direction
    this.npc.setDirection(this.getDirection(dx, dy))
    this.npc.playWalk()
  }

  private updateFacePlayer(_dt: number, inRange: boolean, player: DreamPlayer) {
    if (!inRange) {
      this.transitionToIdle()
      return
    }

    // Face toward player
    const dx = player.x - this.npc.x
    const dy = player.y - this.npc.y
    this.npc.setDirection(this.getDirection(dx, dy))
    this.npc.playIdle()
  }

  private updateConversing(_dt: number, inRange: boolean, player: DreamPlayer) {
    if (!inRange) {
      this.transitionToIdle()
      return
    }

    // Timeout if no messages for a while
    if (Date.now() - this.lastConversationTime > CONVERSE_TIMEOUT_MS) {
      this.transitionToIdle()
      return
    }

    // Face player
    const dx = player.x - this.npc.x
    const dy = player.y - this.npc.y
    this.npc.setDirection(this.getDirection(dx, dy))
    this.npc.playIdle()
  }

  private updateFollowing(dt: number, player: DreamPlayer, _world: DreamWorldDef) {
    if (this.stateTimer * 1000 >= FOLLOW_DURATION_MS) {
      this.state = 'conversing'
      this.stateTimer = 0
      this.lastConversationTime = Date.now()
      return
    }

    // Follow player but maintain 2-tile gap
    const dx = player.x - this.npc.x
    const dy = player.y - this.npc.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const minGap = 32 // ~2 tiles at 16px

    if (dist > minGap) {
      const speed = WANDER_SPEED * dt
      this.npc.x += (dx / dist) * speed
      this.npc.y += (dy / dist) * speed
      this.npc.setDirection(this.getDirection(dx, dy))
      this.npc.playWalk()
    } else {
      this.npc.setDirection(this.getDirection(dx, dy))
      this.npc.playIdle()
    }
  }

  private updateFleeing(dt: number, player: DreamPlayer, _world: DreamWorldDef) {
    if (this.stateTimer * 1000 >= FLEE_DURATION_MS) {
      this.transitionToIdle()
      return
    }

    // Move away from player
    const dx = this.npc.x - player.x
    const dy = this.npc.y - player.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 1) return

    const speed = WANDER_SPEED * 1.5 * dt
    this.npc.x += (dx / dist) * speed
    this.npc.y += (dy / dist) * speed
    this.npc.setDirection(this.getDirection(dx, dy))
    this.npc.playWalk()
  }

  // ── Helpers ──

  private transitionToIdle() {
    this.state = 'idle'
    this.stateTimer = 0
    this.wanderTarget = null
    this.npc.playIdle()
    this.resetIdleTimer()
  }

  private resetIdleTimer() {
    this.idleDuration = IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS)
  }

  private pickWanderTarget(world: DreamWorldDef) {
    const spawnTileX = this.npc.spawnTileX
    const spawnTileY = this.npc.spawnTileY
    const collisionLayer = world.layers.find((l) => l.name === 'collision')

    // Try a few random positions
    for (let attempt = 0; attempt < 8; attempt++) {
      const ox = Math.floor(Math.random() * (this.wanderRadius * 2 + 1)) - this.wanderRadius
      const oy = Math.floor(Math.random() * (this.wanderRadius * 2 + 1)) - this.wanderRadius
      const tx = spawnTileX + ox
      const ty = spawnTileY + oy

      if (tx < 0 || tx >= world.width || ty < 0 || ty >= world.height) continue

      const idx = ty * world.width + tx
      if (collisionLayer && collisionLayer.data[idx] > 0) continue

      this.wanderTarget = {
        x: tx * world.tileSize + world.tileSize / 2,
        y: ty * world.tileSize + world.tileSize / 2,
      }
      return
    }

    this.wanderTarget = null
  }

  private distanceTo(x: number, y: number): number {
    const dx = x - this.npc.x
    const dy = y - this.npc.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  private getDirection(dx: number, dy: number): string {
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (absDx > absDy * 2) return dx < 0 ? 'left' : 'right'
    if (absDy > absDx * 2) return dy < 0 ? 'up' : 'down'

    if (dx < 0 && dy < 0) return 'up_left'
    if (dx > 0 && dy < 0) return 'up_right'
    if (dx < 0 && dy > 0) return 'down_left'
    return 'down_right'
  }
}
