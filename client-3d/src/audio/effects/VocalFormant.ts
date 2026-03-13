// ── VocalFormant ──────────────────────────────────────────────────────────
//
// Global formant resonator chain. Places 4 peaking EQ filters at vocal
// formant frequencies for female choir vowels, with very slow LFO wobble
// on each filter's center frequency. This gives any audio a subtle "singing"
// quality that makes dream mode feel more angelic.
//
// NOT a PitchEffect — this is a global chain wired between the shared
// lowpass filter and the wet/dry reverb split in DreamAudioPlayer.

const FORMANT_CENTERS = [350, 900, 2400, 3500] // Hz — female choir vowel formants
const FORMANT_Q = 3.5
const FORMANT_GAIN_DB = 3 // dB per filter
const LFO_RATES = [0.07, 0.05, 0.09, 0.06] // Hz — one cycle every 11–20 seconds
const LFO_DEPTHS = [35, 40, 50, 30] // Hz peak deviation per filter

export class VocalFormant {
  private filters: BiquadFilterNode[] = []
  private lfos: OscillatorNode[] = []
  private lfoGains: GainNode[] = []
  private connected = false

  connect(ctx: AudioContext, input: AudioNode, output: AudioNode): void {
    if (this.connected) return

    for (let i = 0; i < FORMANT_CENTERS.length; i++) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'peaking'
      filter.frequency.value = FORMANT_CENTERS[i]!
      filter.Q.value = FORMANT_Q
      filter.gain.value = FORMANT_GAIN_DB

      // LFO modulates filter center frequency
      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = LFO_RATES[i]!

      const lfoGain = ctx.createGain()
      lfoGain.gain.value = LFO_DEPTHS[i]!

      lfo.connect(lfoGain)
      lfoGain.connect(filter.frequency)
      lfo.start()

      this.filters.push(filter)
      this.lfos.push(lfo)
      this.lfoGains.push(lfoGain)
    }

    // Chain filters serially: input → f0 → f1 → f2 → f3 → output
    input.connect(this.filters[0]!)
    for (let i = 0; i < this.filters.length - 1; i++) {
      this.filters[i]!.connect(this.filters[i + 1]!)
    }
    this.filters[this.filters.length - 1]!.connect(output)

    this.connected = true
  }

  disconnect(): void {
    for (const lfo of this.lfos) {
      try { lfo.stop() } catch {}
      try { lfo.disconnect() } catch {}
    }
    for (const gain of this.lfoGains) {
      try { gain.disconnect() } catch {}
    }
    for (const filter of this.filters) {
      try { filter.disconnect() } catch {}
    }
    this.filters = []
    this.lfos = []
    this.lfoGains = []
    this.connected = false
  }

  /** Toggle formant effect without rewiring. Zeroing peaking EQ gain = pass-through. */
  setEnabled(enabled: boolean, depthScale = 1.0): void {
    for (let i = 0; i < this.filters.length; i++) {
      this.filters[i]!.gain.value = enabled ? FORMANT_GAIN_DB : 0
      this.lfoGains[i]!.gain.value = enabled ? (LFO_DEPTHS[i]! * depthScale) : 0
    }
  }
}
