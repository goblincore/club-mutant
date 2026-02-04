import Phaser from 'phaser'
import { PlayerBehavior } from '@club-mutant/types/Players'
/**
 * shifting distance for sitting animation
 * format: direction: [xShift, yShift, depthShift]
 */
export const sittingShiftData = {
  up: [0, 3, -10],
  down: [0, 3, 1],
  left: [0, -8, 10],
  right: [0, -8, 10],
}

export default class Player extends Phaser.Physics.Arcade.Sprite {
  playerId: string
  playerTexture: string
  playerBehavior = PlayerBehavior.IDLE
  readyToConnect = false
  videoConnected = false
  playerName: Phaser.GameObjects.Text
  playerContainer: Phaser.GameObjects.Container
  private playerDialogBubble: Phaser.GameObjects.Container
  private dialogBubbles: Array<{
    container: Phaser.GameObjects.Container
    timer?: Phaser.Time.TimerEvent
  }> = []
  private lastDialogBubbleAt = 0
  private bubblePool: Array<{
    container: Phaser.GameObjects.Container
    graphics: Phaser.GameObjects.Graphics
    text: Phaser.GameObjects.Text
    inUse: boolean
  }> = []
  private readonly POOL_SIZE = 10

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    id: string,
    frame?: string | number
  ) {
    super(scene, x, y, texture, frame)

    this.playerId = id
    this.playerTexture = texture
    this.setDepth(this.y)

    const idleAnimKey = `${this.playerTexture}_idle_down`
    if (this.scene.anims.exists(idleAnimKey)) {
      this.anims.play(idleAnimKey, true)
    }

    this.playerContainer = this.scene.add.container(this.x, this.y).setDepth(5000)

    // add dialogBubble to playerContainer
    this.playerDialogBubble = this.scene.add.container(0, -this.height * 0.5 - 24).setDepth(5000)
    this.playerContainer.add(this.playerDialogBubble)

    // add playerName to playerContainer
    this.playerName = this.scene.add
      .text(0, this.height * 0.5 + 10, '')
      .setFontFamily('Arial')
      .setFontSize(10)
      .setColor('#ffffff')
      .setOrigin(0.5)
    this.playerContainer.add(this.playerName)

    this.scene.physics.world.enable(this.playerContainer)
    const playContainerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body
    // Small collision box at the feet - allows sprite overlap but provides physics presence
    const collisionWidth = this.width * 0.15
    const collisionHeight = this.height * 0.08
    // Center horizontally, place at feet
    const offsetX = -collisionWidth * 0.5
    const offsetY = this.height * 0.5 - collisionHeight
    playContainerBody.setSize(collisionWidth, collisionHeight).setOffset(offsetX, offsetY)

    this.initBubblePool()
  }

  private initBubblePool() {
    for (let i = 0; i < this.POOL_SIZE; i++) {
      const container = this.scene.add.container(0, 0)
      container.setAlpha(0)
      container.setVisible(false)

      const graphics = this.scene.add.graphics()
      const text = this.scene.add
        .text(0, 0, '', { wordWrap: { width: 165, useAdvancedWrap: true } })
        .setFontFamily('Arial')
        .setFontSize(12)
        .setColor('#000000')
        .setOrigin(0.5)

      container.add(graphics)
      container.add(text)

      this.bubblePool.push({
        container,
        graphics,
        text,
        inUse: false,
      })
    }
  }

  private acquireBubble() {
    const available = this.bubblePool.find((b) => !b.inUse)
    if (available) {
      available.inUse = true
      available.container.y = 0
      return available
    }
    return null
  }

  private releaseBubble(container: Phaser.GameObjects.Container) {
    const pooled = this.bubblePool.find((b) => b.container === container)
    if (pooled) {
      pooled.inUse = false
      pooled.container.setAlpha(0)
      pooled.container.setVisible(false)
      pooled.container.removeFromDisplayList()
      pooled.graphics.clear()
      pooled.text.setText('')
    }
  }

  updatePhysicsBodyForAnim(animKey?: string) {
    const body = this.body as Phaser.Physics.Arcade.Body | null
    if (!body) return

    const key = animKey ?? this.anims.currentAnim?.key ?? ''
    const isDjAnim =
      key === 'mutant_boombox' ||
      key === 'mutant_djwip' ||
      key === 'mutant_transform' ||
      key === 'mutant_transform_reverse'

    const widthScale = isDjAnim ? 0.44 : 0.35
    const heightScale = isDjAnim ? 0.2 : 0.15

    const collisionWidth = Math.min(this.width, Math.max(this.width * widthScale, 18))
    const collisionHeight = Math.min(this.height, Math.max(this.height * heightScale, 12))

    const baseOffsetX = (this.width - collisionWidth) * 0.5
    const djFeetRightEdgeX = this.width * 0.72
    const offsetX = isDjAnim ? djFeetRightEdgeX - collisionWidth : baseOffsetX

    body.setSize(collisionWidth, collisionHeight)
    // Move hitbox up 15px from feet for better body centering
    body.setOffset(offsetX, this.height - collisionHeight - 15)
  }

  updateDialogBubble(content: string, scale = 1) {
    const now = this.scene.time.now

    const stackWindowMs = 2500
    if (now - this.lastDialogBubbleAt > stackWindowMs) {
      this.clearDialogBubble()
    }

    this.lastDialogBubbleAt = now

    this.playerDialogBubble.y = -this.height * 0.5 - 24
    this.playerDialogBubble.setScale(scale)

    const fadeInMs = 180
    const fadeOutMs = 260
    const holdMs = 5200
    const risePx = 10
    const stackGap = 4

    const dialogBubbleText = content.length <= 70 ? content : content.substring(0, 70).concat('...')

    // Acquire bubble from pool
    const pooledBubble = this.acquireBubble()
    if (!pooledBubble) {
      console.warn('Bubble pool exhausted')
      return
    }

    const { container: bubble, graphics, text: innerText } = pooledBubble

    // Update text content
    innerText.setText(dialogBubbleText)

    const innerTextHeight = innerText.height
    const innerTextWidth = innerText.width

    innerText.setY(0)
    const dialogBoxWidth = innerTextWidth + 10
    const dialogBoxHeight = innerTextHeight + 3
    const dialogBoxX = innerText.x - innerTextWidth / 2 - 5
    const dialogBoxY = innerText.y - innerTextHeight / 2 - 2

    // Update graphics
    graphics.clear()
    graphics
      .fillStyle(0xffffff, 1)
      .fillRoundedRect(dialogBoxX, dialogBoxY, dialogBoxWidth, dialogBoxHeight, 3)
      .lineStyle(1, 0x000000, 1)
      .strokeRoundedRect(dialogBoxX, dialogBoxY, dialogBoxWidth, dialogBoxHeight, 3)

    bubble.setAlpha(0)
    bubble.setVisible(true)

    this.playerDialogBubble.add(bubble)

    this.dialogBubbles.unshift({ container: bubble })

    let yOffset = 0
    for (let i = 0; i < this.dialogBubbles.length; i += 1) {
      const bubbleContainer = this.dialogBubbles[i].container
      const height = bubbleContainer.getBounds().height

      const targetY = -yOffset
      if (i === 0) {
        bubbleContainer.y = targetY + risePx
      }

      this.scene.tweens.add({
        targets: bubbleContainer,
        y: targetY,
        duration: 140,
        ease: 'Quad.Out',
      })

      yOffset += height + stackGap
    }

    this.scene.tweens.add({
      targets: bubble,
      alpha: 1,
      duration: fadeInMs,
      ease: 'Quad.Out',
    })

    const timer = this.scene.time.delayedCall(holdMs, () => {
      this.scene.tweens.add({
        targets: bubble,
        alpha: 0,
        y: bubble.y - risePx,
        duration: fadeOutMs,
        ease: 'Quad.In',
        onComplete: () => {
          const index = this.dialogBubbles.findIndex((b) => b.container === bubble)
          if (index !== -1) {
            const removed = this.dialogBubbles.splice(index, 1)[0]
            removed.timer?.remove(false)
          }

          this.releaseBubble(bubble)

          let relayoutOffset = 0
          for (let i = 0; i < this.dialogBubbles.length; i += 1) {
            const bubbleContainer = this.dialogBubbles[i].container
            const height = bubbleContainer.getBounds().height
            const targetY = -relayoutOffset

            this.scene.tweens.add({
              targets: bubbleContainer,
              y: targetY,
              duration: 140,
              ease: 'Quad.Out',
            })

            relayoutOffset += height + stackGap
          }
        },
      })
    })

    this.dialogBubbles[0].timer = timer
  }

  private clearDialogBubble() {
    for (const bubble of this.dialogBubbles) {
      bubble.timer?.remove(false)
      this.releaseBubble(bubble.container)
    }

    this.dialogBubbles = []

    this.playerDialogBubble.removeAll(false)
    this.playerDialogBubble.setScale(1)
  }
}
