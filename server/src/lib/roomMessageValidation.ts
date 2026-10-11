import { Message } from '@club-mutant/types/Messages'

const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const integer = (v: unknown) => number(v) && Number.isInteger(v) && (v as number) >= 0
const youtube = (v: unknown) => text(v, 256) && /^(?:[a-zA-Z0-9_-]{11}|https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}(?:&[^\s]*)?|youtu\.be\/[a-zA-Z0-9_-]{11}(?:\?[^\s]*)?))$/.test(v as string)

/** Validate before any handler dereferences or stores a network payload. */
export function validRoomMessage(type: Message, data: any): boolean {
  const empty = [Message.READY_TO_CONNECT, Message.CHAT_HISTORY,
    Message.DJ_QUEUE_LEAVE, Message.DJ_PLAY, Message.DJ_STOP, Message.DJ_SKIP_TURN,
    Message.JUKEBOX_CONNECT, Message.JUKEBOX_DISCONNECT, Message.JUKEBOX_PLAY,
    Message.JUKEBOX_STOP, Message.JUKEBOX_SKIP, Message.DREAM_SLEEP, Message.DREAM_WAKE,
    Message.PLAYER_JUMP, Message.SERVICE_AUTH]
  if (empty.includes(type)) return data == null || (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length <= 1)
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  switch (type) {
    case Message.DJ_QUEUE_JOIN: return data.slotIndex === undefined || (integer(data.slotIndex) && data.slotIndex < 50)
    case Message.TIME_SYNC_REQUEST: return number(data.clientSentAtMs)
    case Message.UPDATE_PLAYER_ACTION: return number(data.x) && number(data.y) && Math.abs(data.x) <= 100000 && Math.abs(data.y) <= 100000
    case Message.UPDATE_PLAYER_SCALE: return number(data.scale) && data.scale >= 1 && data.scale <= 255
    case Message.UPDATE_PLAYER_NAME: return text(data.name, 32)
    case Message.PUNCH_PLAYER: return text(data.targetId, 64)
    // The client sends { visitorIndex } on connect and {} on disconnect; the handlers default to booth 0.
    case Message.CONNECT_TO_MUSIC_BOOTH:
    case Message.DISCONNECT_FROM_MUSIC_BOOTH:
      return (data.musicBoothIndex === undefined || integer(data.musicBoothIndex)) &&
        (data.visitorIndex === undefined || integer(data.visitorIndex))
    case Message.ADD_CHAT_MESSAGE: return text(data.content, 1000) && (data.imageUrl === undefined || (text(data.imageUrl, 512) && /^https:\/\/cdn\.mutante\.club\/chat\/[A-Za-z0-9_-]+\.jpg$/.test(data.imageUrl)))
    case Message.NPC_DJ_SET_STANDBY: return typeof data.standby === 'boolean'
    case Message.NPC_DJ_SET_MODE: return ['off', 'fallback', 'rotation'].includes(data.mode)
    case Message.DJ_TURN_COMPLETE:
    case Message.JUKEBOX_TRACK_COMPLETE: return integer(data.streamId)
    case Message.ROOM_QUEUE_PLAYLIST_ADD:
    case Message.JUKEBOX_ADD: return text(data.title, 200) && youtube(data.link) && number(data.duration) && data.duration >= 0
    case Message.ROOM_QUEUE_PLAYLIST_REMOVE:
    case Message.JUKEBOX_REMOVE: return text(data.itemId, 64)
    case Message.ROOM_QUEUE_PLAYLIST_REORDER: return integer(data.fromIndex) && integer(data.toIndex)
    case Message.DREAM_COLLECT: return data.collectibleId === 'static_flower'
    default: return false
  }
}
