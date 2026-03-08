import SamJs from 'sam-js'

// ── Types ────────────────────────────────────────────────────────────────

export interface SamSingerParams {
  samPitch: number       // 0-255 SAM formant pitch
  samSpeed: number       // 0-255 SAM speech rate
  samMouth: number       // 0-255
  samThroat: number      // 0-255
  lowpassFreq: number    // Hz cutoff
  lowpassQ: number       // filter resonance
  reverbDecay: number    // seconds
  reverbMix: number      // 0-1 wet/dry
  masterGain: number     // 0-1
  baseMidiNote: number   // MIDI note mapping to playbackRate 1.0
  chorusEnabled: boolean
  chorusRate: number     // LFO Hz (0.1-5)
  chorusDepth: number    // LFO amplitude in seconds (0.001-0.02)
  chorusWet: number      // 0-1 chorus voice level
}

export interface NoteEvent {
  syllable: string       // text for SAM to speak
  midiNote: number       // MIDI note number (60=C4)
  duration: number       // seconds
  rest: number           // seconds of silence after note
}

// ── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_PARAMS: SamSingerParams = {
  samPitch: 64,
  samSpeed: 72,
  samMouth: 128,
  samThroat: 128,
  lowpassFreq: 2500,
  lowpassQ: 0.7,
  reverbDecay: 2.0,
  reverbMix: 0.6,
  masterGain: 0.5,
  baseMidiNote: 60,
  chorusEnabled: true,
  chorusRate: 1.2,
  chorusDepth: 0.006,
  chorusWet: 0.5,
}

const SAMPLE_RATE = 22050 // SAM's native sample rate
const IR_SAMPLE_RATE = 44100

// ── SamSinger class ──────────────────────────────────────────────────────

export class SamSinger {
  private ctx: AudioContext | null = null

  // Effects chain nodes
  private lowpass: BiquadFilterNode | null = null
  private chorusMix: GainNode | null = null
  private chorusDelay1: DelayNode | null = null
  private chorusDelay2: DelayNode | null = null
  private chorusLfo1: OscillatorNode | null = null
  private chorusLfo2: OscillatorNode | null = null
  private chorusLfoGain1: GainNode | null = null
  private chorusLfoGain2: GainNode | null = null
  private chorusVoice1: GainNode | null = null
  private chorusVoice2: GainNode | null = null
  private convolver: ConvolverNode | null = null
  private wetGain: GainNode | null = null
  private dryGain: GainNode | null = null
  private masterGainNode: GainNode | null = null

  private params: SamSingerParams = { ...DEFAULT_PARAMS }
  private scheduledSources: AudioBufferSourceNode[] = []
  private _isSinging = false
  private stopTimeoutId: ReturnType<typeof setTimeout> | null = null

  get isSinging(): boolean {
    return this._isSinging
  }

  // ── Init / teardown ──────────────────────────────────────────────────

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx

    this.ctx = new AudioContext({ sampleRate: IR_SAMPLE_RATE })

    // ─── Lowpass filter ───────────────────────────────────────────
    this.lowpass = this.ctx.createBiquadFilter()
    this.lowpass.type = 'lowpass'
    this.lowpass.frequency.value = this.params.lowpassFreq
    this.lowpass.Q.value = this.params.lowpassQ

    // ─── Chorus mix bus (sums direct + chorus voices) ─────────────
    this.chorusMix = this.ctx.createGain()
    this.chorusMix.gain.value = 1.0

    // Direct path: lowpass → chorusMix
    this.lowpass.connect(this.chorusMix)

    // Chorus voice 1: lowpass → delay1 → voice1Gain → chorusMix
    this.chorusDelay1 = this.ctx.createDelay(0.1)
    this.chorusDelay1.delayTime.value = 0.025 // 25ms base
    this.chorusVoice1 = this.ctx.createGain()
    this.chorusVoice1.gain.value = this.params.chorusEnabled ? this.params.chorusWet * 0.5 : 0
    this.lowpass.connect(this.chorusDelay1)
    this.chorusDelay1.connect(this.chorusVoice1)
    this.chorusVoice1.connect(this.chorusMix)

