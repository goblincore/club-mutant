export type { PitchEffect } from './types'
export { RingModulator } from './RingModulator'
export { DetunedChorus } from './DetunedChorus'
export { GranularPitchShifter } from './GranularPitchShifter'

import { RingModulator } from './RingModulator'
import { DetunedChorus } from './DetunedChorus'
import { GranularPitchShifter } from './GranularPitchShifter'
import type { PitchEffect } from './types'

/** Create a random pitch effect */
export function randomPitchEffect(): PitchEffect {
  const effects = [
    () => new RingModulator(),
    () => new DetunedChorus(),
    () => new GranularPitchShifter(),
  ]
  const effect = effects[Math.floor(Math.random() * effects.length)]!()
  effect.randomize()
  return effect
}
