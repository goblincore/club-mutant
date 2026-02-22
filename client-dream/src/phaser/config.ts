import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { DreamScene } from './scenes/DreamScene'

export function getPhaserConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    pixelArt: true,
    backgroundColor: '#000000',
    parent: 'game-container',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    scene: [BootScene, DreamScene],
  }
}
