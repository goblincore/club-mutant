import Phaser from 'phaser'
import Player from './Player'
import MyPlayer from './MyPlayer'
import { sittingShiftData } from './Player'
import { Event, phaserEvents } from '../events/EventCenter'

export default class OtherPlayer extends Player {
  private targetPosition: [number, number]
  private lastUpdateTimestamp?: number
  private connectionBufferTime = 0
  private connected = false
  private playContainerBody: Phaser.Physics.Arcade.Body
  private myPlayer?: MyPlayer

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    id: string,
    name: string,
    frame?: string | number
  ) {
    super(scene, x, y, texture, id, frame)
    this.targetPosition = [x, y]

    this.playerName.setText(name)
    this.playContainerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body
  }

  updateOtherPlayer(field: string, value: number | string | boolean) {
    switch (field) {
      case 'name':
        if (typeof value === 'string') {
          this.playerName.setText(value)
        }
        break

      case 'x':
        if (typeof value === 'number') {
          this.targetPosition[0] = value
        }
        break

      case 'y':
        if (typeof value === 'number') {
          this.targetPosition[1] = value
        }
        break

      case 'anim':
        if (typeof value === 'string') {
          const requestedKey = value

          const requestedParts = requestedKey.split('_')
          const requestedTexture = requestedParts[0]

          if (
            requestedTexture &&
            requestedTexture !== this.playerTexture &&
            this.scene.textures.exists(requestedTexture)
          ) {
            this.playerTexture = requestedTexture
            this.setTexture(requestedTexture)
          }

          if (this.scene.anims.exists(requestedKey)) {
            // Action animations should interrupt current state and return to idle when complete
            const isActionAnim =
              requestedKey.includes('_hit1_') ||
              requestedKey.includes('_hit2_') ||
              requestedKey.includes('_punch_') ||
              requestedKey.includes('_burn_') ||
              requestedKey.includes('_flamethrower_')

            this.anims.play(requestedKey, !isActionAnim)
            this.updatePhysicsBodyForAnim(requestedKey)

            if (isActionAnim) {
              const parts = requestedKey.split('_')
              const dir = parts.slice(2).join('_') || 'down'

              this.once(`animationcomplete-${requestedKey}`, () => {
                const idleKey = `${this.playerTexture}_idle_${dir}`
                if (this.scene.anims.exists(idleKey)) {
                  this.anims.play(idleKey, true)
                  this.updatePhysicsBodyForAnim(idleKey)
                }
              })
            }
            return
          }

          const requestedDir =
            requestedParts.length >= 3 ? requestedParts.slice(2).join('_') : 'down'

          const fallbackCandidates = [
            `${this.playerTexture}_idle_${requestedDir}`,
            `${this.playerTexture}_walk_${requestedDir}`,
            `${this.playerTexture}_idle_down`,
          ]

          const fallbackKey = fallbackCandidates.find((k) => this.scene.anims.exists(k))

          if (fallbackKey) {
            this.anims.play(fallbackKey, true)
            this.updatePhysicsBodyForAnim(fallbackKey)
          }
        }
        break

      case 'readyToConnect':
        if (typeof value === 'boolean') {
          this.readyToConnect = value
        }
        break

      case 'videoConnected':
        if (typeof value === 'boolean') {
          this.videoConnected = value
        }
        break
    }
  }

  destroy(fromScene?: boolean) {
    this.playerContainer.destroy()

    super.destroy(fromScene)
  }

  /** preUpdate is called every frame for every game object. */
  preUpdate(t: number, dt: number) {
    super.preUpdate(t, dt)

    const body = this.body as Phaser.Physics.Arcade.Body | null
    if (!body) return

    // if Phaser has not updated the canvas (when the game tab is not active) for more than 1 sec
    // directly snap player to their current locations
    if (this.lastUpdateTimestamp && t - this.lastUpdateTimestamp > 750) {
      this.lastUpdateTimestamp = t
      this.x = this.targetPosition[0]
      this.y = this.targetPosition[1]
      this.playerContainer.x = this.targetPosition[0]
      this.playerContainer.y = this.targetPosition[1]
      return
    }

    this.lastUpdateTimestamp = t
    const currentAnimKey = this.anims.currentAnim?.key

    // Update depth based on Y position and animation state
    this.updateDepth(currentAnimKey)

    const speed = 200 // speed is in unit of pixels per second
    const delta = (speed / 1000) * dt
    let dx = this.targetPosition[0] - this.x
    let dy = this.targetPosition[1] - this.y

    // if the player is close enough to the target position, directly snap the player to that position
    if (Math.abs(dx) < delta) {
      this.x = this.targetPosition[0]
      this.playerContainer.x = this.targetPosition[0]
      dx = 0
    }
    if (Math.abs(dy) < delta) {
      this.y = this.targetPosition[1]
      this.playerContainer.y = this.targetPosition[1]
      dy = 0
    }

    // if the player is still far from target position, impose a constant velocity towards it
    let vx = 0
    let vy = 0
    if (dx > 0) vx += speed
    else if (dx < 0) vx -= speed
    if (dy > 0) vy += speed
    else if (dy < 0) vy -= speed

    // update character velocity
    this.setVelocity(vx, vy)
    if (vx !== 0 || vy !== 0) {
      body.velocity.setLength(speed)
    }
    // also update playerNameContainer velocity
    this.playContainerBody.setVelocity(vx, vy)
    if (vx !== 0 || vy !== 0) {
      this.playContainerBody.velocity.setLength(speed)
    }

    // Automatically manage idle/run animation based on local movement state
    // This prevents stale animations when server updates are delayed
    if (currentAnimKey) {
      const animParts = currentAnimKey.split('_')
      const animType = animParts[1]
      const animDir = animParts.length >= 3 ? animParts.slice(2).join('_') : 'down'

      // Don't interfere with special animations
      const isSpecialAnim =
        animType === 'sit' ||
        animType === 'djwip' ||
        animType === 'transform' ||
        animType === 'boombox' ||
        animType === 'hit1' ||
        animType === 'hit2' ||
        animType === 'punch' ||
        animType === 'burn' ||
        animType === 'flamethrower' ||
        currentAnimKey.includes('_action_') ||
        currentAnimKey.includes('_debug_')

      if (!isSpecialAnim) {
        const isMoving = vx !== 0 || vy !== 0
        const isRunAnim = animType === 'run'
        const isIdleAnim = animType === 'idle'

        // If moving but playing idle, switch to run
        if (isMoving && isIdleAnim) {
          const runKey = `${this.playerTexture}_run_${animDir}`
          if (this.scene.anims.exists(runKey)) {
            this.anims.play(runKey, true)
          }
        }
        // If stopped but playing run, switch to idle
        else if (!isMoving && isRunAnim) {
          const idleKey = `${this.playerTexture}_idle_${animDir}`
          if (this.scene.anims.exists(idleKey)) {
            this.anims.play(idleKey, true)
          }
        }
      }
    }

    // while currently connected with myPlayer
    // if myPlayer and the otherPlayer stop overlapping, delete video stream
    this.connectionBufferTime += dt
    if (
      this.connected &&
      !body.embedded &&
      body.touching.none &&
      this.connectionBufferTime >= 750
    ) {
      if (this.x < 610 && this.y > 515 && this.myPlayer!.x < 610 && this.myPlayer!.y > 515) return
      phaserEvents.emit(Event.PLAYER_DISCONNECTED, this.playerId)
      this.connectionBufferTime = 0
      this.connected = false
    }
  }

  private updateDepth(currentAnimKey: string | undefined) {
    let targetDepth = this.y

    if (
      currentAnimKey === 'mutant_djwip' ||
      currentAnimKey === 'mutant_transform' ||
      currentAnimKey === 'mutant_transform_reverse'
    ) {
      targetDepth = this.y - 1
    } else if (currentAnimKey === 'mutant_boombox') {
      targetDepth = this.y + 1
    }

    const animParts = (currentAnimKey ?? '').split('_')
    const animState = animParts[1]
    if (animState === 'sit') {
      const animDir = animParts[2]
      const sittingShift = sittingShiftData[animDir]
      if (sittingShift) {
        targetDepth += sittingShiftData[animDir][2]
      }
    }

    this.setDepth(targetDepth)
  }
}

