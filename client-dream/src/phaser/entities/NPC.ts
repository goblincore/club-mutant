import Phaser from 'phaser'
import { NpcBehaviorFSM } from '../systems/NpcBehavior'
import { useDreamChatStore } from '../../stores/dreamChatStore'
import { getGreeting, NPC_CLIENT_CONFIGS } from '../../npc/npcPersonalities'
import type { DreamNPCDef, DreamWorldDef } from '../types'
import type { DreamPlayer } from './DreamPlayer'

/**
 * NPC — A mutant sprite with autonomous FSM behavior.
 * Uses the same mutant_ripped atlas as the player.
 */
export class NPC extends Phaser.GameObjects.Sprite {
  readonly npcId: string
  readonly personalityId: string
  readonly displayName: string
  readonly spawnTileX: number
  readonly spawnTileY: number
  private direction = 'down'
  private fsm: NpcBehaviorFSM
  private hasGreeted = false

  // Chat bubble text above sprite
  private bubbleText: Phaser.GameObjects.Text | null = null
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(scene: Phaser.Scene, def: DreamNPCDef, tileSize: number) {
    const px = def.spawnX * tileSize + tileSize / 2
    const py = def.spawnY * tileSize + tileSize / 2

    // Use correct frame name format: "mutant-unarmed-idle-48" (frame 48 = down idle first frame)
    super(scene, px, py, 'mutant_ripped', 'mutant-unarmed-idle-48')
    scene.add.existing(this)

    this.npcId = def.id
    this.personalityId = def.personalityId
    this.displayName = def.name
    this.spawnTileX = def.spawnX
    this.spawnTileY = def.spawnY

    this.setDepth(10)
    this.setScale(0.5) // Scale down — ripped frames are large
    this.play('mutant_idle_down')

    // Tint to distinguish from player
    this.setTint(0xaaddff)

    this.fsm = new NpcBehaviorFSM(
      this,
      def.wanderRadius ?? 3,
      def.interactRadius ?? 2,
      def.stationary ?? false
    )
  }

  updateNPC(dt: number, player: DreamPlayer, world: DreamWorldDef) {
    this.fsm.update(dt, player, world)

    // Check for greeting trigger
    if (this.fsm.state === 'face_player' && !this.hasGreeted) {
      this.hasGreeted = true
      const greeting = getGreeting(this.npcId)
      this.showBubble(greeting)

      // Set as active NPC in chat store
      const config = NPC_CLIENT_CONFIGS[this.npcId]
      useDreamChatStore.getState().setActiveNpc(
        this.npcId,
        config?.name ?? this.displayName
      )
    }

    // Clear active NPC when player leaves
    if (this.fsm.state === 'idle' && this.hasGreeted) {
      this.hasGreeted = false
      const store = useDreamChatStore.getState()
      if (store.activeNpcId === this.npcId) {
        store.clearActiveNpc()
      }
    }

    // Update bubble position
    if (this.bubbleText) {
      this.bubbleText.setPosition(this.x, this.y - 24)
    }
  }

  setDirection(dir: string) {
    this.direction = dir
  }

  playIdle() {
    const key = `mutant_idle_${this.direction}`
    if (this.anims.currentAnim?.key !== key) {
      this.play(key, true)
    }
  }

  playWalk() {
    const key = `mutant_walk_${this.direction}`
    if (this.anims.currentAnim?.key !== key) {
      this.play(key, true)
    }
  }

  showBubble(text: string, duration = 5000) {
    // Clear existing
    this.clearBubble()

    this.bubbleText = this.scene.add.text(this.x, this.y - 24, text, {
      fontSize: '10px',
      fontFamily: "'Courier New', monospace",
      color: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: { x: 6, y: 4 },
      wordWrap: { width: 140 },
      align: 'center',
    })
    this.bubbleText.setOrigin(0.5, 1)
    this.bubbleText.setDepth(20)

    this.bubbleTimer = setTimeout(() => {
      this.clearBubble()
    }, duration)
  }

  clearBubble() {
    if (this.bubbleText) {
      this.bubbleText.destroy()
      this.bubbleText = null
    }
    if (this.bubbleTimer) {
      clearTimeout(this.bubbleTimer)
      this.bubbleTimer = null
    }
  }

  triggerBehavior(behavior: string) {
    this.fsm.triggerBehavior(behavior)
  }

  onPlayerMessage() {
    this.fsm.onPlayerMessage()
  }

  destroy() {
    this.clearBubble()
    super.destroy()
  }
}
