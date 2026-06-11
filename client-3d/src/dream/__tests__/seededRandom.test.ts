import { describe, it, expect } from 'vitest'
import { createRng, hashSeed, dreamSeed } from '../seededRandom'

describe('hashSeed', () => {
  it('is deterministic and differs across inputs', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'))
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'))
  })
})

describe('createRng', () => {
  it('produces identical sequences for identical seeds', () => {
    const a = createRng(12345)
    const b = createRng(12345)
    for (let i = 0; i < 100; i++) expect(a.float()).toBe(b.float())
  })

  it('produces different sequences for different seeds', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 10 }, () => a.float())
    const seqB = Array.from({ length: 10 }, () => b.float())
    expect(seqA).not.toEqual(seqB)
  })

  it('range stays within bounds', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(0.6, 0.9)
      expect(v).toBeGreaterThanOrEqual(0.6)
      expect(v).toBeLessThan(0.9)
    }
  })

  it('pick returns elements from the array', () => {
    const rng = createRng(7)
    const arr = ['a', 'b', 'c']
    for (let i = 0; i < 100; i++) expect(arr).toContain(rng.pick(arr))
  })

  it('pickWeighted never returns zero-weight items', () => {
    const rng = createRng(7)
    for (let i = 0; i < 200; i++) {
      expect(rng.pickWeighted(['x', 'y'], [0, 1])).toBe('y')
    }
  })
})

describe('dreamSeed', () => {
  it('is stable for the same player and day', () => {
    const d = new Date('2026-06-11T14:30:00Z')
    const d2 = new Date('2026-06-11T20:00:00Z')
    expect(dreamSeed('player1', d)).toBe(dreamSeed('player1', d2))
    expect(dreamSeed('player1', d)).not.toBe(dreamSeed('player2', d))
  })
})
