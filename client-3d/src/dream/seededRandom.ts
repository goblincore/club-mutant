export interface Rng {
  /** Uniform float in [0, 1) */
  float(): number
  range(min: number, max: number): number
  int(maxExclusive: number): number
  pick<T>(arr: readonly T[]): T
  chance(p: number): boolean
  pickWeighted<T>(items: readonly T[], weights: readonly number[]): T
}

/** xmur3-style string hash → 32-bit seed */
export function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}

/** mulberry32 PRNG */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  const float = (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    float,
    range: (min, max) => min + float() * (max - min),
    int: (maxExclusive) => Math.floor(float() * maxExclusive),
    pick: (arr) => arr[Math.floor(float() * arr.length)]!,
    chance: (p) => float() < p,
    pickWeighted: (items, weights) => {
      let total = 0
      for (const w of weights) total += w
      let r = float() * total
      for (let i = 0; i < items.length; i++) {
        r -= weights[i]!
        if (r < 0) return items[i]!
      }
      return items[items.length - 1]!
    },
  }
}

/** Seed for tonight's dream: stable per player per calendar day */
export function dreamSeed(playerId: string, date: Date = new Date()): number {
  return hashSeed(`${playerId}:${date.toISOString().slice(0, 10)}`)
}
