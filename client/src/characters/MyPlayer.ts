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

export default class MyPlayer extends Player {
  private playerContainerBody: Phaser.Physics.Arcade.Body
  private musicBoothOnSit?: MusicBooth
  
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

  setPlayerName(name: string) {
    this.playerName.setText(name)
    this.setName(name)
    phaserEvents.emit(Event.MY_PLAYER_NAME_CHANGE, name)
    store.dispatch(pushPlayerJoinedMessage(name))
  }

  setPlayerTexture(texture: string) {
    this.playerTexture = texture
    this.anims.play(`${this.playerTexture}_idle_down`, true)
    phaserEvents.emit(Event.MY_PLAYER_TEXTURE_CHANGE, this.x, this.y, this.anims.currentAnim.key)
  }

  update(
    playerSelector: PlayerSelector,
    cursors: Phaser.Types.Input.Keyboard.CursorKeys,
    keyE: Phaser.Input.Keyboard.Key,
    keyR: Phaser.Input.Keyboard.Key,
    network: Network
  ) {
    if (!cursors) return

    const item = playerSelector.selectedItem
    
    switch (this.playerBehavior) {
      case PlayerBehavior.IDLE:
        if (Phaser.Input.Keyboard.JustDown(keyR)) {
          console.log("////MyPlayer, update, switch, PlayerBehavior.IDLE, JustDown")
          switch (item?.itemType) {
            case ItemType.MUSIC_BOOTH:
              const musicBootItem = item as MusicBooth
              musicBootItem.openDialog(network)
              musicBootItem.clearDialogBox()
              musicBootItem.setDialogBox('Press R to leave the DJ booth')
              this.musicBoothOnSit = musicBootItem
              this.playerBehavior = PlayerBehavior.SITTING
              break
          }
          return
        }
        const speed = 200
        let vx = 0
        let vy = 0
        if (cursors.left?.isDown) vx -= speed
        if (cursors.right?.isDown) vx += speed
        if (cursors.up?.isDown) {
          vy -= speed
          this.setDepth(this.y) //change player.depth if player.y changes
        }
        if (cursors.down?.isDown) {
          vy += speed
          this.setDepth(this.y) //change player.depth if player.y changes
        }
        // update character velocity
        this.setVelocity(vx, vy)
        this.body.velocity.setLength(speed)
        // also update playerNameContainer velocity
        this.playerContainerBody.setVelocity(vx, vy)
        this.playerContainerBody.velocity.setLength(speed)

        // update animation according to velocity and send new location and anim to server
        if (vx !== 0 || vy !== 0) network.updatePlayerAction(this.x, this.y, this.anims.currentAnim.key)
        if (vx > 0) {
          this.play(`${this.playerTexture}_run_right`, true)
        } else if (vx < 0) {
          this.play(`${this.playerTexture}_run_left`, true)
        } else if (vy > 0) {
          this.play(`${this.playerTexture}_run_down`, true)
        } else if (vy < 0) {
          this.play(`${this.playerTexture}_run_up`, true)
        } else {
          const parts = this.anims.currentAnim.key.split('_')
          parts[1] = 'idle'
          const newAnim = parts.join('_')
          // this prevents idle animation keeps getting called
          if (this.anims.currentAnim.key !== newAnim) {
            this.play(parts.join('_'), true)
            // send new location and anim to server
            network.updatePlayerAction(this.x, this.y, this.anims.currentAnim.key)
          }
        }
        break

      case PlayerBehavior.SITTING:
        // back to idle if player press E while sitting
        if (Phaser.Input.Keyboard.JustDown(keyR)) {
          console.log("////MyPlayer, update, switch, PlayerBehavior.SITTING, JustDown")
          switch (item?.itemType) {
            case ItemType.MUSIC_BOOTH:
              this.musicBoothOnSit?.closeDialog(network)
              this.musicBoothOnSit?.clearDialogBox()
              this.musicBoothOnSit?.setDialogBox('Press R to be the DJ')
              this.playerBehavior = PlayerBehavior.IDLE
              break
          }
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

    const collisionScale = [0.5, 0.2]
    sprite.body
      .setSize(sprite.width * collisionScale[0], sprite.height * collisionScale[1])
      .setOffset(
        sprite.width * (1 - collisionScale[0]) * 0.5,
        sprite.height * (1 - collisionScale[1])
      )

    return sprite
  }
)
