import { describe, expect, it } from 'vitest'
import { Message } from '@club-mutant/types/Messages'
import { normalizeYoutubeLink, parseYoutubeVideoId } from '../lib/youtubeLink'
import { validRoomMessage } from '../lib/roomMessageValidation'

const ID = 'dQw4w9WgXcQ'

describe('parseYoutubeVideoId', () => {
  it.each([
    ID,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://www.youtube.com/watch?feature=share&v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&list=RDAMVM${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}`,
  ])('accepts %s', (link) => {
    expect(parseYoutubeVideoId(link)).toBe(ID)
  })

  it.each([
    '',
    'not a link',
    `http://www.youtube.com/watch?v=${ID}`,
    `https://evil.example/watch?v=${ID}`,
    `https://www.youtube.com.evil.example/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=short`,
    `https://www.youtube.com/playlist?list=PL${ID}`,
    `javascript:alert(1)//youtube.com/watch?v=${ID}`,
    42,
    undefined,
  ])('rejects %s', (link) => {
    expect(parseYoutubeVideoId(link)).toBeNull()
  })

  it('canonicalizes for storage', () => {
    expect(normalizeYoutubeLink(`https://music.youtube.com/watch?v=${ID}&list=x`)).toBe(
      `https://www.youtube.com/watch?v=${ID}`
    )
  })

  it('lets room messages with non-canonical saved links through', () => {
    const payload = { title: 'Old saved track', link: `https://youtu.be/${ID}`, duration: 0 }
    expect(validRoomMessage(Message.ROOM_QUEUE_PLAYLIST_ADD, payload)).toBe(true)
    expect(validRoomMessage(Message.JUKEBOX_ADD, { ...payload, link: 'https://evil.example/x' })).toBe(false)
  })
})
