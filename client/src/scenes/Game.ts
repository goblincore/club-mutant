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
import { setShowChat } from '../stores/ChatStore'
import { setMusicStream } from '../stores/MusicStreamStore'
import { setLoggedIn } from '../stores/UserStore'

import { findPathAStar } from '../utils/pathfinding'

import { RoomType } from '../../../types/Rooms'

export default class Game extends Phaser.Scene {
  network!: Network
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keyW!: Phaser.Input.Keyboard.Key
  private keyA!: Phaser.Input.Keyboard.Key
  private keyS!: Phaser.Input.Keyboard.Key
  private keyD!: Phaser.Input.Keyboard.Key
  private keyE!: Phaser.Input.Keyboard.Key
  private keyR!: Phaser.Input.Keyboard.Key
  private map!: Phaser.Tilemaps.Tilemap
  private groundLayer!: Phaser.Tilemaps.TilemapLayer
  private pathObstacles: Array<{ getBounds: () => Phaser.Geom.Rectangle }> = []
  private lastPointerDownTime = 0
  private pendingMoveClick: { downTime: number; x: number; y: number } | null = null
  myPlayer!: MyPlayer
  private playerSelector!: PlayerSelector
  private otherPlayers!: Phaser.Physics.Arcade.Group
  private otherPlayerMap = new Map<string, OtherPlayer>()
  private musicBoothMap = new Map<number, MusicBooth>()
  private myYoutubePlayer?: MyYoutubePlayer

  constructor() {
    super('game')
  }

  private isPointerOverCanvas(pointer: Phaser.Input.Pointer): boolean {
    const canvas = this.game.canvas
    if (!canvas) return false

    const rect = canvas.getBoundingClientRect()

    const event = pointer.event
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
    keyboard.disableGlobalCapture()
    keyboard.on('keydown-ESC', (event) => {
      store.dispatch(setShowChat(false))
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
  }): { x: number; y: number } | null {
    const { width, height, blocked, x, y } = params

    const inBounds = (tx: number, ty: number) => tx >= 0 && tx < width && ty >= 0 && ty < height

    const maxRadius = 12

    for (let r = 0; r <= maxRadius; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const tx = x + dx
          const ty = y + dy
          if (!inBounds(tx, ty)) continue

          if (blocked[ty * width + tx] === 0) {
            return { x: tx, y: ty }
          }
        }
      }
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

    this.myPlayer = this.add.myPlayer(705, 500, 'adam', this.network.mySessionId)

    const state = store.getState()
    if (!state.user.loggedIn && state.room.roomType === RoomType.PUBLIC) {
      const generatedName = `mutant-${this.network.mySessionId}`

      this.myPlayer.setPlayerTexture('adam')
      this.myPlayer.setPlayerName(generatedName)
      this.network.readyToConnect()
      store.dispatch(setLoggedIn(true))
    }

    this.playerSelector = new PlayerSelector(this, 0, 0, 16, 16)

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

    const tileset = this.map.getTileset(tilesetName)
    if (!tileset) {
      throw new Error(`missing tileset ${tilesetName}`)
    }

    const obj = group.get(actualX, actualY, key, object.gid! - tileset.firstgid).setDepth(actualY)
    return obj
  }

  // function to add new player to the otherPlayer group
  private handlePlayerJoined(newPlayer: IPlayer, id: string) {
    if (this.otherPlayerMap.has(id)) return

    const initialTexture =
      typeof newPlayer.anim === 'string' && newPlayer.anim.includes('_')
        ? newPlayer.anim.split('_')[0]
        : 'adam'

    const otherPlayer = this.add.otherPlayer(
      newPlayer.x,
      newPlayer.y,
      initialTexture,
      id,
      newPlayer.name
    )

    if (typeof newPlayer.anim === 'string' && newPlayer.anim !== '') {
      otherPlayer.anims.play(newPlayer.anim, true)
      otherPlayer.updatePhysicsBodyForAnim(newPlayer.anim)
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
      const pointer = this.input.activePointer

      if (pointer.isDown && pointer.downTime !== this.lastPointerDownTime) {
        this.lastPointerDownTime = pointer.downTime

        const state = store.getState()
        if (
          !state.chat.focused &&
          !state.myPlaylist.focused &&
          !state.myPlaylist.myPlaylistPanelOpen &&
          this.myPlayer.playerBehavior === PlayerBehavior.IDLE &&
          !pointer.rightButtonDown() &&
          this.isPointerOverCanvas(pointer)
        ) {
          const downTime = pointer.downTime
          const x = pointer.worldX
          const y = pointer.worldY

          if (this.pendingMoveClick) {
            const timeDelta = downTime - this.pendingMoveClick.downTime
            const dx = x - this.pendingMoveClick.x
            const dy = y - this.pendingMoveClick.y
            const distanceSq = dx * dx + dy * dy

            if (timeDelta > 0 && timeDelta <= 300 && distanceSq <= 24 * 24) {
              this.pendingMoveClick = null

              const startX = this.map.worldToTileX(this.myPlayer.x)
              const startY = this.map.worldToTileY(this.myPlayer.y)
              const goalX = this.map.worldToTileX(x)
              const goalY = this.map.worldToTileY(y)

              if (startX === null || startY === null || goalX === null || goalY === null) {
                this.myPlayer.setMoveTarget(x, y)
                return
              }

              const { width, height, blocked } = this.buildBlockedGrid()

              const startOpen =
                blocked[startY * width + startX] === 0
                  ? { x: startX, y: startY }
                  : this.findNearestOpenTile({ width, height, blocked, x: startX, y: startY })

              const goalOpen =
                blocked[goalY * width + goalX] === 0
                  ? { x: goalX, y: goalY }
                  : this.findNearestOpenTile({ width, height, blocked, x: goalX, y: goalY })

              if (!startOpen || !goalOpen) {
                this.myPlayer.setMoveTarget(x, y)
                return
              }

              const tilePath = findPathAStar({
                width,
                height,
                blocked,
                start: startOpen,
                goal: goalOpen,
              })

              if (tilePath && tilePath.length > 0) {
                const tileWidth = this.map.tileWidth || 32
                const tileHeight = this.map.tileHeight || 32

                const waypoints = tilePath.slice(1).map((p) => ({
                  x: (this.map.tileToWorldX(p.x) ?? 0) + tileWidth * 0.5,
                  y: (this.map.tileToWorldY(p.y) ?? 0) + tileHeight * 0.5,
                }))

                this.myPlayer.setMovePath(waypoints)
              } else {
                this.myPlayer.setMoveTarget(x, y)
              }
            } else {
              this.pendingMoveClick = { downTime, x, y }
            }
          } else {
            this.pendingMoveClick = { downTime, x, y }
          }
        } else {
          this.pendingMoveClick = null
        }
      }

      this.playerSelector.update(this.myPlayer, this.cursors, {
        up: this.keyW,
        down: this.keyS,
        left: this.keyA,
        right: this.keyD,
      })
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
        dt
      )
    }
  }
}