declare global {
  namespace Phaser.GameObjects {
    interface GameObjectFactory {
      otherPlayer(
        x: number,
        y: number,
        texture: string,
        id: string,
        name: string,
        frame?: string | number
      ): OtherPlayer
    }
  }
}

Phaser.GameObjects.GameObjectFactory.register(
  'otherPlayer',
  function (
    this: Phaser.GameObjects.GameObjectFactory,
    x: number,
    y: number,
    texture: string,
    id: string,
    name: string,
    frame?: string | number
  ) {
    const sprite = new OtherPlayer(this.scene, x, y, texture, id, name, frame)

    this.displayList.add(sprite)
    this.updateList.add(sprite)

    this.scene.physics.world.enableBody(sprite, Phaser.Physics.Arcade.DYNAMIC_BODY)

    const body = sprite.body as Phaser.Physics.Arcade.Body | null
    if (body) {
      const collisionWidth = Math.max(sprite.width * 0.5, 10)
      const collisionHeight = Math.max(sprite.height * 0.25, 8)

      body.setImmovable(true)
      ;(body as unknown as { pushable: boolean }).pushable = false
      body.setSize(collisionWidth, collisionHeight)
      // Move hitbox up 15px from feet for better body centering
      body.setOffset((sprite.width - collisionWidth) * 0.5, sprite.height - collisionHeight - 15)
    }

    sprite.updatePhysicsBodyForAnim()

    return sprite
  }
)
