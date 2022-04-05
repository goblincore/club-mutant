import Phaser from 'phaser'

import { createCharacterAnims } from '../anims/CharacterAnims'

import Item from '../items/Item'
import MusicBooth from '../items/MusicBooth'
import { MyYoutubePlayer } from '../items/MyYoutubePlayer'

import '../characters/MyPlayer'
import '../characters/OtherPlayer'
import MyPlayer from '../characters/MyPlayer'
import OtherPlayer from '../characters/OtherPlayer'
import PlayerSelector from '../characters/PlayerSelector'

import { IPlayer, IMusicStream } from '../../../types/IOfficeState'
import { PlayerBehavior } from '../../../types/Players'
import { ItemType } from '../../../types/Items'

import Network from '../services/Network'

import store from '../stores'
import { setFocused, setShowChat } from '../stores/ChatStore'
import { setMusicStream } from '../stores/MusicStreamStore'

export default class Game extends Phaser.Scene {
  network!: Network
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keyE!: Phaser.Input.Keyboard.Key
  private keyR!: Phaser.Input.Keyboard.Key
  private map!: Phaser.Tilemaps.Tilemap
  myPlayer!: MyPlayer
  private playerSelector!: Phaser.GameObjects.Zone
  private otherPlayers!: Phaser.Physics.Arcade.Group
  private otherPlayerMap = new Map<string, OtherPlayer>()
  private musicBoothMap = new Map<number, MusicBooth>()
  private myYoutubePlayer?: MyYoutubePlayer

  constructor() {
    super('game')
  }

  preload() {
  }

  registerKeys() {
    this.cursors = this.input.keyboard.createCursorKeys()
    // maybe we can have a dedicated method for adding keys if more keys are needed in the future
    this.keyE = this.input.keyboard.addKey('E')
    this.keyR = this.input.keyboard.addKey('R')
    this.input.keyboard.disableGlobalCapture()
    this.input.keyboard.on('keydown-ENTER', (event) => {
      store.dispatch(setShowChat(true))
      store.dispatch(setFocused(true))
    })
    this.input.keyboard.on('keydown-ESC', (event) => {
      store.dispatch(setShowChat(false))
    })
  }

  disableKeys() {
    this.input.keyboard.enabled = false
  }

  enableKeys() {
    this.input.keyboard.enabled = true
  }

