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
  currentUser: string | null
  itemDirection?: string

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, frame?: string | number) {
    super(scene, x, y, texture, frame)
    this.currentUser = null
    this.itemType = ItemType.MUSIC_BOOTH
  }

  // onOverlapDialog() {
  //   console.log('////onOverlapDialog', this.currentUser)
  //   if (this.currentUser === null) {
  //     this.setDialogBox('Press R to be the DJ')
  //   } else {
  //     this.clearDialogBox()
  //   }
  // }

  addCurrentUser(userId: string) {
    console.log('////addCurrentUser userId', userId)
    if (this.currentUser) {
      return
    }
    this.currentUser = userId
    this.clearStatusBox()
  }

  removeCurrentUser(userId: string) {
    if (!userId) {
      this.currentUser = null
      this.clearStatusBox()
      return
    }

    if (this.currentUser === userId) {
      this.currentUser = null
      this.clearStatusBox()
    }
  }

  openDialog(network: Network) {
    console.log('////MusicBooth, openDialog, id', this.id)
    if (this.id === undefined) return
    store.dispatch(openMyPlaylistPanel())
    store.dispatch(setFocused(true))
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

  closeDialog(network: Network) {
    if (this.id === undefined) return
    store.dispatch(setFocused(false))
    store.dispatch(closeMyPlaylistPanel())
    store.dispatch(disconnectFromMusicBooth())
    this.currentUser = null
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
