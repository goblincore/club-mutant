import Phaser from 'phaser'
import PlayerSelector from './PlayerSelector'
import { PlayerBehavior } from '@club-mutant/types/Players'
import Player from './Player'
import Network from '../services/Network'
import MusicBooth from '../items/MusicBooth'

import { phaserEvents, Event } from '../events/EventCenter'
import store from '../stores'
import { pushPlayerJoinedMessage } from '../stores/ChatStore'
import { disconnectFromMusicBooth } from '../stores/MusicBoothStore'
import { ItemType } from '@club-mutant/types/Items'
import { RoomType } from '@club-mutant/types/Rooms'

export default class MyPlayer extends Player {
  private playerContainerBody: Phaser.Physics.Arcade.Body
  private musicBoothOnSit?: MusicBooth
  private pendingLeaveMusicBooth = false
  private moveTarget: { x: number; y: number } | null = null
  private movePath: Array<{ x: number; y: number }> | null = null
  private movePathIndex = 0
  private navLastPos: { x: number; y: number } | null = null
  private navNoProgressMs = 0
  private moveAnimAxis: 'x' | 'y' | null = null
  private moveAnimDir: 'left' | 'right' | 'up' | 'down' | null = null
  private djBoothDepth: number | null = null

  private djTransitionTarget: { x: number; y: number } | null = null
  private pendingBoothScale: number | null = null
  private pendingBoothAnimKey: string | null = null
  private playingDebugAnim = false
  private debugAnimKey: string | null = null

  private playingActionAnim = false
  private actionAnimKey: string | null = null

  private pendingAutoEnterMusicBooth: MusicBooth | null = null