  create(data: { network: Network }) {
    if (!data.network) {
      throw new Error('server instance missing')
    } else {
      this.network = data.network
    }

    createCharacterAnims(this.anims)

    this.map = this.make.tilemap({ key: 'tilemap' })
    const FloorAndGround = this.map.addTilesetImage('FloorAndGround', 'tiles_wall')

    const groundLayer = this.map.createLayer('Ground', FloorAndGround)
    groundLayer.setCollisionByProperty({ collides: true })

    this.myPlayer = this.add.myPlayer(705, 500, 'adam', this.network.mySessionId)
    this.playerSelector = new PlayerSelector(this, 0, 0, 16, 16)

    // import music booth objects from Tiled map to Phaser
    const musicBooths = this.physics.add.staticGroup({ classType: MusicBooth })
    const musicBoothLayer = this.map.getObjectLayer('MusicBooth')
    musicBoothLayer.objects.forEach((obj, index) => {
      const item = this.addObjectFromTiled(
        musicBooths,
        obj,
        'musicBooths',
        'musicBooth'
      ) as MusicBooth
      item.id = index
      item.itemDirection = 'up'
      this.musicBoothMap.set(index, item)
    })

    this.otherPlayers = this.physics.add.group({ classType: OtherPlayer })

    this.cameras.main.zoom = 1.5
    this.cameras.main.startFollow(this.myPlayer, true)

    this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], groundLayer)

    this.physics.add.overlap(
      this.playerSelector,
      [musicBooths],
      this.handleItemSelectorOverlap,
      undefined,
      this
    )

    this.physics.add.overlap(
      this.myPlayer,
      this.otherPlayers,
      this.handlePlayersOverlap,
      undefined,
      this
    )
    // Youtube embed test
    // const youtubePlayerProps = {
    //   scene: this,
    //   x: 560,
    //   y: 400,
    //   width: 240,
    //   height: 180,
    // }

    // this.myYoutubePlayer = new MyYoutubePlayer({ ...youtubePlayerProps })
    // this.myYoutubePlayer.load(this.youtubeUrl, false)
    // this.myYoutubePlayer.alpha = 0
    // const currentLink = store.getState().musicStream.link
    // if (currentLink !== null) {
    //   this.myYoutubePlayer?.load(currentLink)
    //   if (this.myYoutubePlayer) {
    //     this.myYoutubePlayer.alpha = 0.5
    //     this.myYoutubePlayer.blendMode = Phaser.BlendModes.SCREEN
    //   }
    //   this.myYoutubePlayer?.play()
    // }

    // register network event listeners
    this.network.onPlayerJoined(this.handlePlayerJoined, this)
    this.network.onPlayerLeft(this.handlePlayerLeft, this)
    this.network.onMyPlayerReady(this.handleMyPlayerReady, this)
    this.network.onPlayerUpdated(this.handlePlayerUpdated, this)
    this.network.onItemUserAdded(this.handleItemUserAdded, this)
    this.network.onItemUserRemoved(this.handleItemUserRemoved, this)
    this.network.onChatMessageAdded(this.handleChatMessageAdded, this)
    this.network.onStartMusicStream(this.handleStartMusicStream, this)
    this.network.onStopMusicStream(this.handleStopMusicStream, this)
  }

  private handleItemSelectorOverlap(playerSelector, selectionItem) {
    const currentItem = playerSelector.selectedItem as Item
    // currentItem is undefined if nothing was perviously selected
    if (currentItem) {
      // if the selection has not changed, do nothing
      if (currentItem === selectionItem || currentItem.depth >= selectionItem.depth) {
        return
      }
      // if selection changes, clear pervious dialog
      if (this.myPlayer.playerBehavior !== PlayerBehavior.SITTING) currentItem.clearDialogBox()
    }

    // set selected item and set up new dialog
    playerSelector.selectedItem = selectionItem
    selectionItem.onOverlapDialog()
  }

  private addObjectFromTiled(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: Phaser.Types.Tilemaps.TiledObject,
    key: string,
    tilesetName: string
  ) {
    const actualX = object.x! + object.width! * 0.5
    const actualY = object.y! - object.height! * 0.5
    const obj = group
      .get(actualX, actualY, key, object.gid! - this.map.getTileset(tilesetName).firstgid)
      .setDepth(actualY)
    return obj
  }

  // function to add new player to the otherPlayer group
  private handlePlayerJoined(newPlayer: IPlayer, id: string) {
    const otherPlayer = this.add.otherPlayer(newPlayer.x, newPlayer.y, 'adam', id, newPlayer.name)
    this.otherPlayers.add(otherPlayer)
    this.otherPlayerMap.set(id, otherPlayer)
  }

  // function to remove the player who left from the otherPlayer group
  private handlePlayerLeft(id: string) {
    if (this.otherPlayerMap.has(id)) {
      const otherPlayer = this.otherPlayerMap.get(id)
      if (!otherPlayer) return
      this.otherPlayers.remove(otherPlayer, true, true)
      this.otherPlayerMap.delete(id)
    }
  }

  private handleMyPlayerReady() {
    this.myPlayer.readyToConnect = true
  }

  // function to update target position upon receiving player updates
  private handlePlayerUpdated(field: string, value: number | string, id: string) {
    const otherPlayer = this.otherPlayerMap.get(id)
    otherPlayer?.updateOtherPlayer(field, value)
  }

  private handlePlayersOverlap(myPlayer, otherPlayer) {
  }

  private handleItemUserAdded(playerId: string, itemId: number, itemType: ItemType) {
    console.log('////NETWORK handleItemUserAdded', playerId, itemId, itemType);
    if (itemType === ItemType.MUSIC_BOOTH) {
      const musicBooth = this.musicBoothMap.get(itemId)
      const currentPlayer = this.otherPlayerMap.get(playerId) || this.myPlayer.playerId === playerId ? this.myPlayer : null;
      console.log('currentDJPlayerinfo', currentPlayer);
      musicBooth?.addCurrentUser(playerId)
      console.log('////MusicBooth', musicBooth);
    }
  }

  private handleItemUserRemoved(playerId: string, itemId: number, itemType: ItemType) {
    if (itemType === ItemType.MUSIC_BOOTH) {
      const musicBooth = this.musicBoothMap.get(itemId)
      musicBooth?.removeCurrentUser(playerId)
    }
  }

  private handleChatMessageAdded(playerId: string, content: string) {
    console.log('////handleChatMessageAdded')
    const otherPlayer = this.otherPlayerMap.get(playerId)
    otherPlayer?.updateDialogBubble(content)
  }

  private handleStartMusicStream(musicStream: IMusicStream, offset: number) {
    console.log('////handleStartMusicStream, musicStream.currentLink', musicStream.currentLink)
    console.log('////handleStartMusicStream, offset', offset);

 
    console.log('musicStream handle start music stream game', musicStream);
    const { currentLink: url , currentTitle:title, currentDj, startTime} = musicStream

    console.log('game handle start music stream', url)

    store.dispatch(setMusicStream({url, title, currentDj, startTime}))
  }

  private handleStopMusicStream() {
    console.log('////handleStopMusicStream')
    store.dispatch(setMusicStream(null));
    this.myYoutubePlayer?.pause();
  }

  update(t: number, dt: number) {
    if (this.myPlayer && this.network) {
      this.playerSelector.update(this.myPlayer, this.cursors)
      this.myPlayer.update(this.playerSelector, this.cursors, this.keyE, this.keyR, this.network)
    }
  }
}
