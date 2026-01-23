import Phaser from 'phaser'
import PlayerSelector from './PlayerSelector'
import { PlayerBehavior } from '../../../types/Players'
import Player from './Player'
import Network from '../services/Network'
import MusicBooth from '../items/MusicBooth'

import { phaserEvents, Event } from '../events/EventCenter'
import store from '../stores'
import { pushPlayerJoinedMessage } from '../stores/ChatStore'
import { disconnectFromMusicBooth } from '../stores/MusicBoothStore'
import { ItemType } from '../../../types/Items'
import { RoomType } from '../../../types/Rooms'

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
  private playingDebugAnim = false
  private debugAnimKey: string | null = null

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

  requestLeaveMusicBooth() {
    this.pendingLeaveMusicBooth = true
  }

  queueAutoEnterMusicBooth(musicBooth: MusicBooth, target: { x: number; y: number }) {
    this.pendingAutoEnterMusicBooth = musicBooth
    this.pendingAutoEnterTarget = target
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

          const boomboxAnimKey = 'adam_boombox'
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
          if (this.pendingAutoEnterMusicBooth.currentUser !== null) {
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

        if (Phaser.Input.Keyboard.JustDown(keyR)) {
          switch (item?.itemType) {
            case ItemType.MUSIC_BOOTH:
              this.enterMusicBooth(item as MusicBooth, network, body)
              break
          }
          return
        }
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
          let guard = 0

          while (this.moveTarget && guard < 5) {
            guard += 1

            const dx = this.moveTarget.x - this.x
            const dy = this.moveTarget.y - this.y
            const distanceSq = dx * dx + dy * dy

            if (distanceSq <= arriveDistanceSq) {
              if (this.movePath && this.movePathIndex < this.movePath.length - 1) {
                this.movePathIndex += 1
                this.moveTarget = this.movePath[this.movePathIndex]
                continue
              }

              if (
                this.pendingAutoEnterMusicBooth &&
                this.pendingAutoEnterTarget &&
                this.pendingAutoEnterMusicBooth.currentUser === null
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

            const distance = Math.sqrt(distanceSq)
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

          // 8-direction calculation: up_right, right, down_right, down, down_left, left, up_left
          // Diagonals trigger when both axes have significant velocity
          const diagonalThreshold = 0.5
          const isDiagonal =
            absVx > 0 &&
            absVy > 0 &&
            absVx / absVy > diagonalThreshold &&
            absVy / absVx > diagonalThreshold

          let dir: 'left' | 'right' | 'down' | 'down_left' | 'down_right' | 'up_left' | 'up_right'

          if (isDiagonal) {
            if (vy > 0) {
              dir = vx >= 0 ? 'down_right' : 'down_left'
            } else {
              dir = vx >= 0 ? 'up_right' : 'up_left'
            }
          } else if (absVx >= absVy) {
            dir = vx >= 0 ? 'right' : 'left'
          } else {
            dir = vy >= 0 ? 'down' : 'up_right'
          }

          const nextAnimKey = `${this.playerTexture}_run_${dir}`

          this.play(nextAnimKey, true)
          network.updatePlayerAction(this.x, this.y, nextAnimKey)
        } else {
          this.moveAnimAxis = null
          this.moveAnimDir = null

          const parts = currentAnimKey.split('_')
          parts[1] = 'idle'
          const newAnim = parts.join('_')
          // this prevents idle animation keeps getting called
          // also skip if a debug animation is playing
          if (currentAnimKey !== newAnim && !this.playingDebugAnim) {
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

          this.musicBoothOnSit.currentUser = null
          store.dispatch(disconnectFromMusicBooth())

          this.musicBoothOnSit.closeDialog(network)
          this.musicBoothOnSit.clearDialogBox()
          this.musicBoothOnSit.setDialogBox('Press R to be the DJ')
          this.djTransitionTarget = null

          const reverseKey = 'adam_transform_reverse'
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
            this.musicBoothOnSit.currentUser = null
          }
          store.dispatch(disconnectFromMusicBooth())
          this.musicBoothOnSit?.closeDialog(network)
          this.musicBoothOnSit?.clearDialogBox()
          this.musicBoothOnSit?.setDialogBox('Press R to be the DJ')
          this.djTransitionTarget = null

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
    if (musicBoothItem.currentUser !== null) return

    this.cancelPendingAutoEnterMusicBooth()

    this.clearMoveNavigation()

    this.setVelocity(0, 0)
    body.setVelocity(0, 0)

    this.playerContainerBody.setVelocity(0, 0)

    const standX = standTarget?.x ?? musicBoothItem.x - 20
    const standY = standTarget?.y ?? musicBoothItem.y + musicBoothItem.height * 0.25 - 70

    this.x = standX
    this.y = standY
    body.reset(standX, standY)
    this.playerContainer.x = standX
    this.playerContainer.y = standY
    this.djTransitionTarget = { x: standX, y: standY }

    musicBoothItem.openDialog(network)
    musicBoothItem.clearDialogBox()
    musicBoothItem.setDialogBox('Press R to leave the DJ booth')
    this.musicBoothOnSit = musicBoothItem
    this.djBoothDepth = this.depth
    if (this.playerTexture === 'adam' || this.playerTexture === 'mutant') {
      const roomType = store.getState().room.roomType
      const boothAnimKey = roomType === RoomType.PUBLIC ? 'adam_djwip' : 'adam_boombox'

      const faceDownKey = `${this.playerTexture}_idle_down`
      this.play(faceDownKey, true)

      const transformKey = 'adam_transform'
      this.play(transformKey, true)
      this.updatePhysicsBodyForAnim(transformKey)
      network.updatePlayerAction(this.x, this.y, transformKey)

      this.playerBehavior = PlayerBehavior.TRANSFORMING

      this.once(`animationcomplete-${transformKey}`, () => {
        if (this.playerBehavior !== PlayerBehavior.TRANSFORMING) return

        const target = this.djTransitionTarget
        if (target) {
          this.x = target.x
          this.y = target.y
          body.reset(target.x, target.y)
          this.playerContainer.x = target.x
          this.playerContainer.y = target.y
        }

        this.play(boothAnimKey, true)
        this.updatePhysicsBodyForAnim(boothAnimKey)
        network.updatePlayerAction(this.x, this.y, boothAnimKey)
        this.playerBehavior = PlayerBehavior.SITTING
        this.djTransitionTarget = null
      })
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
