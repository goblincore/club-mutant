import type { PitchEffect } from './types'

interface ChorusVoice {
  delay: DelayNode
  lfo: OscillatorNode
  lfoGain: GainNode
  gain: GainNode
}

export class DetunedChorus implements PitchEffect {
  readonly name = 'chorus'
  private voices: ChorusVoice[] = []
  private dryGain: GainNode | null = null
  private merger: GainNode | null = null

  private configs = [
    [0.020, 0.3, 0.005],
    [0.035, 0.2, 0.008],
    [0.050, 0.15, 0.012],
  ]

  connect(ctx: AudioContext, input: AudioNode, output: AudioNode): void {
    this.merger = ctx.createGain()
    this.merger.gain.value = 1.0
    this.merger.connect(output)

    this.dryGain = ctx.createGain()
    this.dryGain.gain.value = 0.5
    input.connect(this.dryGain)
    this.dryGain.connect(this.merger)

    const wetLevel = 0.5 / this.configs.length
    for (const [baseDelay, lfoRate, lfoDepth] of this.configs) {
      const delay = ctx.createDelay(0.1)
      delay.delayTime.value = baseDelay!

      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = lfoRate!

      const lfoGain = ctx.createGain()
      lfoGain.gain.value = lfoDepth!

      const gain = ctx.createGain()
      gain.gain.value = wetLevel

      lfo.connect(lfoGain)
      lfoGain.connect(delay.delayTime)

      input.connect(delay)
      delay.connect(gain)
      gain.connect(this.merger)

      lfo.start()
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
    try { this.dryGain?.disconnect() } catch {}
    try { this.merger?.disconnect() } catch {}
    this.dryGain = null
    this.merger = null
  }

  randomize(): void {
    this.configs = [
      [0.015 + Math.random() * 0.015, 0.2 + Math.random() * 0.3, 0.003 + Math.random() * 0.007],
      [0.025 + Math.random() * 0.020, 0.1 + Math.random() * 0.2, 0.005 + Math.random() * 0.010],
      [0.040 + Math.random() * 0.025, 0.08 + Math.random() * 0.15, 0.008 + Math.random() * 0.012],
    ]
    this.voices.forEach((v, i) => {
      const cfg = this.configs[i]!
      v.delay.delayTime.value = cfg[0]!
      v.lfo.frequency.value = cfg[1]!
      v.lfoGain.gain.value = cfg[2]!
    })
  }
}