  private pendingAutoEnterTarget: { x: number; y: number } | null = null

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    id: string,
    frame?: string | number
  ) {
    super(scene, x, y, texture, id, frame)
    this.playerContainerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body
  }

  setMoveTarget(x: number, y: number) {
    this.movePath = null
    this.movePathIndex = 0
    this.moveTarget = { x, y }
    this.navLastPos = { x: this.x, y: this.y }
    this.navNoProgressMs = 0
  }

  setMovePath(path: Array<{ x: number; y: number }>) {
    this.movePath = path
    this.movePathIndex = 0

    if (path.length > 0) {
      this.moveTarget = path[0]
    } else {
      this.moveTarget = null
    }

    this.navLastPos = { x: this.x, y: this.y }
    this.navNoProgressMs = 0
  }

  clearMoveTarget() {
    this.moveTarget = null
  }

  clearMovePath() {
    this.movePath = null
    this.movePathIndex = 0
  }

  cancelMoveNavigation() {
    this.cancelPendingAutoEnterMusicBooth()
    this.clearMoveNavigation()
  }

  playActionAnim(animKey: string, network: Network, options?: { syncToServer?: boolean }) {
    if (!this.scene.anims.exists(animKey)) return

    const syncToServer = options?.syncToServer !== false

    const parts = animKey.split('_')
    const dir = parts.slice(2).join('_')
    const currentDir = dir || 'down'

    this.playingActionAnim = true
    this.actionAnimKey = animKey

    this.play(animKey, true)
    this.updatePhysicsBodyForAnim(animKey)

    if (syncToServer) {
      network.updatePlayerAction(this.x, this.y, animKey)
    }

    this.once(`animationcomplete-${animKey}`, () => {
      if (this.actionAnimKey === animKey) {
        this.playingActionAnim = false
        this.actionAnimKey = null
      }

      const idleKeyCandidate = `${this.playerTexture}_idle_${currentDir}`
      const idleKey = this.scene.anims.exists(idleKeyCandidate)
        ? idleKeyCandidate
        : `${this.playerTexture}_idle_down`

      this.play(idleKey, true)
      this.updatePhysicsBodyForAnim(idleKey)

      if (syncToServer) {
        network.updatePlayerAction(this.x, this.y, idleKey)
      }
    })
  }

  playHitAnim(animKey: string, network: Network) {
    if (!this.scene.anims.exists(animKey)) return

    const parts = animKey.split('_')
    const dir = parts.slice(2).join('_') || 'down'

    // Interrupt current state
    this.playingActionAnim = true
    this.actionAnimKey = animKey

    this.play(animKey, false) // false = do not ignore if already playing
    this.updatePhysicsBodyForAnim(animKey)

    this.once(`animationcomplete-${animKey}`, () => {
      if (this.actionAnimKey === animKey) {
        this.playingActionAnim = false
        this.actionAnimKey = null
      }

      const idleKey = `${this.playerTexture}_idle_${dir}`
      const finalIdle = this.scene.anims.exists(idleKey)
        ? idleKey
        : `${this.playerTexture}_idle_down`

      this.play(finalIdle, true)
      this.updatePhysicsBodyForAnim(finalIdle)

      // Sync the return to idle
      network.updatePlayerAction(this.x, this.y, finalIdle)
    })
  }

  playDebugAnim(animKey: string, network: Network, options?: { syncToServer?: boolean }) {
    if (!this.scene.anims.exists(animKey)) return

    const syncToServer = options?.syncToServer !== false

    const currentAnimKey = this.anims.currentAnim?.key ?? `${this.playerTexture}_idle_down`
    const currentParts = currentAnimKey.split('_')
    const currentDir = currentParts.slice(2).join('_') || 'down'

    this.playingDebugAnim = true
    this.debugAnimKey = animKey

    this.play(animKey, true)
    this.updatePhysicsBodyForAnim(animKey)

    if (syncToServer) {
      network.updatePlayerAction(this.x, this.y, animKey)
    }

    this.once(`animationcomplete-${animKey}`, () => {
      if (this.debugAnimKey === animKey) {
        this.playingDebugAnim = false
        this.debugAnimKey = null
      }

      const idleKeyCandidate = `${this.playerTexture}_idle_${currentDir}`
      const idleKey = this.scene.anims.exists(idleKeyCandidate)
        ? idleKeyCandidate
        : `${this.playerTexture}_idle_down`

      this.play(idleKey, true)
      this.updatePhysicsBodyForAnim(idleKey)

      if (syncToServer) {
        network.updatePlayerAction(this.x, this.y, idleKey)
      }
    })
  }

  requestLeaveMusicBooth() {
    this.pendingLeaveMusicBooth = true
  }

  queueAutoEnterMusicBooth(musicBooth: MusicBooth, target: { x: number; y: number }) {
    this.pendingAutoEnterMusicBooth = musicBooth
    this.pendingAutoEnterTarget = target
  }

  applyMusicBoothSeat(musicBooth: MusicBooth, seatIndex: number, network: Network) {
    if (typeof seatIndex !== 'number' || !Number.isFinite(seatIndex)) return

    const standPos = musicBooth.getStandPosition(seatIndex)
    const seatConfig = musicBooth.getSeatConfig(seatIndex)

    // Snap to booth position immediately
    const body = this.body as Phaser.Physics.Arcade.Body | null

    this.x = standPos.x
    this.y = standPos.y
    body?.reset(standPos.x, standPos.y)

    this.playerContainer.x = standPos.x
    this.playerContainer.y = standPos.y

    // Apply per-seat scale, flip, and depth
    this.setScale(seatConfig.scale)
    this.setFlipX(seatConfig.flip)
    network.updatePlayerScale(seatConfig.scale)

    this.setDepth(musicBooth.depth + seatConfig.depthOffset)

    this.djTransitionTarget = null
    this.pendingBoothScale = null

    // If enterMusicBooth stored a booth anim, play the transform sequence at the booth position
    const boothAnimKey = this.pendingBoothAnimKey

    if (boothAnimKey && this.playerBehavior === PlayerBehavior.TRANSFORMING) {
      this.pendingBoothAnimKey = null

      const transformKey = 'mutant_transform'
      this.play(transformKey, true)
      this.updatePhysicsBodyForAnim(transformKey)
      network.updatePlayerAction(standPos.x, standPos.y, transformKey)

      this.once(`animationcomplete-${transformKey}`, () => {
        if (this.playerBehavior !== PlayerBehavior.TRANSFORMING) return

        this.play(boothAnimKey, true)
        this.updatePhysicsBodyForAnim(boothAnimKey)
        network.updatePlayerAction(this.x, this.y, boothAnimKey)
        this.playerBehavior = PlayerBehavior.SITTING
      })
    } else {
      // Late-join reconciliation or non-transform path — just broadcast current state
      const currentAnimKey = this.anims.currentAnim?.key
      const animKey =
        typeof currentAnimKey === 'string' && currentAnimKey !== ''
          ? currentAnimKey
          : `${this.playerTexture}_idle_down`

      network.updatePlayerAction(standPos.x, standPos.y, animKey)
    }
  }

  /**
   * Public method to exit the booth programmatically (e.g., from Leave Queue button)
   * Returns true if successfully initiated exit, false if not at booth
   */
  exitBoothIfConnected(network: Network): boolean {
    if (!this.musicBoothOnSit) {
      console.log('[MyPlayer] exitBoothIfConnected: not at booth')
      return false
    }

    console.log('[MyPlayer] exitBoothIfConnected: exiting booth')
    const body = this.body as Phaser.Physics.Arcade.Body

    // Notify server to free the booth
    const boothId = this.musicBoothOnSit.id
    if (boothId !== undefined) {
      network.disconnectFromMusicBooth(boothId)
    }

    // Remove this user from the booth's current users
    this.musicBoothOnSit.removeCurrentUser(this.playerId)
    store.dispatch(disconnectFromMusicBooth())

    this.musicBoothOnSit.clearDialogBox()
    this.djTransitionTarget = null
    this.pendingBoothScale = null
    this.pendingBoothAnimKey = null
    this.setFlipX(false)

    const reverseKey = 'mutant_transform_reverse'
    this.play(reverseKey, true)
    this.updatePhysicsBodyForAnim(reverseKey)
    network.updatePlayerAction(this.x, this.y, reverseKey)

    body.setImmovable(true)
    this.playerBehavior = PlayerBehavior.TRANSFORMING

    this.once(`animationcomplete-${reverseKey}`, () => {
      if (this.playerBehavior !== PlayerBehavior.TRANSFORMING) return

      const idleAnimKey = `${this.playerTexture}_idle_down`
      this.play(idleAnimKey, true)
      this.updatePhysicsBodyForAnim(idleAnimKey)
      network.updatePlayerAction(this.x, this.y, idleAnimKey)

      body.setImmovable(false)
      if (this.djBoothDepth !== null) {
        this.setDepth(this.djBoothDepth)
        this.djBoothDepth = null
      } else {
        this.setDepth(this.y)
      }

      // Reset scale to normal
      this.setScale(1.0)
      network.updatePlayerScale(1.0)

      this.musicBoothOnSit = undefined
      this.playerBehavior = PlayerBehavior.IDLE
    })

    return true
  }

  private cancelPendingAutoEnterMusicBooth() {
    this.pendingAutoEnterMusicBooth = null
    this.pendingAutoEnterTarget = null
  }

  private clearMoveNavigation() {
    this.clearMoveTarget()
    this.clearMovePath()
    this.navLastPos = null
    this.navNoProgressMs = 0
    this.moveAnimAxis = null
    this.moveAnimDir = null
  }

  updateCollisionBody() {
    this.updatePhysicsBodyForAnim()
  }

  setPlayerName(name: string) {
    this.playerName.setText(name)
    this.setName(name)
    phaserEvents.emit(Event.MY_PLAYER_NAME_CHANGE, name)
    store.dispatch(pushPlayerJoinedMessage(name))
  }

  setPlayerTexture(texture: string) {
    this.playerTexture = texture
    const idleKey = `${this.playerTexture}_idle_down`
    this.anims.play(idleKey, true)
    this.updateCollisionBody()
    phaserEvents.emit(Event.MY_PLAYER_TEXTURE_CHANGE, this.x, this.y, idleKey)
  }

  update(
    playerSelector: PlayerSelector,
    cursors: Phaser.Types.Input.Keyboard.CursorKeys,
    wasd: {
      up: Phaser.Input.Keyboard.Key
      down: Phaser.Input.Keyboard.Key
      left: Phaser.Input.Keyboard.Key
      right: Phaser.Input.Keyboard.Key
    },
    keyE: Phaser.Input.Keyboard.Key,
    keyR: Phaser.Input.Keyboard.Key,
    network: Network,
    dt: number,
    keyT?: Phaser.Input.Keyboard.Key,
    debugKeys?: {
      key1: Phaser.Input.Keyboard.Key
      key2: Phaser.Input.Keyboard.Key
      key3: Phaser.Input.Keyboard.Key
      key4: Phaser.Input.Keyboard.Key
    }
  ) {
    if (!cursors) return

    const body = this.body as Phaser.Physics.Arcade.Body | null
    if (!body) return

    const currentAnimKey = this.anims.currentAnim?.key ?? `${this.playerTexture}_idle_down`

    if (this.playingDebugAnim && this.debugAnimKey && currentAnimKey !== this.debugAnimKey) {
      this.playingDebugAnim = false
      this.debugAnimKey = null
    }

    if (this.playingActionAnim && this.actionAnimKey && currentAnimKey !== this.actionAnimKey) {
      this.playingActionAnim = false
      this.actionAnimKey = null
    }

    const item = playerSelector.selectedItem

    this.playerContainer.x = this.x
    this.playerContainer.y = this.y

    // Debug keys for testing burn (1), flamethrower (2), and punch (3) animations
    if (
      debugKeys &&
      this.playerTexture === 'mutant' &&
      this.playerBehavior === PlayerBehavior.IDLE
    ) {
      // Extract current direction from animation key (e.g., "mutant_idle_down" -> "down")
      const animParts = currentAnimKey.split('_')
      const currentDir = animParts.slice(2).join('_') || 'down'

      const playDebugAnim = (animKey: string) => {
        if (!this.scene.anims.exists(animKey)) return

        this.playingDebugAnim = true
        this.debugAnimKey = animKey
        this.play(animKey, true)
        network.updatePlayerAction(this.x, this.y, animKey)

        this.once(`animationcomplete-${animKey}`, () => {
          if (this.debugAnimKey === animKey) {
            this.playingDebugAnim = false
            this.debugAnimKey = null
          }

          const idleKey = `${this.playerTexture}_idle_${currentDir}`
          this.play(idleKey, true)
          network.updatePlayerAction(this.x, this.y, idleKey)
        })
      }

      if (Phaser.Input.Keyboard.JustDown(debugKeys.key1)) {
        const burnKey = `mutant_burn_${currentDir}`
        playDebugAnim(burnKey)
      }

      if (Phaser.Input.Keyboard.JustDown(debugKeys.key2)) {
        const flameKey = `mutant_flamethrower_${currentDir}`
        playDebugAnim(flameKey)
      }

      if (Phaser.Input.Keyboard.JustDown(debugKeys.key3)) {
        const punchKey = `mutant_punch_${currentDir}`
        playDebugAnim(punchKey)
      }

      if (Phaser.Input.Keyboard.JustDown(debugKeys.key4)) {
        const hitKey = `mutant_hit1_${currentDir}`
        playDebugAnim(hitKey)
      }
    }

    if (keyT && Phaser.Input.Keyboard.JustDown(keyT)) {
      const connectedIndex = store.getState().musicBooth.musicBoothIndex
      const isDj = connectedIndex !== null

      if (this.playerBehavior === PlayerBehavior.IDLE) {
        if (!isDj && (this.playerTexture === 'adam' || this.playerTexture === 'mutant')) {
          this.clearMoveNavigation()

          this.setVelocity(0, 0)
          body.setVelocity(0, 0)
          this.playerContainerBody.setVelocity(0, 0)

          const boomboxAnimKey = 'mutant_boombox'
          this.play(boomboxAnimKey, true)
          this.updatePhysicsBodyForAnim(boomboxAnimKey)
          network.updatePlayerAction(this.x, this.y, boomboxAnimKey)

          body.setImmovable(true)
          this.playerBehavior = PlayerBehavior.BOOMBOX
          return
        }
      } else if (this.playerBehavior === PlayerBehavior.BOOMBOX) {
        this.clearMoveNavigation()

        this.setVelocity(0, 0)
        body.setVelocity(0, 0)
        this.playerContainerBody.setVelocity(0, 0)

        const idleAnimKey = `${this.playerTexture}_idle_down`
        this.play(idleAnimKey, true)
        this.updatePhysicsBodyForAnim(idleAnimKey)
        network.updatePlayerAction(this.x, this.y, idleAnimKey)

        body.setImmovable(false)
        this.playerBehavior = PlayerBehavior.IDLE
        return
      }
    }

    switch (this.playerBehavior) {
      case PlayerBehavior.IDLE:
        if (this.pendingLeaveMusicBooth) {
          this.pendingLeaveMusicBooth = false
        }
        if (this.pendingAutoEnterMusicBooth && this.pendingAutoEnterTarget) {
          if (this.pendingAutoEnterMusicBooth.isFull()) {
            this.cancelPendingAutoEnterMusicBooth()
          } else {
            const dx = this.pendingAutoEnterTarget.x - this.x
            const dy = this.pendingAutoEnterTarget.y - this.y
            const distanceSq = dx * dx + dy * dy

            if (distanceSq <= 24 * 24) {
              const booth = this.pendingAutoEnterMusicBooth
              this.cancelPendingAutoEnterMusicBooth()
              this.enterMusicBooth(booth, network, body)
              return
            }

            if (!this.moveTarget) {
              this.setMoveTarget(this.pendingAutoEnterTarget.x, this.pendingAutoEnterTarget.y)
            }
          }
        }

        // NOTE: Press R booth entry is now deprecated - use click-to-join instead
        // if (Phaser.Input.Keyboard.JustDown(keyR)) {
        //   switch (item?.itemType) {
        //     case ItemType.MUSIC_BOOTH:
        //       this.enterMusicBooth(item as MusicBooth, network, body)
        //       break
        //   }
        //   return
        // }
        const speed = 200

        const leftDown = Boolean(cursors.left?.isDown || wasd.left.isDown)
        const rightDown = Boolean(cursors.right?.isDown || wasd.right.isDown)
        const upDown = Boolean(cursors.up?.isDown || wasd.up.isDown)
        const downDown = Boolean(cursors.down?.isDown || wasd.down.isDown)

        const hasKeyboardInput = Boolean(leftDown || rightDown || upDown || downDown)

        if (hasKeyboardInput && this.moveTarget) {
          this.cancelPendingAutoEnterMusicBooth()
          this.clearMoveNavigation()
        }

        let vx = 0
        let vy = 0

        if (hasKeyboardInput) {
          if (leftDown) vx -= speed
          if (rightDown) vx += speed
          if (upDown) {
            vy -= speed
            this.setDepth(this.y) //change player.depth if player.y changes
          }
          if (downDown) {
            vy += speed
            this.setDepth(this.y) //change player.depth if player.y changes
          }
        } else if (this.moveTarget) {
          if (!this.navLastPos) {
            this.navLastPos = { x: this.x, y: this.y }
          }

          const movedDx = this.x - this.navLastPos.x
          const movedDy = this.y - this.navLastPos.y
          const movedSq = movedDx * movedDx + movedDy * movedDy

          if (movedSq < 0.5 * 0.5) {
            this.navNoProgressMs += dt

            if (this.navNoProgressMs >= 650) {
              this.clearMoveNavigation()
              if (!this.moveTarget) break
            }
          } else {
            this.navNoProgressMs = 0
            this.navLastPos = { x: this.x, y: this.y }
          }

          if (!this.moveTarget) break

          const arriveDistanceSq = 4 * 4
          const maxStep = (speed * dt) / 1000
          let guard = 0

          while (this.moveTarget && guard < 5) {
            guard += 1

            const dx = this.moveTarget.x - this.x
            const dy = this.moveTarget.y - this.y
            const distanceSq = dx * dx + dy * dy
            const distance = Math.sqrt(distanceSq)

            const snapDistance = Math.max(2, maxStep)

            if (distanceSq <= arriveDistanceSq || distance <= snapDistance) {
              if (this.movePath && this.movePathIndex < this.movePath.length - 1) {
                this.movePathIndex += 1
                this.moveTarget = this.movePath[this.movePathIndex]
                continue
              }

              if (
                this.pendingAutoEnterMusicBooth &&
                this.pendingAutoEnterTarget &&
                !this.pendingAutoEnterMusicBooth.isFull()
              ) {
                const pdx = this.pendingAutoEnterTarget.x - this.x
                const pdy = this.pendingAutoEnterTarget.y - this.y
                const pendingDistanceSq = pdx * pdx + pdy * pdy

                if (pendingDistanceSq <= 24 * 24) {
                  const booth = this.pendingAutoEnterMusicBooth
                  this.cancelPendingAutoEnterMusicBooth()
                  this.enterMusicBooth(booth, network, body)
                  return
                }
              }

              const finalTarget = this.moveTarget
              this.clearMoveNavigation()
              this.setPosition(finalTarget.x, finalTarget.y)
              this.setDepth(finalTarget.y)
              break
            }
            vx = (dx / distance) * speed
            vy = (dy / distance) * speed
            break
          }
        }

        this.setDepth(this.y)

        // update character velocity
        this.setVelocity(vx, vy)
        body.velocity.setLength(speed)
        // also update playerNameContainer velocity
        this.playerContainerBody.setVelocity(vx, vy)
        this.playerContainerBody.velocity.setLength(speed)

        // update animation according to velocity and send new location and anim to server
        if (vx !== 0 || vy !== 0) {
          const absVx = Math.abs(vx)
          const absVy = Math.abs(vy)

          const supportsDiagonalAnims = this.playerTexture === 'mutant'

          // 8-direction calculation: up_right, right, down_right, down, down_left, left, up_left
          // Diagonals trigger when both axes have significant velocity
          const diagonalThreshold = 0.5
          const isDiagonal =
            supportsDiagonalAnims &&
            absVx > 0 &&
            absVy > 0 &&
            absVx / absVy > diagonalThreshold &&
            absVy / absVx > diagonalThreshold

          let dir:
            | 'left'
            | 'right'
            | 'down'
            | 'up'
            | 'down_left'
            | 'down_right'
            | 'up_left'
            | 'up_right'

          if (isDiagonal) {
            if (vy > 0) {
              dir = vx >= 0 ? 'down_right' : 'down_left'
            } else {
              dir = vx >= 0 ? 'up_right' : 'up_left'
            }
          } else if (absVx >= absVy) {
            dir = vx >= 0 ? 'right' : 'left'
          } else {
            if (vy >= 0) {
              dir = 'down'
            } else {
              if (supportsDiagonalAnims) {
                const vxDeadzone = speed * 0.2
                const currentDir = currentAnimKey.split('_').slice(2).join('_')

                if (
                  Math.abs(vx) < vxDeadzone &&
                  (currentDir === 'up_left' || currentDir === 'up_right')
                ) {
                  dir = currentDir
                } else {
                  dir = vx >= 0 ? 'up_right' : 'up_left'
                }
              } else {
                dir = 'up'
              }
            }
          }

          const nextAnimKey = `${this.playerTexture}_run_${dir}`

          if (this.scene.anims.exists(nextAnimKey)) {
            this.play(nextAnimKey, true)
            network.updatePlayerAction(this.x, this.y, nextAnimKey)
          } else {
            const fallbackCandidates = [
              `${this.playerTexture}_run_down`,
              `${this.playerTexture}_run_right`,
              `${this.playerTexture}_run_left`,
              `${this.playerTexture}_run_up`,
            ]

            const fallbackKey = fallbackCandidates.find((k) => this.scene.anims.exists(k))

            if (fallbackKey) {
              this.play(fallbackKey, true)
              network.updatePlayerAction(this.x, this.y, fallbackKey)
            }
          }
        } else {
          this.moveAnimAxis = null
          this.moveAnimDir = null

          const parts = currentAnimKey.split('_')
          parts[1] = 'idle'
          const newAnim = parts.join('_')
          // this prevents idle animation keeps getting called
          // also skip if a one-shot animation is playing
          if (currentAnimKey !== newAnim && !this.playingDebugAnim && !this.playingActionAnim) {
            this.play(parts.join('_'), true)
            // send new location and anim to server
            network.updatePlayerAction(this.x, this.y, newAnim)
          }
        }
        break

      case PlayerBehavior.SITTING:
        this.setVelocity(0, 0)
        body.setVelocity(0, 0)

        this.playerContainerBody.setVelocity(0, 0)

        // back to idle if player press E while sitting
        if (Phaser.Input.Keyboard.JustDown(keyR) || this.pendingLeaveMusicBooth) {
          this.pendingLeaveMusicBooth = false
          console.log('////MyPlayer, update, switch, PlayerBehavior.SITTING, JustDown')

          if (!this.musicBoothOnSit) return

          this.musicBoothOnSit.removeCurrentUser(this.playerId)
          store.dispatch(disconnectFromMusicBooth())

          const boothId = this.musicBoothOnSit.id
          if (boothId !== undefined) {
            network.disconnectFromMusicBooth(boothId)
          }

          this.musicBoothOnSit.closeDialog(network, this.playerId)
          this.musicBoothOnSit.clearDialogBox()
          // this.musicBoothOnSit.setDialogBox('Press R to be the DJ')
          this.djTransitionTarget = null
          this.pendingBoothScale = null
          this.pendingBoothAnimKey = null
          this.setFlipX(false)

          const reverseKey = 'mutant_transform_reverse'
          this.play(reverseKey, true)
          this.updatePhysicsBodyForAnim(reverseKey)
          network.updatePlayerAction(this.x, this.y, reverseKey)

          body.setImmovable(true)
          this.playerBehavior = PlayerBehavior.TRANSFORMING

          this.once(`animationcomplete-${reverseKey}`, () => {
            if (this.playerBehavior !== PlayerBehavior.TRANSFORMING) return

            const idleAnimKey = `${this.playerTexture}_idle_down`
            this.play(idleAnimKey, true)
            this.updatePhysicsBodyForAnim(idleAnimKey)
            network.updatePlayerAction(this.x, this.y, idleAnimKey)

            body.setImmovable(false)
            if (this.djBoothDepth !== null) {
              this.setDepth(this.djBoothDepth)
              this.djBoothDepth = null
            } else {
              this.setDepth(this.y)
            }

            // Reset scale to normal
            this.setScale(1.0)
            network.updatePlayerScale(1.0)

            this.musicBoothOnSit = undefined
            this.playerBehavior = PlayerBehavior.IDLE
          })
        }

        if (this.moveTarget) {
          this.clearMoveNavigation()
        }
        break

      case PlayerBehavior.TRANSFORMING:
        this.setVelocity(0, 0)
        body.setVelocity(0, 0)

        this.playerContainerBody.setVelocity(0, 0)

        if (Phaser.Input.Keyboard.JustDown(keyR) || this.pendingLeaveMusicBooth) {
          this.pendingLeaveMusicBooth = false
          if (this.musicBoothOnSit) {
            this.musicBoothOnSit.removeCurrentUser(this.playerId)

            const boothId = this.musicBoothOnSit.id
            if (boothId !== undefined) {
              network.disconnectFromMusicBooth(boothId)
            }
          }
          store.dispatch(disconnectFromMusicBooth())
          this.musicBoothOnSit?.closeDialog(network, this.playerId)
          this.musicBoothOnSit?.clearDialogBox()
          // this.musicBoothOnSit?.setDialogBox('Press R to be the DJ')
          this.djTransitionTarget = null
          this.pendingBoothScale = null
          this.pendingBoothAnimKey = null
          this.setFlipX(false)

          const idleAnimKey = `${this.playerTexture}_idle_down`
          this.play(idleAnimKey, true)
          this.updatePhysicsBodyForAnim(idleAnimKey)
          network.updatePlayerAction(this.x, this.y, idleAnimKey)

          body.setImmovable(false)

          if (this.djBoothDepth !== null) {
            this.setDepth(this.djBoothDepth)
            this.djBoothDepth = null
          } else {
            this.setDepth(this.y)
          }

          // Reset scale to normal
          this.setScale(1.0)
          network.updatePlayerScale(1.0)

          this.musicBoothOnSit = undefined
          this.playerBehavior = PlayerBehavior.IDLE
          break
        }

        if (this.moveTarget) {
          this.clearMoveNavigation()
        }
        break

      case PlayerBehavior.BOOMBOX:
        this.setVelocity(0, 0)
        body.setVelocity(0, 0)
        this.playerContainerBody.setVelocity(0, 0)

        if (this.moveTarget) {
          this.clearMoveNavigation()
        }
        break
    }
  }

  private enterMusicBooth(
    musicBoothItem: MusicBooth,
    network: Network,
    body: Phaser.Physics.Arcade.Body,
    standTarget?: { x: number; y: number }
  ) {
    // Check if booth is full
    if (musicBoothItem.isFull()) {
      console.log('[MyPlayer] enterMusicBooth: booth is full')
      return
    }

    this.cancelPendingAutoEnterMusicBooth()

    this.clearMoveNavigation()

    this.setVelocity(0, 0)
    body.setVelocity(0, 0)

    this.playerContainerBody.setVelocity(0, 0)

    musicBoothItem.openDialog(network)
    musicBoothItem.clearDialogBox()
    // musicBoothItem.setDialogBox('Press R to leave the DJ booth')
    this.musicBoothOnSit = musicBoothItem
    this.djBoothDepth = this.depth
    if (this.playerTexture === 'adam' || this.playerTexture === 'mutant') {
      const roomType = store.getState().room.roomType
      const boothAnimKey = roomType === RoomType.PUBLIC ? 'mutant_djwip' : 'mutant_boombox'

      // Face down while waiting for the server to assign a seat
      const faceDownKey = `${this.playerTexture}_idle_down`
      this.play(faceDownKey, true)

      // Store the booth anim — applyMusicBoothSeat will snap to the booth
      // position first, then play the transform → booth anim sequence there.
      this.pendingBoothAnimKey = boothAnimKey
      this.playerBehavior = PlayerBehavior.TRANSFORMING
    }
    body.setImmovable(true)
    this.setDepth(musicBoothItem.depth - 1)
  }
}

declare global {
  namespace Phaser.GameObjects {
    interface GameObjectFactory {
      myPlayer(x: number, y: number, texture: string, id: string, frame?: string | number): MyPlayer
    }
  }
}

Phaser.GameObjects.GameObjectFactory.register(
  'myPlayer',
  function (
    this: Phaser.GameObjects.GameObjectFactory,
    x: number,
    y: number,
    texture: string,
    id: string,
    frame?: string | number
  ) {
    const sprite = new MyPlayer(this.scene, x, y, texture, id, frame)

    this.displayList.add(sprite)
    this.updateList.add(sprite)

    this.scene.physics.world.enableBody(sprite, Phaser.Physics.Arcade.DYNAMIC_BODY)

    sprite.updateCollisionBody()

    return sprite
  }
)
