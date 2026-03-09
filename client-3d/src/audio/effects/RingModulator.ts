import type { PitchEffect } from './types'

export class RingModulator implements PitchEffect {
  readonly name = 'ring-mod'
  private osc: OscillatorNode | null = null
  private modGain: GainNode | null = null
  private inputGain: GainNode | null = null
  private freq = 15

  connect(ctx: AudioContext, input: AudioNode, output: AudioNode): void {
    this.inputGain = ctx.createGain()
    this.inputGain.gain.value = 0

    this.modGain = ctx.createGain()
    this.modGain.gain.value = 1.0

    this.osc = ctx.createOscillator()
    this.osc.type = 'sine'
    this.osc.frequency.value = this.freq

    this.osc.connect(this.modGain)
    this.modGain.connect(this.inputGain.gain)

    input.connect(this.inputGain)
    this.inputGain.connect(output)

    this.osc.start()
  }

  disconnect(): void {
    try { this.osc?.stop() } catch {}
    try { this.osc?.disconnect() } catch {}
    try { this.modGain?.disconnect() } catch {}
    try { this.inputGain?.disconnect() } catch {}
    this.osc = null
    this.modGain = null
    this.inputGain = null
  }

  randomize(): void {
    this.freq = 5 + Math.random() * 25
    if (this.osc) {
      this.osc.frequency.value = this.freq
    }
  }
}
