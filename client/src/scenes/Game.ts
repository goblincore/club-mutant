import Phaser from 'phaser'

import { createCharacterAnims } from '../anims/CharacterAnims'
import { mutantRippedAnimKeys } from '../anims/MutantRippedAnims'

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
import { setShowChat } from '../stores/ChatStore'
import { setMusicStream } from '../stores/MusicStreamStore'
import { setLoggedIn } from '../stores/UserStore'

import { findPathAStar } from '../utils/pathfinding'

import { RoomType } from '../../../types/Rooms'

import { phaserEvents, Event } from '../events/EventCenter'

import { VHS_POSTFX_PIPELINE_KEY, VhsPostFxPipeline } from '../pipelines/VhsPostFxPipeline'
import { SOFT_POSTFX_PIPELINE_KEY, SoftPostFxPipeline } from '../pipelines/SoftPostFxPipeline'

export default class Game extends Phaser.Scene {
  network!: Network
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keyW!: Phaser.Input.Keyboard.Key
  private keyA!: Phaser.Input.Keyboard.Key
  private keyS!: Phaser.Input.Keyboard.Key
  private keyD!: Phaser.Input.Keyboard.Key
  private keyE!: Phaser.Input.Keyboard.Key
  private keyR!: Phaser.Input.Keyboard.Key
  private keyT!: Phaser.Input.Keyboard.Key
  private key1!: Phaser.Input.Keyboard.Key
  private key2!: Phaser.Input.Keyboard.Key
  private key3!: Phaser.Input.Keyboard.Key
  private key4!: Phaser.Input.Keyboard.Key
  private key5!: Phaser.Input.Keyboard.Key
  private keyV!: Phaser.Input.Keyboard.Key
  private keyB!: Phaser.Input.Keyboard.Key
  private map!: Phaser.Tilemaps.Tilemap
  private groundLayer!: Phaser.Tilemaps.TilemapLayer
  private pathObstacles: Array<{ getBounds: () => Phaser.Geom.Rectangle }> = []
  private lastPointerDownTime = 0
  private interactables: Item[] = []
  private hoveredInteractable: Item | null = null
  private selectorInteractable: Item | null = null
  private highlightedInteractable: Item | null = null
  private hoverGlowFx = new WeakMap<Item, Phaser.FX.Glow>()
  myPlayer!: MyPlayer
  private playerSelector!: PlayerSelector
  private otherPlayers!: Phaser.Physics.Arcade.Group
  private otherPlayerMap = new Map<string, OtherPlayer>()
  private pendingPunchTargetId: string | null = null
  private musicBoothMap = new Map<number, MusicBooth>()
  private myYoutubePlayer?: MyYoutubePlayer

  private getPlayerFeetPoint(sprite: Phaser.Physics.Arcade.Sprite): { x: number; y: number } {
    const body = sprite.body as Phaser.Physics.Arcade.Body | null
    if (!body) {
      return { x: sprite.x, y: sprite.y }
    }

    return {
      x: body.center.x,
      y: body.bottom,
    }
  }

  private rippedAnimKeys: string[] = []

  private rippedAnimIndex = 0

  private playNextRippedAnim() {
    if (!this.myPlayer || this.rippedAnimKeys.length === 0) return

    const nextKey = this.rippedAnimKeys[this.rippedAnimIndex % this.rippedAnimKeys.length]
    this.rippedAnimIndex += 1

    phaserEvents.emit(Event.MUTANT_RIPPED_DEBUG_CURRENT_ANIM, nextKey)
    this.myPlayer.playDebugAnim(nextKey, this.network, { syncToServer: false })
  }

  constructor() {
    super('game')
  }

  private findTopInteractableAt(worldPoint: { x: number; y: number }): Item | null {
    let topMost: Item | null = null
    let topDepth = -Infinity

    for (const item of this.interactables) {
      if (!item.active || !item.visible) continue

      if (!item.getBounds().contains(worldPoint.x, worldPoint.y)) continue

      if (item.depth >= topDepth) {
        topDepth = item.depth
        topMost = item
      }
    }

    return topMost
  }

