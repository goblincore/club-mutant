import Phaser from 'phaser'
import Network from '../services/Network'
import { BackgroundMode } from '@club-mutant/types/Backgrounds'
import store from '../stores'
import { setRoomJoined } from '../stores/RoomStore'

import { VHS_POSTFX_PIPELINE_KEY, VhsPostFxPipeline } from '../pipelines/VhsPostFxPipeline'
import { CRT_POSTFX_PIPELINE_KEY, CrtPostFxPipeline } from '../pipelines/CrtPostFxPipeline'
import { WAXY_POSTFX_PIPELINE_KEY, WaxyPostFxPipeline } from '../pipelines/WaxyPostFxPipeline'
import {
  TV_STATIC_POSTFX_PIPELINE_KEY,
  TvStaticPostFxPipeline,
} from '../pipelines/TvStaticPostFxPipeline'

export default class Bootstrap extends Phaser.Scene {
  network!: Network

  constructor() {
    super('bootstrap')
  }

  preload() {
    this.load.atlas(
      'cloud_day',
      'assets/background/cloud_day.png',
      'assets/background/cloud_day.json'
    )
    this.load.image('backdrop_day', 'assets/background/backdrop_day.png')
    this.load.atlas(
      'cloud_night',
      'assets/background/cloud_night.png',
      'assets/background/cloud_night.json'
    )

    this.load.image('backdrop_night', 'assets/background/backdrop_night.png')
    this.load.image('sun_moon', 'assets/background/sun_moon.png')

    this.load.tilemapTiledJSON('tilemap', 'assets/map/map.json')
    this.load.spritesheet('tiles_wall', 'assets/map/FloorAndGround.png', {
      frameWidth: 32,
      frameHeight: 32,
    })
    this.load.spritesheet('chairs', 'assets/items/chair.png', {
      frameWidth: 32,
      frameHeight: 64,
    })
    this.load.spritesheet('computers', 'assets/items/computer.png', {
      frameWidth: 96,
      frameHeight: 64,
    })
    this.load.spritesheet('whiteboards', 'assets/items/whiteboard.png', {
      frameWidth: 64,
      frameHeight: 64,
    })
    this.load.spritesheet('musicBooths', 'assets/items/thinkpaddesk.gif', {
      frameWidth: 145,
      frameHeight: 104,
    })
    this.load.spritesheet('vendingmachines', 'assets/items/vendingmachine.png', {
      frameWidth: 48,
      frameHeight: 72,
    })
    this.load.spritesheet('office', 'assets/items/Modern_Office_Black_Shadow.png', {
      frameWidth: 32,
      frameHeight: 32,
    })
    this.load.spritesheet('basement', 'assets/items/Basement.png', {
      frameWidth: 32,
      frameHeight: 32,
    })
    this.load.spritesheet('generic', 'assets/items/Generic.png', {
      frameWidth: 32,
      frameHeight: 32,
    })
    this.load.spritesheet('ash', 'assets/character/ash.png', {
      frameWidth: 32,
      frameHeight: 48,
    })
    this.load.spritesheet('lucy', 'assets/character/lilwiggle.png', {
      frameWidth: 16,
      frameHeight: 16,
    })
    this.load.spritesheet('nancy', 'assets/character/nancy.png', {
      frameWidth: 32,
      frameHeight: 48,
    })

    this.load.atlas('adam', 'assets/character/MutantWalk.png', 'assets/character/MutantWalk.json')
    this.load.atlas('mutant', 'assets/character/mutant.png', 'assets/character/mutant.json')

    this.load.multiatlas(
      'mutant_ripped',
      'assets/character/mutant_ripped.json',
      'assets/character/'
    )

    this.load.spritesheet('mutant_boombox', 'assets/character/MutantBoomboxTest2.gif', {
      frameWidth: 72,
      frameHeight: 105,
    })

    this.load.spritesheet('mutant_transform', 'assets/character/dj-transform.png', {
      frameWidth: 90,
      frameHeight: 140,
    })

    this.load.spritesheet('mutant_djwip', 'assets/character/djmutant3-solo-2.gif', {
      frameWidth: 188,
      frameHeight: 117,
    })
  }

  init() {
    this.network = new Network()
  }

  create() {
    if (this.game.renderer.type === Phaser.WEBGL) {
      const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer
      renderer.pipelines.addPostPipeline(VHS_POSTFX_PIPELINE_KEY, VhsPostFxPipeline)
      renderer.pipelines.addPostPipeline(CRT_POSTFX_PIPELINE_KEY, CrtPostFxPipeline)
      renderer.pipelines.addPostPipeline(WAXY_POSTFX_PIPELINE_KEY, WaxyPostFxPipeline)
      renderer.pipelines.addPostPipeline(TV_STATIC_POSTFX_PIPELINE_KEY, TvStaticPostFxPipeline)
    }

    this.launchBackground(store.getState().user.backgroundMode)
  }

  private launchBackground(backgroundMode: BackgroundMode) {
    this.scene.launch('background', { backgroundMode })
  }

  launchGame() {
    this.scene.launch('game', {
      network: this.network,
    })

    store.dispatch(setRoomJoined(true))
  }

  changeBackgroundMode(backgroundMode: BackgroundMode) {
    this.scene.stop('background')
    this.launchBackground(backgroundMode)
  }
}
