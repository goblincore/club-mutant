import { ItemType } from '../../../types/Items'
import store from '../stores'
import Item from './Item'
import Network from '../services/Network'
import { openMyPlaylistPanel, closeMyPlaylistPanel, setFocused } from '../stores/MyPlaylistStore'

export default class MusicBooth extends Item {
  id?: number
  currentUser: string | null
  itemDirection?: string

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, frame?: string | number) {
    super(scene, x, y, texture, frame)
    this.currentUser = null
    this.itemType = ItemType.MUSIC_BOOTH
  }

  onOverlapDialog() {
    console.log('//////////onOverlapDialog', this.currentUser);
    if (this.currentUser === null) {
      this.setDialogBox('Press R to be the DJ')
    } else {
    this.clearDialogBox()
    }
  }

  addCurrentUser(userId: string) {
    console.log('//////////addCurrentUser userId', userId);
    if (this.currentUser) return
    this.currentUser = userId
    this.setStatusBox(`${userId} Connected`);
  }

  removeCurrentUser(userId: string) {
    if (this.currentUser === userId) {
      this.currentUser = null
    }
  }

  openDialog(network: Network) {
    console.log("///////////////MusicBooth, openDialog, id", this.id)
    if (this.id === undefined) return
    store.dispatch(openMyPlaylistPanel())
    store.dispatch(setFocused(true))
    console.log("///////////////MusicBooth, openDialog, network.connectToMusicBooth, this.id", this.id)
    network.connectToMusicBooth(this.id)
  }

  closeDialog(network: Network) {
    if (!this.id) return
    store.dispatch(setFocused(false))
    store.dispatch(closeMyPlaylistPanel())
    network.disconnectFromMusicBooth(this.id)
  }
}
