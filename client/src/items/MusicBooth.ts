import { ItemType } from '@club-mutant/types/Items'
import store from '../stores'
import Item from './Item'
import Network from '../services/Network'
import { openMyPlaylistPanel, closeMyPlaylistPanel, setFocused } from '../stores/MyPlaylistStore'
import { disconnectFromMusicBooth } from '../stores/MusicBoothStore'
import { setIsInQueue } from '../stores/DJQueueStore'
import { setRoomQueuePlaylistVisible } from '../stores/RoomQueuePlaylistStore'

export default class MusicBooth extends Item {
  id?: number
  currentUsers: Array<string | null>
  maxUsers: number = 4
  itemDirection?: string

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, frame?: string | number) {
    super(scene, x, y, texture, frame)
    this.currentUsers = new Array(this.maxUsers).fill(null)
    this.itemType = ItemType.MUSIC_BOOTH
  }

  // onOverlapDialog() {
  //   console.log('////onOverlapDialog', this.currentUsers.size)
  //   if (this.currentUsers.size === 0) {
  //     this.setDialogBox('Press R to join the DJ booth')
  //   } else if (this.isFull()) {
  //     this.setDialogBox('DJ booth is full')
  //   } else {
  //     this.clearDialogBox()
  //   }
  // }

  addCurrentUser(userId: string, seatIndex?: number): number | null {
    const occupiedCount = this.currentUsers.filter((id) => Boolean(id)).length

    console.log('////addCurrentUser userId', userId, 'current count:', occupiedCount)

    // Check if booth is full
    if (occupiedCount >= this.maxUsers) {
      console.log('////addCurrentUser booth is full')
      return null
    }

    // Check if user is already at booth
    if (this.currentUsers.includes(userId)) {
      console.log('////addCurrentUser user already at booth')
      return null
    }

    const positionIndex =
      typeof seatIndex === 'number' && Number.isFinite(seatIndex)
        ? seatIndex
        : this.currentUsers.findIndex((id) => !id)

    if (positionIndex < 0 || positionIndex >= this.maxUsers) {
      console.log('////addCurrentUser no empty slot found')
      return null
    }

    this.currentUsers[positionIndex] = userId
    this.clearStatusBox()

    const nextOccupiedCount = this.currentUsers.filter((id) => Boolean(id)).length

    console.log(
      '////addCurrentUser assigned position',
      positionIndex,
      'new count:',
      nextOccupiedCount
    )
    return positionIndex
  }

  removeCurrentUser(userId: string, seatIndex?: number) {
    if (!userId) {
      this.currentUsers.fill(null)
      this.clearStatusBox()
      return
    }

    const index =
      typeof seatIndex === 'number' && Number.isFinite(seatIndex)
        ? seatIndex
        : this.currentUsers.findIndex((id) => id === userId)

    if (index !== -1 && index >= 0 && index < this.maxUsers) {
      if (this.currentUsers[index] === userId || typeof seatIndex === 'number') {
        this.currentUsers[index] = null

        const remainingCount = this.currentUsers.filter((id) => Boolean(id)).length
        console.log('////removeCurrentUser', userId, 'remaining count:', remainingCount)
        if (remainingCount === 0) {
          this.clearStatusBox()
        }
      }
    }
  }

  isFull(): boolean {
    return this.currentUsers.filter((id) => Boolean(id)).length >= this.maxUsers
  }

  hasUser(userId: string): boolean {
    return this.currentUsers.includes(userId)
  }

  // Per-seat configuration: scale, whether sprite is flipped, and depth offset
  // Position 2 (seatIndex 1) has highest depthOffset so it renders on top.
  // Seats 2 and 3 (seatIndex 2, 3) are flipped (facing the booth from the right).
  static readonly SEAT_CONFIG: Array<{
    scale: number
    flip: boolean
    depthOffset: number
  }> = [
    { scale: 1.0, flip: false, depthOffset: -2 }, // seat 0: front-left
    { scale: 0.98, flip: true, depthOffset: -3 },
    { scale: 0.53, flip: false, depthOffset: 2 }, // seat 1: front-center (main DJ, highest z)// seat 2: right side, flipped
    { scale: 0.79, flip: true, depthOffset: -1 }, // seat 3: far right, flipped, smaller
  ]

  getSeatConfig(seatIndex: number) {
    return MusicBooth.SEAT_CONFIG[seatIndex] ?? MusicBooth.SEAT_CONFIG[0]
  }

  getStandPosition(positionIndex: number): { x: number; y: number } {
    // Position layout:
    // [0] [1]      <- left side
    //     BOOTH
    //         [2] [3]  <- right side (flipped)

    const baseY = this.y + this.height * 0.25 - 70

    switch (positionIndex) {
      case 0: // front-left
        return { x: this.x - 9, y: baseY + 6 }
      case 1: // front-center (main DJ)
        return { x: this.x + 32, y: baseY + 7 }
      case 2: // right side
        return { x: this.x - 45, y: baseY + 5 }
      case 3: // far right
        return { x: this.x + 40, y: baseY + 12 }
      default:
        return { x: this.x - 20, y: baseY }
    }
  }

  openDialog(network: Network) {
    console.log('////MusicBooth, openDialog, id', this.id)
    if (this.id === undefined) return
    console.log('////MusicBooth, openDialog, network.connectToMusicBooth, this.id', this.id)
    network.connectToMusicBooth(this.id)

    // Auto-join DJ queue when opening the booth
    const state = store.getState()
    if (!state.djQueue.isInQueue) {
      console.log('////MusicBooth, auto-joining DJ queue')
      network.joinDJQueue()
      store.dispatch(setIsInQueue(true))
      store.dispatch(setRoomQueuePlaylistVisible(true))
    }
  }

  closeDialog(network: Network, userId?: string) {
    if (this.id === undefined) return
    store.dispatch(setFocused(false))
    store.dispatch(closeMyPlaylistPanel())
    store.dispatch(disconnectFromMusicBooth())

    // Remove specific user if provided, otherwise this is called from a local context
    // where we don't know which user to remove (the network handler will call removeCurrentUser separately)
    if (userId) {
      this.removeCurrentUser(userId)
    }

    network.disconnectFromMusicBooth(this.id)

    // NOTE: We no longer auto-leave the DJ queue when exiting the booth.
    // The queue is now independent of booth occupancy.
    // Users must explicitly click "Leave Queue" button in DJQueuePanel.
    // This allows:
    // 1. Queue to persist when booth occupant leaves
    // 2. Other DJs in queue to continue playing
    // 3. Anyone to sit at booth for visuals without affecting queue
    //
    // The booth is now just a visual indicator, not the queue controller.
  }
}
