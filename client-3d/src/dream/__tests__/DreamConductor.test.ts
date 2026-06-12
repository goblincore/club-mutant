import { describe, it, expect } from 'vitest'
import { DreamConductor, type DreamSectionKind } from '../DreamConductor'
import { createRng } from '../seededRandom'

describe('DreamConductor', () => {
  it('always opens with a submerge section', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(new DreamConductor(createRng(seed)).current.kind).toBe('submerge')
    }
  })

  it('picks a BPM in the 58-72 range', () => {
    for (let seed = 0; seed < 20; seed++) {
      const c = new DreamConductor(createRng(seed))
      expect(c.bpm).toBeGreaterThanOrEqual(58)
      expect(c.bpm).toBeLessThanOrEqual(72)
    }
  })

  it('is deterministic for a given seed', () => {
    const a = new DreamConductor(createRng(42))
    const b = new DreamConductor(createRng(42))
    for (let i = 0; i < 30; i++) {
      const sa = a.nextSection()
      const sb = b.nextSection()
      expect(sa.kind).toBe(sb.kind)
      expect(sa.bars).toBe(sb.bars)
    }
  })

  it('guarantees a themeReturn at least every 5 sections', () => {
    for (let seed = 0; seed < 20; seed++) {
      const c = new DreamConductor(createRng(seed))
      const kinds: DreamSectionKind[] = [c.current.kind]
      for (let i = 0; i < 40; i++) kinds.push(c.nextSection().kind)
      let gap = 0
      for (const k of kinds) {
        if (k === 'themeReturn') gap = 0
        else gap++
        expect(gap).toBeLessThanOrEqual(5)
      }
    }
  })

  it('computes section duration from bars and bpm', () => {
    const c = new DreamConductor(createRng(1))
    const s = c.current
    const expected = s.bars * 4 * (60_000 / c.bpm)
    expect(c.sectionDurationMs(s)).toBeCloseTo(expected)
  })

  it('section params follow the preset table', () => {
    const c = new DreamConductor(createRng(1))
    // walk until we hit a breakdown; verify its silencing params
    for (let i = 0; i < 100; i++) {
      const s = c.nextSection()
      if (s.kind === 'breakdown') {
        expect(s.params.activeLayers).toBe(0)
        expect(s.params.pulseGain).toBe(0)
        expect(s.params.wetMix).toBeGreaterThan(0.7)
        return
      }
    }
    throw new Error('no breakdown in 100 sections — transition table broken')
  })
})
