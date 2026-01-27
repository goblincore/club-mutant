import Phaser from 'phaser'

export const phaserEvents = new Phaser.Events.EventEmitter()

export enum Event {
  PLAYER_JOINED = 'player-joined',
  PLAYER_UPDATED = 'player-updated',
  PLAYER_LEFT = 'player-left',
  PLAYER_DISCONNECTED = 'player-disconnected',

  MY_PLAYER_READY = 'my-player-ready',
  MY_PLAYER_FORCED_ANIM = 'my-player-forced-anim',
  MY_PLAYER_NAME_CHANGE = 'my-player-name-change',
  MY_PLAYER_TEXTURE_CHANGE = 'my-player-texture-change',

  ITEM_USER_ADDED = 'item-user-added',
  ITEM_USER_REMOVED = 'item-user-removed',

  UPDATE_DIALOG_BUBBLE = 'update-dialog-bubble',

  START_PLAYING_MEDIA = 'start-playing-media',
  STOP_PLAYING_MEDIA = 'stop-playing-media',

  MUTANT_RIPPED_DEBUG_NEXT_ANIM = 'mutant-ripped-debug-next-anim',
  MUTANT_RIPPED_DEBUG_CURRENT_ANIM = 'mutant-ripped-debug-current-anim',
}
