import { describe, expect, it } from 'vitest'
import { corruptSignal } from '../../../../../packages/konpyuuta/src/lib/mojibake'

describe('decorative encoding transition', () => {
  it('resolves exactly to the original Unicode text', () => {
    const message = 'リリイ 🌿 Chou-Chou\nA message.'
    expect(corruptSignal(message, 1, 13)).toBe(message)
    expect(corruptSignal(message, 2, 13)).toBe(message)
  })
  it('preserves whitespace and code-point length during corruption', () => {
    const message = '🌿 hello\nworld'
    const corrupted = corruptSignal(message, 0, 2)
    expect([...corrupted]).toHaveLength([...message].length)
    expect(corrupted.match(/\s/g)).toEqual(message.match(/\s/g))
    expect(corrupted).not.toBe(message)
    expect(corrupted).not.toContain('\uFFFD')
  })
  it('resolves from left to right and varies the remaining noise', () => {
    expect(corruptSignal('TinyTubes', .5, 1).startsWith('Tiny')).toBe(true)
    expect(corruptSignal('TinyTubes', 0, 1)).not.toBe(corruptSignal('TinyTubes', 0, 2))
    expect(corruptSignal('', 0, 1)).toBe('')
  })
})
