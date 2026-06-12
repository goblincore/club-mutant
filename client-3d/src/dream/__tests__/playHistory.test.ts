import { describe, it, expect, beforeEach } from 'vitest'
import { PlayHistory, extractVideoId } from '../playHistory'

function fakeStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

describe('extractVideoId', () => {
  it('extracts from watch URLs, short URLs, embeds, and bare ids', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractVideoId('not a link')).toBeNull()
  })
})

describe('PlayHistory', () => {
  let now: number
  let history: PlayHistory

  beforeEach(() => {
    now = 1_000_000_000_000
    history = new PlayHistory(fakeStorage(), () => now)
  })

  it('records and returns most recent first', () => {
    history.record('aaaaaaaaaaa')
    now += 1000
    history.record('bbbbbbbbbbb')
    expect(history.recent()).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa'])
  })

  it('dedupes consecutive plays of the same id', () => {
    history.record('aaaaaaaaaaa')
    history.record('aaaaaaaaaaa')
    expect(history.recent()).toEqual(['aaaaaaaaaaa'])
  })

  it('caps at 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      history.record(`id${String(i).padStart(9, '0')}`)
      now += 1000
    }
    expect(history.recent().length).toBe(50)
    expect(history.recent()[0]).toBe('id000000059')
  })

  it('filters by max age', () => {
    history.record('aaaaaaaaaaa')
    now += 25 * 60 * 60 * 1000 // 25 hours later
    history.record('bbbbbbbbbbb')
    expect(history.recent(24 * 60 * 60 * 1000)).toEqual(['bbbbbbbbbbb'])
  })

  it('persists through storage round-trip', () => {
    const storage = fakeStorage()
    const h1 = new PlayHistory(storage, () => now)
    h1.record('aaaaaaaaaaa')
    const h2 = new PlayHistory(storage, () => now)
    expect(h2.recent()).toEqual(['aaaaaaaaaaa'])
  })
})
