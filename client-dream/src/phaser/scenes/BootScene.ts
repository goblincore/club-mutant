import Phaser from 'phaser'
import { registerDreamAnims } from '../anims/DreamAnims'

/**
 * BootScene — preloads all assets then transitions to DreamScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    // Multi-atlas: mutant_ripped (3 atlas pages, 450 animations)
    this.load.multiatlas(
      'mutant_ripped',
      'assets/character/mutant_ripped.json',
      'assets/character/'
    )

    // World definitions
    this.load.json('nexus_world', 'data/worlds/nexus.json')
    this.load.json('forest_world', 'data/worlds/forest.json')
  }

  create() {
    // Register animations from the multi-atlas
    registerDreamAnims(this.anims)

    // Start the main dream scene
    this.scene.start('DreamScene')
  }
}
