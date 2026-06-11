// client-3d/src/audio/DreamDrone.ts
import type { Rng } from '../dream/seededRandom'

/** Root note candidates: E1, G1, A1, B1 — low enough to sit under the collage */
const ROOT_CHOICES = [41.2, 49.0, 55.0, 61.74]

/**
 * Sustained tonal anchor under the collage. An unambiguous tonal center makes the
 * random material above it read as color instead of clash.
 * Connect to masterGain — it should be ducked by the kick sidechain (pump feel).
 * Starts silent (gain 0) — call setGain() to fade in.
 */
export class DreamDrone {
  readonly rootHz: number
  private ctx: AudioContext | null = null
  private out: GainNode | null = null
  private oscillators: OscillatorNode[] = []
  private nodes: AudioNode[] = []

  constructor(rng: Rng) {
    this.rootHz = rng.pick(ROOT_CHOICES)
  }

  start(ctx: AudioContext, destination: AudioNode): void {
    this.stop() // guard against double-start leaking the previous oscillator chain
    this.ctx = ctx
    this.out = ctx.createGain()
    this.out.gain.value = 0

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 600
    filter.Q.value = 0.5

    // Very slow LFO on the cutoff — breathing
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.05
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 250
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)
    lfo.start()

    // [waveform, frequency, voice gain]; harmonics detuned slightly for gentle beating
    const voices: Array<[OscillatorType, number, number]> = [
      ['sine', this.rootHz, 0.5],
      ['triangle', this.rootHz * 2, 0.25],
      ['triangle', this.rootHz * 3, 0.12],
    ]
    for (const [type, freq, gain] of voices) {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = freq
      if (freq !== this.rootHz) osc.detune.value = 6
      const g = ctx.createGain()
      g.gain.value = gain
      osc.connect(g)
      g.connect(filter)
      osc.start()
      this.oscillators.push(osc)
      this.nodes.push(g)
    }

    filter.connect(this.out)
    this.out.connect(destination)
    this.oscillators.push(lfo)
    this.nodes.push(filter, lfoGain)
  }

  setGain(gain: number, rampSeconds: number): void {
    if (!this.ctx || !this.out) return
    const g = this.out.gain
    g.cancelScheduledValues(this.ctx.currentTime)
    g.setValueAtTime(g.value, this.ctx.currentTime)
    g.linearRampToValueAtTime(gain, this.ctx.currentTime + rampSeconds)
  }

  stop(): void {
    for (const osc of this.oscillators) {
      try {
        osc.stop()
      } catch {}
      try {
        osc.disconnect()
      } catch {}
    }
    for (const node of this.nodes) {
      try {
        node.disconnect()
      } catch {}
    }
    try {
      this.out?.disconnect()
    } catch {}
    this.oscillators = []
    this.nodes = []
    this.out = null
    this.ctx = null
  }
}