  private isPointerOverCanvas(pointer: Phaser.Input.Pointer): boolean {
    const canvas = this.game.canvas
    if (!canvas) return false

    const event = pointer.event
    if (event && 'target' in event) {
      const target = event.target as HTMLElement
      if (target !== canvas) {
        return false
      }
    }

    const rect = canvas.getBoundingClientRect()

    let clientX: number | null = null
    let clientY: number | null = null

    if (event) {
      if ('clientX' in event && typeof event.clientX === 'number') {
        clientX = event.clientX
        clientY = event.clientY
      } else if ('changedTouches' in event && event.changedTouches.length > 0) {
        clientX = event.changedTouches[0].clientX
        clientY = event.changedTouches[0].clientY
      }
    }

    if (clientX !== null && clientY !== null) {
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      )
    }

    return (
      pointer.x >= 0 &&
      pointer.x <= this.scale.width &&
      pointer.y >= 0 &&
      pointer.y <= this.scale.height
    )
  }

  preload() {}

  private toggleVhsPostFx() {
    const camera = this.cameras.main
    const existing = camera.getPostPipeline(VHS_POSTFX_PIPELINE_KEY)
    const hasExisting = Array.isArray(existing) ? existing.length > 0 : !!existing

    if (hasExisting) {
      camera.removePostPipeline(VHS_POSTFX_PIPELINE_KEY)
      return
    }

    camera.setPostPipeline(VHS_POSTFX_PIPELINE_KEY)

    const pipeline = camera.getPostPipeline(VHS_POSTFX_PIPELINE_KEY)
    const instance = Array.isArray(pipeline) ? pipeline[pipeline.length - 1] : pipeline

    if (instance && instance instanceof VhsPostFxPipeline) {
      instance.setBypass(false)
    }
  }

  private toggleSoftPostFx() {
    const camera = this.cameras.main
    const existing = camera.getPostPipeline(SOFT_POSTFX_PIPELINE_KEY)
    const hasExisting = Array.isArray(existing) ? existing.length > 0 : !!existing

    if (hasExisting) {
      camera.removePostPipeline(SOFT_POSTFX_PIPELINE_KEY)
      return
    }

    camera.setPostPipeline(SOFT_POSTFX_PIPELINE_KEY)

    const pipeline = camera.getPostPipeline(SOFT_POSTFX_PIPELINE_KEY)
    const instance = Array.isArray(pipeline) ? pipeline[pipeline.length - 1] : pipeline

    if (instance && instance instanceof SoftPostFxPipeline) {
      instance.setIntensity(1)
    }
  }

  private clearHoverHighlight(item: Item) {
    const glow = this.hoverGlowFx.get(item)
    if (glow && item.postFX) {
      item.postFX.remove(glow)
      this.hoverGlowFx.delete(item)
    }

    item.clearTint()
  }

  private applyHoverHighlight(item: Item) {
    const shouldUseFx = this.game.renderer.type === Phaser.WEBGL
    if (shouldUseFx && item.postFX && !this.hoverGlowFx.has(item)) {
      item.postFX.setPadding(12)
      const glow = item.postFX.addGlow(0xffffff, 3, 0, false, 0.2, 12)
      this.hoverGlowFx.set(item, glow)
      return
    }

    item.setTint(0xf2f2f2)
  }

  private updateHighlightedInteractable() {
    const next = this.hoveredInteractable ?? this.selectorInteractable

    if (this.highlightedInteractable === next) return

    if (this.highlightedInteractable) {
      this.clearHoverHighlight(this.highlightedInteractable)
    }

    this.highlightedInteractable = next

    if (next) {
      this.applyHoverHighlight(next)
    }
  }

  private setHoveredInteractable(next: Item | null) {
    if (this.hoveredInteractable === next) return

    this.hoveredInteractable = next
    this.updateHighlightedInteractable()
  }

  private setSelectorInteractable(next: Item | null) {
    if (this.selectorInteractable === next) return

    this.selectorInteractable = next
    this.updateHighlightedInteractable()
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.isPointerOverCanvas(pointer)) {
      this.setHoveredInteractable(null)
      return
    }

    const event = pointer.event
    if (event && 'target' in event && event.target && event.target !== this.game.canvas) {
      this.setHoveredInteractable(null)
      return
    }

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)

    this.setHoveredInteractable(this.findTopInteractableAt(worldPoint))
  }

  registerKeys() {
    const keyboard = this.input.keyboard
    if (!keyboard) return

    this.cursors = keyboard.createCursorKeys()
    // maybe we can have a dedicated method for adding keys if more keys are needed in the future
    this.keyW = keyboard.addKey('W')
    this.keyA = keyboard.addKey('A')
    this.keyS = keyboard.addKey('S')
    this.keyD = keyboard.addKey('D')
    this.keyE = keyboard.addKey('E')
    this.keyR = keyboard.addKey('R')
    this.keyT = keyboard.addKey('T')
    this.key1 = keyboard.addKey('ONE')
    this.key2 = keyboard.addKey('TWO')
    this.key3 = keyboard.addKey('THREE')
    this.key4 = keyboard.addKey('FOUR')
    this.key5 = keyboard.addKey('FIVE')
    this.keyV = keyboard.addKey('V')
    this.keyB = keyboard.addKey('B')
    keyboard.disableGlobalCapture()
    keyboard.on('keydown-ESC', (event) => {
      store.dispatch(setShowChat(false))
    })

    keyboard.on('keydown-V', () => {
      if (this.game.renderer.type !== Phaser.WEBGL) return
      this.toggleVhsPostFx()
    })

    keyboard.on('keydown-B', () => {
      if (this.game.renderer.type !== Phaser.WEBGL) return
      this.toggleSoftPostFx()
    })
  }

  disableKeys() {
    const keyboard = this.input.keyboard
    if (!keyboard) return

    keyboard.enabled = false
  }

  enableKeys() {
    const keyboard = this.input.keyboard
    if (!keyboard) return

    keyboard.enabled = true
  }

  private buildBlockedGrid(): { width: number; height: number; blocked: Uint8Array } {
    const width = this.map.width
    const height = this.map.height

    const blocked = new Uint8Array(width * height)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const tile = this.groundLayer.getTileAt(x, y)
        if (tile?.collides) {
          blocked[y * width + x] = 1
        }
      }
    }

    for (const obstacle of this.pathObstacles) {
      const left = obstacle.getBounds().left
      const right = obstacle.getBounds().right
      const top = obstacle.getBounds().top
      const bottom = obstacle.getBounds().bottom

      const startX = this.map.worldToTileX(left) ?? 0
      const endX = this.map.worldToTileX(right) ?? 0
      const startY = this.map.worldToTileY(top) ?? 0
      const endY = this.map.worldToTileY(bottom) ?? 0

      for (let ty = startY; ty <= endY; ty += 1) {
        for (let tx = startX; tx <= endX; tx += 1) {
          if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue
          blocked[ty * width + tx] = 1
        }
      }
    }

    const expanded = new Uint8Array(blocked)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (blocked[y * width + x] !== 1) continue

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
            expanded[ny * width + nx] = 1
          }
        }
      }
    }

    return { width, height, blocked: expanded }
  }

  private findNearestOpenTile(params: {
    width: number

    height: number

    blocked: Uint8Array

    x: number

    y: number

    maxRadius?: number
  }): { x: number; y: number } | null {
    const { width, height, blocked, x, y, maxRadius = 12 } = params

    const inBounds = (tx: number, ty: number) => tx >= 0 && tx < width && ty >= 0 && ty < height

    let best: { x: number; y: number } | null = null
    let bestDistSq = Number.POSITIVE_INFINITY

    for (let r = 0; r <= maxRadius; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const tx = x + dx
          const ty = y + dy
          if (!inBounds(tx, ty)) continue

          if (blocked[ty * width + tx] === 0) {
            const distSq = dx * dx + dy * dy
            if (distSq < bestDistSq) {
              bestDistSq = distSq
              best = { x: tx, y: ty }
            }
          }
        }
      }

      if (best) return best
    }

    return null
  }

  create(data: { network: Network }) {
    if (!data.network) {
      throw new Error('server instance missing')
    } else {
      this.network = data.network
    }

    this.registerKeys()

    createCharacterAnims(this.anims)

    this.rippedAnimKeys = mutantRippedAnimKeys.slice().sort()

    phaserEvents.on(Event.MUTANT_RIPPED_DEBUG_NEXT_ANIM, this.playNextRippedAnim, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      phaserEvents.off(Event.MUTANT_RIPPED_DEBUG_NEXT_ANIM, this.playNextRippedAnim, this)
    })

    this.map = this.make.tilemap({ key: 'tilemap' })
    const FloorAndGround = this.map.addTilesetImage('FloorAndGround', 'tiles_wall')

    if (!FloorAndGround) {
      throw new Error('missing tileset FloorAndGround')
    }

    const groundLayer = this.map.createLayer('Ground', FloorAndGround)
    if (!groundLayer) {
      throw new Error('missing tilemap layer Ground')
    }

    groundLayer.setCollisionByProperty({ collides: true })
    this.groundLayer = groundLayer

    this.myPlayer = this.add.myPlayer(705, 500, 'mutant', this.network.mySessionId)

    const state = store.getState()
    if (!state.user.loggedIn && state.room.roomType === RoomType.PUBLIC) {
      const generatedName = `mutant-${this.network.mySessionId}`

      this.myPlayer.setPlayerTexture('mutant')
      this.myPlayer.setPlayerName(generatedName)
      this.network.readyToConnect()
      store.dispatch(setLoggedIn(true))
    }

    this.playerSelector = new PlayerSelector(this, 0, 0, 16, 16)

    this.input.on('pointermove', this.handlePointerMove, this)

    // import music booth objects from Tiled map to Phaser
    const musicBooths = this.physics.add.staticGroup({ classType: MusicBooth })
    const musicBoothLayer = this.map.getObjectLayer('MusicBooth')
    if (!musicBoothLayer) {
      throw new Error('missing object layer MusicBooth')
    }

    musicBoothLayer.objects.forEach((obj, index) => {
      if (index !== 0) return
      const item = this.addObjectFromTiled(
        musicBooths,
        obj,
        'musicBooths',
        'musicBooth'
      ) as MusicBooth
      item.id = index
      item.itemDirection = 'up'
      this.musicBoothMap.set(index, item)

      this.interactables.push(item)
    })

    this.otherPlayers = this.physics.add.group({ classType: OtherPlayer })

    this.cameras.main.zoom = 1.5
    this.cameras.main.startFollow(this.myPlayer, true)

    this.physics.add.collider(this.myPlayer, groundLayer)

    const obstacles = this.physics.add.staticGroup()

    for (let i = 0; i < 3; i += 1) {
      const x = Phaser.Math.Between(600, 900)
      const y = Phaser.Math.Between(420, 650)

      const chair = this.physics.add.staticSprite(x, y, 'chairs', 0)
      chair.setDepth(y)
      chair.setOrigin(0.5, 0.5)

      const chairBody = chair.body as Phaser.Physics.Arcade.StaticBody | null
      chairBody?.setSize(chair.width * 0.9, chair.height * 0.3)
      chairBody?.setOffset(chair.width * 0.05, chair.height * 0.65)

      obstacles.add(chair)
      this.pathObstacles.push(chair)
    }

    for (let i = 0; i < 3; i += 1) {
      const x = Phaser.Math.Between(600, 900)
      const y = Phaser.Math.Between(420, 650)

      const vending = this.physics.add.staticSprite(x, y, 'vendingmachines', 0)
      vending.setDepth(y)
      vending.setOrigin(0.5, 0.5)

      const vendingBody = vending.body as Phaser.Physics.Arcade.StaticBody | null
      vendingBody?.setSize(vending.width * 0.9, vending.height * 0.5)
      vendingBody?.setOffset(vending.width * 0.05, vending.height * 0.5)

      obstacles.add(vending)
      this.pathObstacles.push(vending)
    }

    this.physics.add.collider(this.myPlayer, obstacles)

    this.physics.add.overlap(
      this.playerSelector,
      [musicBooths],
      this.handleItemSelectorOverlap,
      undefined,
      this
    )

    this.physics.add.collider(this.myPlayer, this.otherPlayers)
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
    this.network.onMyPlayerForcedAnim(this.handleMyPlayerForcedAnim, this)
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

    this.setSelectorInteractable(selectionItem)
  }

  private addObjectFromTiled(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: Phaser.Types.Tilemaps.TiledObject,
    key: string,
    tilesetName: string
  ) {
    const actualX = object.x! + object.width! * 0.5
    const actualY = object.y! - object.height! * 0.5

    const tileset = this.map.getTileset(tilesetName)
    if (!tileset) {
      throw new Error(`missing tileset ${tilesetName}`)
    }

    const rawFrame = object.gid! - tileset.firstgid
    const texture = this.textures.get(key)
    const safeFrame = texture.has(String(rawFrame)) ? rawFrame : 0

    const obj = group.get(actualX, actualY, key, safeFrame).setDepth(actualY)
    return obj
  }

  // function to add new player to the otherPlayer group
  private handlePlayerJoined(newPlayer: IPlayer, id: string) {
    if (this.otherPlayerMap.has(id)) return

    const initialTexture =
      typeof newPlayer.anim === 'string' && newPlayer.anim.includes('_')
        ? newPlayer.anim.split('_')[0]
        : 'mutant'

    const otherPlayer = this.add.otherPlayer(
      newPlayer.x,
      newPlayer.y,
      initialTexture,
      id,
      newPlayer.name
    )

    if (typeof newPlayer.anim === 'string' && newPlayer.anim !== '') {
      otherPlayer.updateOtherPlayer('anim', newPlayer.anim)
    }

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

  private handleMyPlayerForcedAnim(animKey: string) {
    if (!this.myPlayer || !this.network) return
    this.myPlayer.cancelMoveNavigation()
    this.myPlayer.playHitAnim(animKey, this.network)
  }

  private handlePlayersOverlap(myPlayer, otherPlayer) {}

  private handleItemUserAdded(playerId: string, itemId: number, itemType: ItemType) {
    console.log('////NETWORK handleItemUserAdded', playerId, itemId, itemType)
    if (itemType === ItemType.MUSIC_BOOTH) {
      const musicBooth = this.musicBoothMap.get(itemId)
      const currentPlayer =
        this.otherPlayerMap.get(playerId) || this.myPlayer.playerId === playerId
          ? this.myPlayer
          : null
      console.log('currentDJPlayerinfo', currentPlayer)
      musicBooth?.addCurrentUser(playerId)
      console.log('////MusicBooth', musicBooth)
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
    const currentDjSessionId = store.getState().musicStream.currentDj.sessionId
    const boothDjSessionId = this.musicBoothMap.get(0)?.currentUser ?? null
    const resolvedDjSessionId = currentDjSessionId ?? boothDjSessionId
    const connectedBoothIndex = store.getState().musicBooth.musicBoothIndex
    const isDj =
      (resolvedDjSessionId !== null && playerId === resolvedDjSessionId) ||
      (connectedBoothIndex !== null && playerId === this.network.mySessionId)
    const bubbleScale = isDj ? 1.5 : 1

    if (this.myPlayer.playerId === playerId) {
      this.myPlayer.updateDialogBubble(content, bubbleScale)
      return
    }

    const otherPlayer = this.otherPlayerMap.get(playerId)
    otherPlayer?.updateDialogBubble(content, bubbleScale)
  }

  private handleStartMusicStream(musicStream: IMusicStream, offset: number) {
    console.log('////handleStartMusicStream, musicStream.currentLink', musicStream.currentLink)
    console.log('////handleStartMusicStream, offset', offset)

    console.log('musicStream handle start music stream game', musicStream)
    const {
      currentLink: url,
      currentTitle: title,
      currentDj,
      startTime,
      isRoomPlaylist,
      roomPlaylistIndex,
      videoBackgroundEnabled,
      isAmbient,
    } = musicStream

    console.log('game handle start music stream', url)

    store.dispatch(
      setMusicStream({
        url,
        title,
        currentDj,
        startTime,
        isRoomPlaylist,
        roomPlaylistIndex,
        videoBackgroundEnabled,
        isAmbient,
      })
    )
  }

  private handleStopMusicStream() {
    console.log('////handleStopMusicStream')
    store.dispatch(setMusicStream(null))
    this.myYoutubePlayer?.pause()
  }

  update(t: number, dt: number) {
    if (this.myPlayer && this.network) {
      if (this.key5 && Phaser.Input.Keyboard.JustDown(this.key5)) {
        this.playNextRippedAnim()
      }

      const pointer = this.input.activePointer

      if (pointer.isDown && pointer.downTime !== this.lastPointerDownTime) {
        this.lastPointerDownTime = pointer.downTime

        const state = store.getState()

        const canMove =
          !state.chat.focused &&
          !state.myPlaylist.focused &&
          !state.myPlaylist.myPlaylistPanelOpen &&
          this.myPlayer.playerBehavior === PlayerBehavior.IDLE &&
          !pointer.rightButtonDown() &&
          this.isPointerOverCanvas(pointer)

        if (canMove) {
          const downTime = pointer.downTime
          const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
          const x = worldPoint.x
          const y = worldPoint.y

          const clickedOtherPlayer = (() => {
            let topMost: OtherPlayer | null = null
            let topDepth = -Infinity

            for (const otherPlayer of this.otherPlayerMap.values()) {
              if (!otherPlayer.active || !otherPlayer.visible) continue
              if (!otherPlayer.getBounds().contains(x, y)) continue
              if (otherPlayer.depth >= topDepth) {
                topDepth = otherPlayer.depth
                topMost = otherPlayer
              }
            }

            return topMost
          })()

          if (!clickedOtherPlayer) {
            this.pendingPunchTargetId = null
          }

          const clickedItem = this.findTopInteractableAt({ x, y })

          const moveToWorld = (targetX: number, targetY: number, maxRadius?: number) => {
            const startX = this.map.worldToTileX(this.myPlayer.x)
            const startY = this.map.worldToTileY(this.myPlayer.y)
            const goalX = this.map.worldToTileX(targetX)
            const goalY = this.map.worldToTileY(targetY)

            if (startX === null || startY === null || goalX === null || goalY === null) {
              this.myPlayer.setMoveTarget(targetX, targetY)
              return { x: targetX, y: targetY }
            }

            const { width, height, blocked } = this.buildBlockedGrid()

            const isStartBlocked = blocked[startY * width + startX] === 1
            const isGoalBlocked = blocked[goalY * width + goalX] === 1

            const startOpen = !isStartBlocked
              ? { x: startX, y: startY }
              : this.findNearestOpenTile({ width, height, blocked, x: startX, y: startY })

            const goalOpen = !isGoalBlocked
              ? { x: goalX, y: goalY }
              : this.findNearestOpenTile({
                  width,
                  height,
                  blocked,
                  x: goalX,
                  y: goalY,
                  maxRadius,
                })

            if (!startOpen || !goalOpen) {
              this.myPlayer.setMoveTarget(targetX, targetY)
              return { x: targetX, y: targetY }
            }

            const tilePath = findPathAStar({
              width,
              height,
              blocked,
              start: startOpen,
              goal: goalOpen,
            })

            const tileWidth = this.map.tileWidth || 32
            const tileHeight = this.map.tileHeight || 32

            const goalWorld = {
              x: (this.map.tileToWorldX(goalOpen.x) ?? 0) + tileWidth * 0.5,
              y: (this.map.tileToWorldY(goalOpen.y) ?? 0) + tileHeight * 0.5,
            }

            if (tilePath && tilePath.length > 0) {
              const waypoints = tilePath.slice(1).map((p) => ({
                x: (this.map.tileToWorldX(p.x) ?? 0) + tileWidth * 0.5,
                y: (this.map.tileToWorldY(p.y) ?? 0) + tileHeight * 0.5,
              }))

              if (waypoints.length === 0) {
                this.myPlayer.setMoveTarget(goalWorld.x, goalWorld.y)
              } else {
                this.myPlayer.setMovePath(waypoints)
              }
            } else {
              this.myPlayer.setMoveTarget(goalWorld.x, goalWorld.y)
            }

            return goalWorld
          }

          const clickedBooth = clickedItem instanceof MusicBooth ? clickedItem : null
          const isHighlightedBooth =
            clickedBooth &&
            clickedBooth === this.highlightedInteractable &&
            clickedBooth.currentUser === null

          if (isHighlightedBooth) {
            const boothBounds = clickedBooth.getBounds()
            const approachX = boothBounds.centerX
            const approachY = boothBounds.bottom + 8

            const standTarget = moveToWorld(approachX, approachY, 12)
            this.myPlayer.queueAutoEnterMusicBooth(clickedBooth, standTarget)
            return
          }

          if (clickedOtherPlayer) {
            const targetFeet = this.getPlayerFeetPoint(clickedOtherPlayer)
            const approachX = targetFeet.x
            const approachY = targetFeet.y

            moveToWorld(approachX, approachY, 12)
            this.pendingPunchTargetId = clickedOtherPlayer.playerId
            return
          }

          moveToWorld(x, y)
        }
      }

      if (this.pendingPunchTargetId) {
        const target = this.otherPlayerMap.get(this.pendingPunchTargetId)
        if (!target) {
          this.pendingPunchTargetId = null
        } else {
          const myFeet = this.getPlayerFeetPoint(this.myPlayer)
          const targetFeet = this.getPlayerFeetPoint(target)

          const dx = targetFeet.x - myFeet.x
          const dy = targetFeet.y - myFeet.y
          const punchRangePx = 56
          const punchDyWeight = 1.5
          const weightedDistanceSq = dx * dx + dy * punchDyWeight * (dy * punchDyWeight)

          if (weightedDistanceSq <= punchRangePx * punchRangePx) {
            this.myPlayer.cancelMoveNavigation()

            const absDx = Math.abs(dx)
            const absDy = Math.abs(dy)
            const diagonalThreshold = 0.5
            const isDiagonal =
              absDx > 0 &&
              absDy > 0 &&
              absDx / absDy > diagonalThreshold &&
              absDy / absDx > diagonalThreshold

            let dir: 'left' | 'right' | 'down' | 'down_left' | 'down_right' | 'up_left' | 'up_right'

            if (isDiagonal) {
              if (dy > 0) {
                dir = dx >= 0 ? 'down_right' : 'down_left'
              } else {
                dir = dx >= 0 ? 'up_right' : 'up_left'
              }
            } else if (absDx >= absDy) {
              dir = dx >= 0 ? 'right' : 'left'
            } else {
              dir = dy >= 0 ? 'down' : 'up_right'
            }

            if (this.myPlayer.playerTexture === 'mutant') {
              const punchAnimKey = `mutant_punch_${dir}`
              this.myPlayer.playActionAnim(punchAnimKey, this.network)
            }

            this.network.punchPlayer(target.playerId)
            this.pendingPunchTargetId = null
          }
        }
      }

      this.playerSelector.update(this.myPlayer, this.cursors, {
        up: this.keyW,
        down: this.keyS,
        left: this.keyA,
        right: this.keyD,
      })

      if (
        this.myPlayer.playerBehavior !== PlayerBehavior.IDLE ||
        !this.playerSelector.selectedItem
      ) {
        this.setSelectorInteractable(null)
      }

      this.myPlayer.update(
        this.playerSelector,
        this.cursors,
        {
          up: this.keyW,
          down: this.keyS,
          left: this.keyA,
          right: this.keyD,
        },
        this.keyE,
        this.keyR,
        this.network,
        dt,
        this.keyT,
        {
          key1: this.key1,
          key2: this.key2,
          key3: this.key3,
          key4: this.key4,
        }
      )
    }
  }
}