    // Chorus voice 2: lowpass → delay2 → voice2Gain → chorusMix
    this.chorusDelay2 = this.ctx.createDelay(0.1)
    this.chorusDelay2.delayTime.value = 0.035 // 35ms base (offset from voice 1)
    this.chorusVoice2 = this.ctx.createGain()
    this.chorusVoice2.gain.value = this.params.chorusEnabled ? this.params.chorusWet * 0.5 : 0
    this.lowpass.connect(this.chorusDelay2)
    this.chorusDelay2.connect(this.chorusVoice2)
    this.chorusVoice2.connect(this.chorusMix)

    // LFO 1: modulates delay1 time
    this.chorusLfo1 = this.ctx.createOscillator()
    this.chorusLfo1.type = 'sine'
    this.chorusLfo1.frequency.value = this.params.chorusRate
    this.chorusLfoGain1 = this.ctx.createGain()
    this.chorusLfoGain1.gain.value = this.params.chorusDepth
    this.chorusLfo1.connect(this.chorusLfoGain1)
    this.chorusLfoGain1.connect(this.chorusDelay1.delayTime)
    this.chorusLfo1.start()

    // LFO 2: modulates delay2 time (different rate for width)
    this.chorusLfo2 = this.ctx.createOscillator()
    this.chorusLfo2.type = 'sine'
    this.chorusLfo2.frequency.value = this.params.chorusRate * 1.4 // offset rate
    this.chorusLfoGain2 = this.ctx.createGain()
    this.chorusLfoGain2.gain.value = this.params.chorusDepth
    this.chorusLfo2.connect(this.chorusLfoGain2)
    this.chorusLfoGain2.connect(this.chorusDelay2.delayTime)
    this.chorusLfo2.start()

    // ─── Reverb ───────────────────────────────────────────────────
    this.convolver = this.ctx.createConvolver()
    this.convolver.buffer = this.generateImpulseResponse()

    this.wetGain = this.ctx.createGain()
    this.wetGain.gain.value = this.params.reverbMix

    this.dryGain = this.ctx.createGain()
    this.dryGain.gain.value = 1.0 - this.params.reverbMix

    // ─── Master ───────────────────────────────────────────────────
    this.masterGainNode = this.ctx.createGain()
    this.masterGainNode.gain.value = this.params.masterGain

    // ─── Final wiring ─────────────────────────────────────────────
    // chorusMix → dry → master
    this.chorusMix.connect(this.dryGain)
    this.dryGain.connect(this.masterGainNode)

    // chorusMix → convolver → wet → master
    this.chorusMix.connect(this.convolver)
    this.convolver.connect(this.wetGain)
    this.wetGain.connect(this.masterGainNode)

    this.masterGainNode.connect(this.ctx.destination)

