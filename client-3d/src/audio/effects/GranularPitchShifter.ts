import type { PitchEffect } from './types'

/**
 * Pitch shifter using the "swept delay" technique.
 * A sawtooth LFO drives the delay time, creating continuous Doppler pitch shift.
 * Two voices with offset phases smooth the output.
 */
export class GranularPitchShifter implements PitchEffect {
  readonly name = 'granular'
  private voices: Array<{
    delay: DelayNode
    lfo: OscillatorNode
    lfoGain: GainNode
    gain: GainNode
  }> = []
  private merger: GainNode | null = null
  private shiftAmount = -0.15

  connect(ctx: AudioContext, input: AudioNode, output: AudioNode): void {
    this.merger = ctx.createGain()
    this.merger.gain.value = 1.0
    this.merger.connect(output)

    for (let i = 0; i < 2; i++) {
      const delay = ctx.createDelay(1.0)
      delay.delayTime.value = 0.05

      const lfo = ctx.createOscillator()
      lfo.type = 'sawtooth'
      lfo.frequency.value = 4 + Math.random() * 2

      const lfoGain = ctx.createGain()
      lfoGain.gain.value = this.shiftAmount * 0.02

      const gain = ctx.createGain()
      gain.gain.value = 0.5

      lfo.connect(lfoGain)
      lfoGain.connect(delay.delayTime)

      input.connect(delay)
      delay.connect(gain)
      gain.connect(this.merger)

      lfo.start(ctx.currentTime + (i * 0.5) / lfo.frequency.value)

      this.voices.push({ delay, lfo, lfoGain, gain })
    }
  }

  disconnect(): void {
    for (const v of this.voices) {
      try { v.lfo.stop() } catch {}
      try { v.lfo.disconnect() } catch {}
      try { v.lfoGain.disconnect() } catch {}
      try { v.delay.disconnect() } catch {}
      try { v.gain.disconnect() } catch {}
    }
    this.voices = []
    try { this.merger?.disconnect() } catch {}
    this.merger = null
  }

  randomize(): void {
    this.shiftAmount = -(0.1 + Math.random() * 0.25)
    for (const v of this.voices) {
      v.lfoGain.gain.value = this.shiftAmount * 0.02
      v.lfo.frequency.value = 3 + Math.random() * 4
    }
  }
}
