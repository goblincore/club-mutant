import Phaser from 'phaser'
import { useDreamClientStore } from '../../stores/dreamClientStore'
import { sendToParent } from '../../bridge/bridgeTypes'
import type { DreamCollectible } from '../types'

/**
 * Collectible — A sparkle pickup that persists via the server.
 * Rendered as an animated glow circle (no sprite art needed).
 */
export class Collectible extends Phaser.GameObjects.Graphics {
  readonly collectibleId: string
  private tileX: number
  private tileY: number
  private worldX: number
  private worldY: number
  private collected = false
  private glowPhase = Math.random() * Math.PI * 2

  constructor(scene: Phaser.Scene, def: DreamCollectible, tileSize: number) {
    super(scene)
    scene.add.existing(this)

    this.collectibleId = def.id
    this.tileX = def.x
    this.tileY = def.y
    this.worldX = def.x * tileSize + tileSize / 2
    this.worldY = def.y * tileSize + tileSize / 2

    this.setPosition(this.worldX, this.worldY)
    this.setDepth(5)

    // Check if already collected
    if (useDreamClientStore.getState().collectedItems.has(def.id)) {
      this.collected = true
      this.setVisible(false)
    }
  }

  updateCollectible(time: number, playerX: number, playerY: number, tileSize: number) {
    if (this.collected) return

    // Animate glow
    this.clear()
    const pulse = Math.sin(time * 0.003 + this.glowPhase) * 0.3 + 0.7
    const size = 4 + pulse * 2

    // Outer glow
    this.fillStyle(0x00ff88, 0.2 * pulse)
    this.fillCircle(0, 0, size * 2)

    // Inner glow
    this.fillStyle(0x00ff88, 0.5 * pulse)
    this.fillCircle(0, 0, size)

    // Core
    this.fillStyle(0xffffff, 0.8)
    this.fillCircle(0, 0, 2)

    // Check pickup
    const dx = playerX - this.worldX
    const dy = playerY - this.worldY
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < tileSize * 0.75) {
      this.collect()
    }
  }

  private collect() {
    this.collected = true

    // Flash effect
    this.clear()
    this.fillStyle(0xffffff, 1)
    this.fillCircle(0, 0, 12)

    // Fade out
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 400,
      ease: 'Power2',
      onComplete: () => {
        this.setVisible(false)
      },
    })

    // Persist
    useDreamClientStore.getState().collectItem(this.collectibleId)
    sendToParent({ type: 'DREAM_COLLECT', collectibleId: this.collectibleId })
  }
}
