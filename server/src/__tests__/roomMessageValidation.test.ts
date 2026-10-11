import { describe, expect, it } from 'vitest'
import { Message } from '@club-mutant/types/Messages'
import { validRoomMessage } from '../lib/roomMessageValidation'

// Payloads exactly as client-3d/src/network/NetworkManager.ts sends them. A rejected
// payload kicks the sender, so any drift between client and validator is user-visible.
const clientPayloads: Array<[Message, unknown]> = [
  [Message.CONNECT_TO_MUSIC_BOOTH, { visitorIndex: 0 }],
  [Message.DISCONNECT_FROM_MUSIC_BOOTH, {}],
  [Message.DJ_QUEUE_JOIN, { slotIndex: 1 }],
  [Message.DJ_QUEUE_LEAVE, {}],
  [Message.DJ_TURN_COMPLETE, { streamId: 0 }],
  [Message.JUKEBOX_TRACK_COMPLETE, { streamId: 3 }],
  [Message.UPDATE_PLAYER_ACTION, { x: 12.5, y: -3, textureId: 2 }],
  [Message.ADD_CHAT_MESSAGE, { content: 'hi', imageUrl: undefined }],
  [Message.TIME_SYNC_REQUEST, { clientSentAtMs: Date.now() }],
  [Message.READY_TO_CONNECT, {}],
  [Message.CHAT_HISTORY, undefined],
  [Message.SERVICE_AUTH, undefined],
  [
    Message.ROOM_QUEUE_PLAYLIST_ADD,
    { title: 'Song', link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', duration: 200 },
  ],
]

describe('validRoomMessage accepts real client payloads', () => {
  it.each(clientPayloads)('%s', (type, payload) => {
    expect(validRoomMessage(type, payload)).toBe(true)
  })

  it('still rejects malformed booth payloads', () => {
    expect(validRoomMessage(Message.CONNECT_TO_MUSIC_BOOTH, { visitorIndex: 'x' })).toBe(false)
    expect(validRoomMessage(Message.CONNECT_TO_MUSIC_BOOTH, { musicBoothIndex: -1 })).toBe(false)
    expect(validRoomMessage(Message.DISCONNECT_FROM_MUSIC_BOOTH, [])).toBe(false)
  })
})
