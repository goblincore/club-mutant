export type { PitchEffect } from './types'
export { RingModulator } from './RingModulator'
export { DetunedChorus } from './DetunedChorus'
export { GranularPitchShifter } from './GranularPitchShifter'
export { SpectralFreeze } from './SpectralFreeze'
export { TapeWobble } from './TapeWobble'

import { RingModulator } from './RingModulator'
import { DetunedChorus } from './DetunedChorus'
import { GranularPitchShifter } from './GranularPitchShifter'
import { SpectralFreeze } from './SpectralFreeze'
import { TapeWobble } from './TapeWobble'
import type { PitchEffect } from './types'

/** Create a random pitch effect */
export function randomPitchEffect(): PitchEffect {
  const effects = [
    () => new RingModulator(),
    () => new DetunedChorus(),
    () => new GranularPitchShifter(),
    () => new SpectralFreeze(),
    () => new TapeWobble(),
  ]
  const effect = effects[Math.floor(Math.random() * effects.length)]!()
  effect.randomize()
  return effect
}
