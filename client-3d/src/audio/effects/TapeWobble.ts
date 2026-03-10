import type { PitchEffect } from './types'

/**
 * TapeWobble — simulates a degraded tape deck with wow & flutter.
 * Uses a modulated delay line for pitch wobble and a WaveShaper for
 * subtle tape saturation/warmth. The result is that dreamy, unstable
 * cassette-left-in-the-sun feel.
 */
export class TapeWobble implements PitchEffect {
  readonly name = 'tape-wobble'

  private delay: DelayNode | null = null
  private lfo: OscillatorNode | null = null
  private lfoGain: GainNode | null = null
  private shaper: WaveShaperNode | null = null
  private inputGain: GainNode | null = null
  private hiCut: BiquadFilterNode | null = null

  // Wow (slow pitch drift)
  private wowRate = 0.4     // Hz
  private wowDepth = 0.004  // seconds of delay modulation

  // Flutter (faster jitter) — we sum two LFOs
  private flutter: OscillatorNode | null = null
  private flutterGain: GainNode | null = null
  private flutterRate = 6.0
  private flutterDepth = 0.0008

  connect(ctx: AudioContext, input: AudioNode, output: AudioNode): void {
    // Modulated delay line — base delay of 10ms so LFO can swing around it
    this.delay = ctx.createDelay(0.5)
    this.delay.delayTime.value = 0.01

    // Wow LFO (slow, ~0.3-0.6 Hz)
    this.lfo = ctx.createOscillator()
    this.lfo.type = 'sine'
    this.lfo.frequency.value = this.wowRate

    this.lfoGain = ctx.createGain()
    this.lfoGain.gain.value = this.wowDepth

    this.lfo.connect(this.lfoGain)
    this.lfoGain.connect(this.delay.delayTime)
    this.lfo.start()

    // Flutter LFO (faster, ~4-8 Hz)
    this.flutter = ctx.createOscillator()
    this.flutter.type = 'triangle'
    this.flutter.frequency.value = this.flutterRate

    this.flutterGain = ctx.createGain()
    this.flutterGain.gain.value = this.flutterDepth

    this.flutter.connect(this.flutterGain)
    this.flutterGain.connect(this.delay.delayTime)
    this.flutter.start()

    // Tape saturation — soft-clip waveshaper for warmth
    this.shaper = ctx.createWaveShaper()
    this.shaper.curve = this.makeSaturationCurve(0.4) as Float32Array<ArrayBuffer>
    this.shaper.oversample = '2x'

    // High-frequency rolloff — tape loses treble
    this.hiCut = ctx.createBiquadFilter()
    this.hiCut.type = 'lowpass'
    this.hiCut.frequency.value = 6000 + Math.random() * 4000
    this.hiCut.Q.value = 0.5

    // Input gain (slight boost into the shaper for more saturation)
    this.inputGain = ctx.createGain()
    this.inputGain.gain.value = 1.2

    // Chain: input → inputGain → shaper → delay (wobble) → hiCut → output
    input.connect(this.inputGain)
    this.inputGain.connect(this.shaper)
    this.shaper.connect(this.delay)
    this.delay.connect(this.hiCut)
    this.hiCut.connect(output)
  }

  /** Attempt at a subtle tape saturation curve (tanh-ish soft clip) */
  private makeSaturationCurve(amount: number): Float32Array {
    const samples = 1024
    const curve = new Float32Array(samples)
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1
      // Soft saturation — more `amount` = more squish
      curve[i] = Math.tanh(x * (1 + amount * 2))
    }
    return curve
  }

  disconnect(): void {
    try { this.lfo?.stop() } catch {}
    try { this.flutter?.stop() } catch {}
    try { this.lfo?.disconnect() } catch {}
    try { this.lfoGain?.disconnect() } catch {}
    try { this.flutter?.disconnect() } catch {}
    try { this.flutterGain?.disconnect() } catch {}
    try { this.delay?.disconnect() } catch {}
    try { this.shaper?.disconnect() } catch {}
    try { this.inputGain?.disconnect() } catch {}
    try { this.hiCut?.disconnect() } catch {}
    this.lfo = null
    this.lfoGain = null
    this.flutter = null
    this.flutterGain = null
    this.delay = null
    this.shaper = null
    this.inputGain = null
    this.hiCut = null
  }

  randomize(): void {
    // Wow: slow drift 0.2-0.7 Hz, depth 2-6ms
    this.wowRate = 0.2 + Math.random() * 0.5
    this.wowDepth = 0.002 + Math.random() * 0.004

    // Flutter: faster jitter 4-9 Hz, depth 0.4-1.2ms
    this.flutterRate = 4 + Math.random() * 5
    this.flutterDepth = 0.0004 + Math.random() * 0.0008

    if (this.lfo) this.lfo.frequency.value = this.wowRate
    if (this.lfoGain) this.lfoGain.gain.value = this.wowDepth
    if (this.flutter) this.flutter.frequency.value = this.flutterRate
    if (this.flutterGain) this.flutterGain.gain.value = this.flutterDepth
  }
}
