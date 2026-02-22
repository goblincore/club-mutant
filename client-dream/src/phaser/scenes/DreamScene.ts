import Phaser from 'phaser'
import { DreamPlayer } from '../entities/DreamPlayer'
import { NPC } from '../entities/NPC'
import { Collectible } from '../entities/Collectible'
import { useDreamClientStore } from '../../stores/dreamClientStore'
import { sendToParent } from '../../bridge/bridgeTypes'
import type { DreamWorldDef } from '../types'

// ── Constants ──
const CAMERA_LERP = 0.08

/**
 * DreamScene — main gameplay scene.
 * Renders flat-colored ground tiles + player + NPCs + collectibles.
 */
export class DreamScene extends Phaser.Scene {
  private player!: DreamPlayer
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>
  private currentWorld: DreamWorldDef | null = null
  private groundGraphics!: Phaser.GameObjects.Graphics
  private transitioning = false
  private npcs: NPC[] = []
  private collectibles: Collectible[] = []

  constructor() {
    super({ key: 'DreamScene' })
  }

  create() {
    // Load the initial world (Nexus)
    const nexusData = this.cache.json.get('nexus_world') as DreamWorldDef
    this.loadWorld(nexusData)

    // Create player
    this.player = new DreamPlayer(
      this,
      nexusData.spawnX * nexusData.tileSize + nexusData.tileSize / 2,
      nexusData.spawnY * nexusData.tileSize + nexusData.tileSize / 2
    )

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    // Camera setup — use built-in startFollow so zoom + RESIZE mode work correctly
    this.cameras.main.setBackgroundColor('#000000')
    this.cameras.main.setZoom(2)
    this.cameras.main.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP)

    // Click-to-move — convert screen click to world position
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Ignore if chat input is focused
      const activeEl = document.activeElement
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
      this.player.setMoveTarget(worldPoint.x, worldPoint.y)
    })
  }

  loadWorld(world: DreamWorldDef) {
    this.currentWorld = world
    useDreamClientStore.getState().setCurrentWorldId(world.id)

    // Clear existing entities
    this.clearEntities()

    // Clear existing ground graphics
    if (this.groundGraphics) {
      this.groundGraphics.destroy()
    }

    // Draw flat-colored ground tiles from collision layer
    this.groundGraphics = this.add.graphics()
    this.groundGraphics.setDepth(-10)

    const palette = world.palette || {
      floor: '#1a0a2e',
      wall: '#0a0a0a',
      path: '#2a1a3e',
      exit: '#00ff88',
      noiseBase: '#1a0a2e',
      noiseDrift: '#0a2a2e',
    }

    const collisionLayer = world.layers.find((l) => l.name === 'collision')
    const groundLayer = world.layers.find((l) => l.name === 'ground')

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const idx = y * world.width + x
        const collisionTile = collisionLayer?.data[idx] ?? 0
        const groundTile = groundLayer?.data[idx] ?? 0

        // Check if this is an exit tile
        const isExit = world.exits.some((e) => e.x === x && e.y === y)

        let color: number
        if (isExit) {
          color = Phaser.Display.Color.HexStringToColor(palette.exit).color
        } else if (collisionTile > 0) {
          color = Phaser.Display.Color.HexStringToColor(palette.wall).color
        } else if (groundTile > 0) {
          color = Phaser.Display.Color.HexStringToColor(palette.path).color
        } else {
          color = Phaser.Display.Color.HexStringToColor(palette.floor).color
        }

        this.groundGraphics.fillStyle(color, 1)
        this.groundGraphics.fillRect(
          x * world.tileSize,
          y * world.tileSize,
          world.tileSize,
          world.tileSize
        )
      }
    }

    // Spawn NPCs
    if (world.npcs) {
      for (const npcDef of world.npcs) {
        const npc = new NPC(this, npcDef, world.tileSize)
        this.npcs.push(npc)
      }
    }

    // Spawn collectibles
    if (world.collectibles) {
      for (const colDef of world.collectibles) {
        const col = new Collectible(this, colDef, world.tileSize)
        this.collectibles.push(col)
      }
    }
  }

  private clearEntities() {
    // Destroy NPCs
    for (const npc of this.npcs) {
      npc.destroy()
    }
    this.npcs = []

    // Destroy collectibles
    for (const col of this.collectibles) {
      col.destroy()
    }
    this.collectibles = []
  }

  update(time: number, delta: number) {
    if (!this.currentWorld || this.transitioning) return

    const dt = delta / 1000

    // Skip movement while chat input is focused
    const activeElement = document.activeElement
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      this.player.stopMoving()
      return
    }

    // Read input
    const left = this.cursors.left.isDown || this.wasd.A.isDown
    const right = this.cursors.right.isDown || this.wasd.D.isDown
    const up = this.cursors.up.isDown || this.wasd.W.isDown
    const down = this.cursors.down.isDown || this.wasd.S.isDown

    // Update player movement (pass dt in seconds)
    this.player.handleMovement(left, right, up, down, this.currentWorld, dt)

    // Update NPCs
    for (const npc of this.npcs) {
      npc.updateNPC(dt, this.player, this.currentWorld)
    }

    // Update collectibles
    for (const col of this.collectibles) {
      col.updateCollectible(time, this.player.x, this.player.y, this.currentWorld.tileSize)
    }

    // Check for exit tiles
    const tileX = Math.floor(this.player.x / this.currentWorld.tileSize)
    const tileY = Math.floor(this.player.y / this.currentWorld.tileSize)
    const exit = this.currentWorld.exits.find((e) => e.x === tileX && e.y === tileY)

    if (exit && !this.transitioning) {
      this.handleExit(exit)
    }
  }

  private handleExit(exit: DreamWorldDef['exits'][0]) {
    if (exit.target === 'wake') {
      // Send wake request to parent
      sendToParent({ type: 'DREAM_WAKE' })
      return
    }

    this.transitioning = true

    // Fade to black
    this.cameras.main.fadeOut(300, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => {
      // Load target world
      const worldData = this.cache.json.get(`${exit.target}_world`) as DreamWorldDef | undefined
      if (worldData) {
        this.loadWorld(worldData)
        // Move player to spawn point
        this.player.setPosition(
          exit.spawnX * worldData.tileSize + worldData.tileSize / 2,
          exit.spawnY * worldData.tileSize + worldData.tileSize / 2
        )
        // Snap camera immediately to new player position
        this.cameras.main.centerOn(this.player.x, this.player.y)
      }

      // Fade back in
      this.cameras.main.fadeIn(300, 0, 0, 0)
      this.cameras.main.once('camerafadeincomplete', () => {
        this.transitioning = false
      })
    })
  }
}
