import Phaser from 'phaser'
import PlayerSelector from './PlayerSelector'
import { PlayerBehavior } from '../../../types/Players'
import Player from './Player'
import Network from '../services/Network'
import MusicBooth from '../items/MusicBooth'

import { phaserEvents, Event } from '../events/EventCenter'
import store from '../stores'
import { pushPlayerJoinedMessage } from '../stores/ChatStore'
import { ItemType } from '../../../types/Items'
import { RoomType } from '../../../types/Rooms'

export default class MyPlayer extends Player {
  private playerContainerBody: Phaser.Physics.Arcade.Body
  private musicBoothOnSit?: MusicBooth
  private moveTarget: { x: number; y: number } | null = null
  private movePath: Array<{ x: number; y: number }> | null = null
  private movePathIndex = 0
  private navLastPos: { x: number; y: number } | null = null
  private navNoProgressMs = 0
  private djBoothDepth: number | null = null

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

  private clearMoveNavigation() {
    this.clearMoveTarget()
    this.clearMovePath()
    this.navLastPos = null
    this.navNoProgressMs = 0
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
    _unusedKeyT?: Phaser.Input.Keyboard.Key
  ) {
    if (!cursors) return

    const body = this.body as Phaser.Physics.Arcade.Body | null
    if (!body) return

    const currentAnimKey = this.anims.currentAnim?.key ?? `${this.playerTexture}_idle_down`

    const item = playerSelector.selectedItem

    this.playerContainer.x = this.x
    this.playerContainer.y = this.y

    switch (this.playerBehavior) {
      case PlayerBehavior.IDLE:
        if (Phaser.Input.Keyboard.JustDown(keyR)) {
          console.log('////MyPlayer, update, switch, PlayerBehavior.IDLE, JustDown')
          switch (item?.itemType) {
            case ItemType.MUSIC_BOOTH:
              this.clearMoveNavigation()

              this.setVelocity(0, 0)
              body.setVelocity(0, 0)

              this.playerContainerBody.setVelocity(0, 0)

              const musicBootItem = item as MusicBooth
              musicBootItem.openDialog(network)
              musicBootItem.clearDialogBox()
              musicBootItem.setDialogBox('Press R to leave the DJ booth')
              musicBootItem.setVisible(false)
              this.musicBoothOnSit = musicBootItem
              this.djBoothDepth = this.depth
              if (this.playerTexture === 'adam') {
                const roomType = store.getState().room.roomType
                const boothAnimKey = roomType === RoomType.PUBLIC ? 'adam_djwip' : 'adam_boombox'
                this.play(boothAnimKey, true)
                this.updatePhysicsBodyForAnim(boothAnimKey)
                network.updatePlayerAction(this.x, this.y, boothAnimKey)
              }
              body.setImmovable(true)
              this.setDepth(musicBootItem.depth + 1)
              this.playerBehavior = PlayerBehavior.SITTING
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

          const dx = this.moveTarget.x - this.x
          const dy = this.moveTarget.y - this.y

          const distanceSq = dx * dx + dy * dy
          if (distanceSq <= 10 * 10) {
            if (this.movePath && this.movePathIndex < this.movePath.length - 1) {
              this.movePathIndex += 1
              this.moveTarget = this.movePath[this.movePathIndex]
            } else {
              this.clearMoveNavigation()
            }
          } else {
            const distance = Math.sqrt(distanceSq)
            vx = (dx / distance) * speed
            vy = (dy / distance) * speed
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

          const nextAnimKey =
            absVx >= absVy
              ? `${this.playerTexture}_${vx >= 0 ? 'run_right' : 'run_left'}`
              : `${this.playerTexture}_${vy >= 0 ? 'run_down' : 'run_up'}`

          this.play(nextAnimKey, true)
          network.updatePlayerAction(this.x, this.y, nextAnimKey)
        } else {
          const parts = currentAnimKey.split('_')
          parts[1] = 'idle'
          const newAnim = parts.join('_')
          // this prevents idle animation keeps getting called
          if (currentAnimKey !== newAnim) {
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
        if (Phaser.Input.Keyboard.JustDown(keyR)) {
          console.log('////MyPlayer, update, switch, PlayerBehavior.SITTING, JustDown')
          switch (item?.itemType) {
            case ItemType.MUSIC_BOOTH:
              this.musicBoothOnSit?.closeDialog(network)
              this.musicBoothOnSit?.clearDialogBox()
              this.musicBoothOnSit?.setDialogBox('Press R to be the DJ')
              this.musicBoothOnSit?.setVisible(true)
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
              this.playerBehavior = PlayerBehavior.IDLE
              break
          }
        }

        if (this.moveTarget) {
          this.clearMoveNavigation()
        }
        break
    }
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