    return this.ctx
  }

  dispose(): void {
    this.stop()
    if (this.chorusLfo1) { this.chorusLfo1.stop(); this.chorusLfo1.disconnect() }
    if (this.chorusLfo2) { this.chorusLfo2.stop(); this.chorusLfo2.disconnect() }
    if (this.chorusLfoGain1) this.chorusLfoGain1.disconnect()
    if (this.chorusLfoGain2) this.chorusLfoGain2.disconnect()
    if (this.chorusDelay1) this.chorusDelay1.disconnect()
    if (this.chorusDelay2) this.chorusDelay2.disconnect()
    if (this.chorusVoice1) this.chorusVoice1.disconnect()
    if (this.chorusVoice2) this.chorusVoice2.disconnect()
    if (this.chorusMix) this.chorusMix.disconnect()
    if (this.lowpass) this.lowpass.disconnect()
    if (this.convolver) this.convolver.disconnect()
    if (this.wetGain) this.wetGain.disconnect()
    if (this.dryGain) this.dryGain.disconnect()
    if (this.masterGainNode) this.masterGainNode.disconnect()
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close()
    }
    this.ctx = null
  }

  // ── Param updates ────────────────────────────────────────────────────

  updateParams(params: Partial<SamSingerParams>): void {
    const prev = { ...this.params }
    Object.assign(this.params, params)

    // Live-update audio nodes if context exists
    if (this.lowpass) {
      this.lowpass.frequency.value = this.params.lowpassFreq
      this.lowpass.Q.value = this.params.lowpassQ
    }
    if (this.wetGain) {
      this.wetGain.gain.value = this.params.reverbMix
    }
    if (this.dryGain) {
      this.dryGain.gain.value = 1.0 - this.params.reverbMix
    }
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = this.params.masterGain
    }

    // Chorus param updates
    const chorusLevel = this.params.chorusEnabled ? this.params.chorusWet * 0.5 : 0
    if (this.chorusVoice1) this.chorusVoice1.gain.value = chorusLevel
    if (this.chorusVoice2) this.chorusVoice2.gain.value = chorusLevel
    if (this.chorusLfo1) this.chorusLfo1.frequency.value = this.params.chorusRate
    if (this.chorusLfo2) this.chorusLfo2.frequency.value = this.params.chorusRate * 1.4
    if (this.chorusLfoGain1) this.chorusLfoGain1.gain.value = this.params.chorusDepth
    if (this.chorusLfoGain2) this.chorusLfoGain2.gain.value = this.params.chorusDepth

    // Regenerate reverb IR if decay changed significantly
    if (
      this.convolver &&
      this.ctx &&
      Math.abs(this.params.reverbDecay - prev.reverbDecay) > 0.05
    ) {
      this.convolver.buffer = this.generateImpulseResponse()
    }
  }

  // ── Synthetic impulse response ───────────────────────────────────────

  private generateImpulseResponse(): AudioBuffer {
    const ctx = this.ctx!
    const decay = this.params.reverbDecay
    const length = Math.floor(IR_SAMPLE_RATE * decay)
    const ir = ctx.createBuffer(2, length, IR_SAMPLE_RATE)

    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch)
      for (let i = 0; i < length; i++) {
        const t = i / IR_SAMPLE_RATE
        // Exponential decay envelope
        const envelope = Math.exp(-t / (decay * 0.35))
        const noise = Math.random() * 2 - 1
        data[i] = noise * envelope
      }

      // 3-tap moving average passes to roll off highs in the IR
      // Makes reverb sound muffled rather than metallic
      for (let pass = 0; pass < 3; pass++) {
        for (let i = length - 1; i >= 2; i--) {
          data[i] = (data[i] + data[i - 1] + data[i - 2]) / 3
        }
      }
    }

    return ir
  }

  // ── SAM buffer rendering ─────────────────────────────────────────────

  private renderSyllable(syllable: string): AudioBuffer | null {
    const sam = new SamJs({
      pitch: this.params.samPitch,
      speed: this.params.samSpeed,
      mouth: this.params.samMouth,
      throat: this.params.samThroat,
      singmode: true,
    })

    const buf8 = sam.buf8(syllable)
    if (!buf8 || !(buf8 instanceof Uint8Array)) return null

    const ctx = this.ctx!
    const audioBuffer = ctx.createBuffer(1, buf8.length, SAMPLE_RATE)
    const channelData = audioBuffer.getChannelData(0)
    for (let i = 0; i < buf8.length; i++) {
      channelData[i] = (buf8[i] - 128) / 128
    }

    return audioBuffer
  }

  // ── Playback ─────────────────────────────────────────────────────────

  sing(melody: NoteEvent[]): void {
    const ctx = this.ensureContext()

    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }

    // Stop any current playback
    this.stop()
    this._isSinging = true

    let offset = ctx.currentTime + 0.05 // small lookahead

    for (const note of melody) {
      const buffer = this.renderSyllable(note.syllable)
      if (!buffer) continue

      const source = ctx.createBufferSource()
      source.buffer = buffer

      // Musical pitch: shift playback rate relative to base MIDI note
      const semitones = note.midiNote - this.params.baseMidiNote
      source.playbackRate.value = Math.pow(2, semitones / 12)

      source.connect(this.lowpass!)

      source.start(offset)
      this.scheduledSources.push(source)

      // Advance timeline
      offset += note.duration + note.rest
    }

    // Auto-clear singing state after melody finishes + reverb tail
    const totalDuration = (offset - ctx.currentTime) + this.params.reverbDecay + 0.5
    this.stopTimeoutId = setTimeout(() => {
      this._isSinging = false
      this.scheduledSources = []
    }, totalDuration * 1000)
  }

  singOne(syllable: string, midiNote: number): void {
    this.sing([{ syllable, midiNote, duration: 0.8, rest: 0 }])
  }

  stop(): void {
    if (this.stopTimeoutId) {
      clearTimeout(this.stopTimeoutId)
      this.stopTimeoutId = null
    }

    for (const source of this.scheduledSources) {
      try {
        source.stop()
        source.disconnect()
      } catch {
        // Already stopped
      }
    }
    this.scheduledSources = []
    this._isSinging = false
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

let _instance: SamSinger | null = null

export function getSamSinger(): SamSinger {
  if (!_instance) _instance = new SamSinger()
  return _instance
}
