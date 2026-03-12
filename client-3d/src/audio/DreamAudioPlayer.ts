import { useDreamDebugStore } from '../stores/dreamDebugStore'
import { setAudioBands, setAudioBeatKick, setAudioSnareHit } from '../hooks/useAudioAnalyser'
import { randomPitchEffect, type PitchEffect } from './effects'

// ── Constants ────────────────────────────────────────────────────────────

const IR_SAMPLE_RATE = 44100
const FFT_SIZE = 256
const SMOOTHING = 0.15
const FADE_DURATION = 2.0 // seconds for volume fades
const CROSSFADE_DURATION = 3.0 // seconds for track crossfades

const YOUTUBE_API_BASE =
  import.meta.env.VITE_YOUTUBE_SERVICE_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:8081'
    : `${window.location.origin}/youtube`)

// ── AudioLayer type ──────────────────────────────────────────────────────

interface AudioLayer {
  audioEl: HTMLAudioElement
  sourceNode: MediaElementAudioSourceNode
  gainNode: GainNode
  pitchEffect: PitchEffect
  effectOutput: GainNode // pitch effect outputs to this, which feeds into shared lowpass
  spectralFilter: BiquadFilterNode | null // per-layer spectral split (lowpass for lows, highpass for highs)
  cycleTimer: ReturnType<typeof setTimeout> | null
  layerIndex: number
}

// ── Module-level band state (written per-frame via rAF) ─────────────────

let rafId: number | null = null
let currentBass = 0
let currentMid = 0
let currentHigh = 0
let currentEnergy = 0

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// ── DreamAudioPlayer ────────────────────────────────────────────────────

class DreamAudioPlayer {
  private ctx: AudioContext | null = null

  // Multi-layer audio
  private layers: AudioLayer[] = []
  private layerCount = 2

  // Effects chain (shared)
  private lowpass: BiquadFilterNode | null = null
  private convolver: ConvolverNode | null = null
  private wetGain: GainNode | null = null
  private dryGain: GainNode | null = null
  private sidechainGain: GainNode | null = null // sidechain ducking
  private masterGain: GainNode | null = null

  // Spectral processing — separate FX for high frequencies
  private hiSplitFilter: BiquadFilterNode | null = null  // highshelf to extract highs
  private hiDelay: DelayNode | null = null
  private hiDelayFeedback: GainNode | null = null
  private hiDelayWet: GainNode | null = null
  private hiReverb: ConvolverNode | null = null
  private hiReverbGain: GainNode | null = null

  // Radio static / noise
  private noiseGain: GainNode | null = null
  private noiseSource: AudioBufferSourceNode | null = null

  // Analysis — pre-lowpass for raw onset detection
  private preAnalyser: AnalyserNode | null = null
  private preDataArray: Uint8Array<ArrayBuffer> | null = null

  // Analysis — post-chain for visual band data
  private analyser: AnalyserNode | null = null
  private dataArray: Uint8Array<ArrayBuffer> | null = null

  // Spectral layer split crossover (randomized per session, set in ensureContext)
  private spectralCrossover = 1000 // Hz — lows layer gets below this, highs layer gets above

  // State
  private _isPlaying = false
  private videoIds: string[] = []
  private abortController: AbortController | null = null

  get isPlaying(): boolean {
    return this._isPlaying
  }

  // ── Audio context & effects chain ───────────────────────────────────

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx

    this.ctx = new AudioContext({ sampleRate: IR_SAMPLE_RATE })

    // Randomize spectral crossover per session: 600-1400Hz
    // This is the frequency that splits "lows" layers from "highs" layers
    this.spectralCrossover = 600 + Math.random() * 800
    console.log(`[DreamAudio] Spectral crossover: ${this.spectralCrossover.toFixed(0)}Hz`)

    const dbg = useDreamDebugStore.getState()

    // ── Pre-lowpass analyser for raw onset/beat detection ──────────────
    // This taps the signal BEFORE any filtering so kick transients aren't
    // dulled by the lowpass. Uses minimal smoothing for sharp transients.
    this.preAnalyser = this.ctx.createAnalyser()
    this.preAnalyser.fftSize = FFT_SIZE
    this.preAnalyser.smoothingTimeConstant = 0.3 // low smoothing for transient detection
    this.preDataArray = new Uint8Array(this.preAnalyser.frequencyBinCount) as Uint8Array<ArrayBuffer>

    // ── Main lowpass filter ───────────────────────────────────────────
    this.lowpass = this.ctx.createBiquadFilter()
    this.lowpass.type = 'lowpass'
    this.lowpass.frequency.value = dbg.dreamAudioLowpassFreq
    this.lowpass.Q.value = 0.7

    // ── Reverb convolver (main) ───────────────────────────────────────
    this.convolver = this.ctx.createConvolver()
    this.convolver.buffer = this.generateIR(dbg.dreamAudioReverbDecay)

    // Wet/dry mix
    this.wetGain = this.ctx.createGain()
    this.wetGain.gain.value = dbg.dreamAudioWetMix

    this.dryGain = this.ctx.createGain()
    this.dryGain.gain.value = 1.0 - dbg.dreamAudioWetMix

    // ── Spectral processing: extra FX on high frequencies ─────────────
    // High-shelf filter boosts highs, then feeds into delay + extra reverb
    // Creates shimmering, echoing high-end that floats above the murky lows
    this.hiSplitFilter = this.ctx.createBiquadFilter()
    this.hiSplitFilter.type = 'highshelf'
    this.hiSplitFilter.frequency.value = 2000
    this.hiSplitFilter.gain.value = 6 // boost highs by 6dB

    // Ping-pong-ish delay on highs (random delay time per session)
    this.hiDelay = this.ctx.createDelay(2.0)
    this.hiDelay.delayTime.value = 0.15 + Math.random() * 0.35 // 150-500ms
    this.hiDelayFeedback = this.ctx.createGain()
    this.hiDelayFeedback.gain.value = 0.35 + Math.random() * 0.2 // 35-55% feedback
    this.hiDelayWet = this.ctx.createGain()
    this.hiDelayWet.gain.value = 0.15 // subtle blend

    // Delay feedback loop
    this.hiDelay.connect(this.hiDelayFeedback)
    this.hiDelayFeedback.connect(this.hiDelay)
    this.hiDelay.connect(this.hiDelayWet)

    // Extra reverb on highs — longer, brighter than the main reverb
    this.hiReverb = this.ctx.createConvolver()
    this.hiReverb.buffer = this.generateIR(dbg.dreamAudioReverbDecay * 1.5)
    this.hiReverbGain = this.ctx.createGain()
    this.hiReverbGain.gain.value = 0.12

    // ── Master volume ─────────────────────────────────────────────────
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 0 // start silent, fade in

    // Sidechain ducking gain
    this.sidechainGain = this.ctx.createGain()
    this.sidechainGain.gain.value = 1.0

    // Post-chain analyser for visual band data
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = FFT_SIZE
    this.analyser.smoothingTimeConstant = 0.8
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>

    // ── Wiring ────────────────────────────────────────────────────────
    //
    // layers → lowpass ──┬── dry ─────────────────────────────┐
    //                    └── convolver → wet ─────────────────┤
    //                                                         ↓
    // layers → preAnalyser (for beat detection, taps raw)    master → sidechain → dest
    //                                                         ↑
    // layers → hiSplit → hiDelay → hiDelayWet ───────────────┤
    //                  → hiReverb → hiReverbGain ────────────┘
    //                                                    master → analyser

    this.lowpass.connect(this.dryGain)
    this.dryGain.connect(this.masterGain)

    this.lowpass.connect(this.convolver)
    this.convolver.connect(this.wetGain)
    this.wetGain.connect(this.masterGain)

    // Spectral highs path
    this.hiSplitFilter.connect(this.hiDelay)
    this.hiSplitFilter.connect(this.hiReverb)
    this.hiReverb.connect(this.hiReverbGain)
    this.hiReverbGain.connect(this.masterGain)
    this.hiDelayWet.connect(this.masterGain)

    this.masterGain.connect(this.sidechainGain)
    this.sidechainGain.connect(this.ctx.destination)
    this.masterGain.connect(this.analyser)

    return this.ctx
  }

  private generateIR(decay: number): AudioBuffer {
    const ctx = this.ctx!
    const length = Math.floor(IR_SAMPLE_RATE * decay)
    const ir = ctx.createBuffer(2, length, IR_SAMPLE_RATE)

    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch)
      for (let i = 0; i < length; i++) {
        const t = i / IR_SAMPLE_RATE
        const envelope = Math.exp(-t / (decay * 0.35))
        data[i] = (Math.random() * 2 - 1) * envelope
      }
      // Smooth IR to darken the reverb tail
      for (let pass = 0; pass < 3; pass++) {
        for (let i = length - 1; i >= 2; i--) {
          data[i] = (data[i]! + data[i - 1]! + data[i - 2]!) / 3
        }
      }
    }

    return ir
  }

  // ── Noise generation ─────────────────────────────────────────────────

  /** Generate a brown noise buffer (warmer than white, like radio static) */
  private generateNoiseBuffer(duration: number): AudioBuffer {
    const ctx = this.ctx!
    const length = Math.floor(ctx.sampleRate * duration)
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate)

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch)
      let lastOut = 0

      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1

        // Brown noise: integrate white noise with leak
        lastOut = (lastOut + 0.02 * white) / 1.02
        data[i] = lastOut * 3.5 // boost amplitude

        // Add occasional crackle pops (radio tuning texture)
        if (Math.random() < 0.0003) {
          data[i] += (Math.random() - 0.5) * 0.8
        }
      }
    }

    return buffer
  }

  /** Play radio static burst on dream entry, then fade into music */
  private playEntryStatic(): void {
    if (!this.ctx || !this.sidechainGain) return

    const noiseBuffer = this.generateNoiseBuffer(4.0) // 4 seconds of static

    this.noiseSource = this.ctx.createBufferSource()
    this.noiseSource.buffer = noiseBuffer
    this.noiseSource.loop = false

    this.noiseGain = this.ctx.createGain()
    this.noiseGain.gain.value = 0.5

    // Bandpass the noise to sound more like radio tuning
    const noiseBandpass = this.ctx.createBiquadFilter()
    noiseBandpass.type = 'bandpass'
    noiseBandpass.frequency.value = 1000 + Math.random() * 3000
    noiseBandpass.Q.value = 0.8

    // Sweep the bandpass frequency for radio-tuning effect
    const now = this.ctx.currentTime
    noiseBandpass.frequency.setValueAtTime(800, now)
    noiseBandpass.frequency.exponentialRampToValueAtTime(4000, now + 1.0)
    noiseBandpass.frequency.exponentialRampToValueAtTime(600, now + 2.0)
    noiseBandpass.frequency.exponentialRampToValueAtTime(2000, now + 3.0)

    // Fade: start loud, fade out as music fades in
    this.noiseGain.gain.setValueAtTime(0.5, now)
    this.noiseGain.gain.linearRampToValueAtTime(0.6, now + 0.5)
    this.noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 3.5)

    this.noiseSource.connect(noiseBandpass)
    noiseBandpass.connect(this.noiseGain)
    this.noiseGain.connect(this.sidechainGain)

    this.noiseSource.start()
    this.noiseSource.onended = () => {
      this.noiseSource = null
      this.noiseGain = null
    }

    console.log('[DreamAudio] Entry static playing')
  }

  /** Play a brief radio-tuning burst (between track transitions) */
  playTuningBurst(): void {
    if (!this.ctx || !this.sidechainGain) return

    const duration = 0.3 + Math.random() * 0.7 // 0.3-1.0s
    const noiseBuffer = this.generateNoiseBuffer(duration)

    const source = this.ctx.createBufferSource()
    source.buffer = noiseBuffer

    const gain = this.ctx.createGain()
    const now = this.ctx.currentTime
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.25, now + 0.02) // fast attack
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.8)

    // Random bandpass for varied radio texture
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 500 + Math.random() * 5000
    bp.Q.value = 1.0 + Math.random() * 3.0

    source.connect(bp)
    bp.connect(gain)
    gain.connect(this.sidechainGain)

    source.start()
    source.stop(now + duration)
  }

  // ── Param sync (called from DreamScene's useFrame or useEffect) ─────

  syncParams(): void {
    const dbg = useDreamDebugStore.getState()

    if (this.lowpass) {
      this.lowpass.frequency.value = dbg.dreamAudioLowpassFreq
    }
    if (this.wetGain) {
      this.wetGain.gain.value = dbg.dreamAudioWetMix
    }
    if (this.dryGain) {
      this.dryGain.gain.value = 1.0 - dbg.dreamAudioWetMix
    }
    if (this.masterGain && this._isPlaying) {
      this.masterGain.gain.value = dbg.dreamAudioVolume
    }

    // Update layer count if changed
    this.layerCount = dbg.dreamAudioLayerCount
  }

  // ── Per-frame analysis (drives module-level band exports) ───────────

  private startAnalysisLoop(): void {
    if (rafId !== null) return

    const tick = () => {
      if (!this.analyser || !this.dataArray) {
        rafId = null
        return
      }

      // ── Post-chain analyser: smooth band data for visuals ──────────
      this.analyser.getByteFrequencyData(this.dataArray)
      const binCount = this.dataArray.length // 128

      // Bass: bins 0-7
      let bassSum = 0
      for (let i = 0; i < 8; i++) bassSum += this.dataArray[i]!
      const rawBass = bassSum / (8 * 255)

      // Mid: bins 8-39
      let midSum = 0
      for (let i = 8; i < 40; i++) midSum += this.dataArray[i]!
      const rawMid = midSum / (32 * 255)

      // High: bins 40-127
      let highSum = 0
      for (let i = 40; i < binCount; i++) highSum += this.dataArray[i]!
      const rawHigh = highSum / ((binCount - 40) * 255)

      // Energy
      let energySum = 0
      for (let i = 0; i < binCount; i++) energySum += this.dataArray[i]!
      const rawEnergy = energySum / (binCount * 255)

      // Smooth for visual stability
      currentBass = lerp(currentBass, rawBass, SMOOTHING)
      currentMid = lerp(currentMid, rawMid, SMOOTHING)
      currentHigh = lerp(currentHigh, rawHigh, SMOOTHING)
      currentEnergy = lerp(currentEnergy, rawEnergy, SMOOTHING)

      setAudioBands(currentBass, currentMid, currentHigh, currentEnergy)

      // ── Pre-lowpass analyser: raw bass for beat detection ──────────
      // Taps the signal BEFORE the lowpass filter and with low smoothing
      // so kick transients come through sharp and clear
      let rawOnsetBass = rawBass // fallback
      if (this.preAnalyser && this.preDataArray) {
        this.preAnalyser.getByteFrequencyData(this.preDataArray)
        let preBassSum = 0
        for (let i = 0; i < 8; i++) preBassSum += this.preDataArray[i]!
        rawOnsetBass = preBassSum / (8 * 255)
      }

      // Extract snare band (mid-high) from pre-analyser: bins 10-60 (~500Hz-8kHz)
      // This captures the snare's characteristic "crack" and body
      let rawOnsetMidHigh = rawMid // fallback
      if (this.preAnalyser && this.preDataArray) {
        let snareBandSum = 0
        const snareStart = 10 // ~500Hz
        const snareEnd = 60   // ~8kHz
        for (let i = snareStart; i < snareEnd; i++) snareBandSum += this.preDataArray[i]!
        rawOnsetMidHigh = snareBandSum / ((snareEnd - snareStart) * 255)
      }

      this.detectBeats(rawOnsetBass)
      this.detectSnares(rawOnsetMidHigh)

      // Write kick and snare values for shader consumption
      setAudioBeatKick(this._beatKick)
      setAudioSnareHit(this._snareHit)

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
  }

  private stopAnalysisLoop(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    // Zero out band data
    currentBass = 0
    currentMid = 0
    currentHigh = 0
    currentEnergy = 0
    setAudioBands(0, 0, 0, 0)
  }

  // ── Random seek ──────────────────────────────────────────────────────

  private seekToRandomPosition(audio: HTMLAudioElement): void {
    const trySeek = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 20) {
        // Seek to 5%-70% of the track (avoid intros and outros)
        const minPos = audio.duration * 0.05
        const maxPos = audio.duration * 0.7
        audio.currentTime = minPos + Math.random() * (maxPos - minPos)
        console.log(`[DreamAudio] Seeked to ${audio.currentTime.toFixed(1)}s / ${audio.duration.toFixed(1)}s`)
        return true
      }
      return false
    }

    // Try immediately
    if (trySeek()) return

    // If duration not available, wait for metadata or durationchange
    const onDuration = () => {
      audio.removeEventListener('durationchange', onDuration)
      audio.removeEventListener('loadedmetadata', onDuration)
      // Small delay to ensure the seek is accepted
      setTimeout(() => trySeek(), 100)
    }
    audio.addEventListener('durationchange', onDuration)
    audio.addEventListener('loadedmetadata', onDuration)

    // Fallback: try again after 2 seconds
    setTimeout(() => {
      audio.removeEventListener('durationchange', onDuration)
      audio.removeEventListener('loadedmetadata', onDuration)
      trySeek()
    }, 2000)
  }

  // ── BPM Detection (onset detection in bass frequencies) ─────────────

  private currentBPM = 0
  private beatPhase = 0 // 0-1, where in the current beat we are
  private lastBeatTime = 0
  private beatInterval = 0 // ms between beats
  private onsetHistory: number[] = [] // timestamps of detected bass onsets
  private prevOnsetEnergy = 0
  private onsetThreshold = 0.06
  private bpmConfidence = 0 // 0-1 how confident we are in the detected BPM
  private _beatKick = 0 // 0-1, spikes on kick then decays

  // Snare detection state
  private prevSnareEnergy = 0
  private snareThreshold = 0.04  // lower than kick — snares are often quieter
  private lastSnareTime = 0
  private _snareHit = 0 // 0-1, spikes on snare then decays

  getBPM(): number { return this.currentBPM }
  getBeatPhase(): number { return this.beatPhase }
  getBPMConfidence(): number { return this.bpmConfidence }
  getBeatKick(): number { return this._beatKick }
  getSnareHit(): number { return this._snareHit }

  private detectBeats(rawBass: number): void {
    if (!this.analyser || !this.dataArray) return

    // Use RAW (unsmoothed) bass for onset detection — the smoothed value
    // (lerp with 0.15) flattens transients so much that kicks become invisible.
    // Raw bass preserves the sharp edge of a kick drum.
    const bassEnergy = rawBass

    // Onset detection: slow envelope follower so transients create large deltas
    const energyDelta = bassEnergy - this.prevOnsetEnergy
    this.prevOnsetEnergy = bassEnergy * 0.05 + this.prevOnsetEnergy * 0.95

    const now = performance.now()

    // Decay beat kick value each frame (~0.92 per frame at 60fps ≈ fast decay)
    this._beatKick *= 0.92

    if (energyDelta > this.onsetThreshold && now - this.lastBeatTime > 200) {
      // Detected an onset (beat) — fire the kick
      // Scale delta to 0-1 range: raw bass deltas on techno kicks can be 0.1-0.5+
      this._beatKick = Math.min(1.0, energyDelta * 6.0)
      this.lastBeatTime = now
      this.onsetHistory.push(now)

      // Sidechain ducking — fast attack, slow release
      // Duck to 0.4 (60% reduction) on kick, release over 300ms
      if (this.sidechainGain && this.ctx) {
        const g = this.sidechainGain.gain
        const t = this.ctx.currentTime
        g.cancelScheduledValues(t)
        g.setValueAtTime(g.value, t)
        g.linearRampToValueAtTime(0.4, t + 0.01) // 10ms attack
        g.linearRampToValueAtTime(1.0, t + 0.30) // 300ms release
      }

      // Keep last 20 onsets
      if (this.onsetHistory.length > 20) {
        this.onsetHistory.shift()
      }

      // Calculate BPM from inter-onset intervals
      if (this.onsetHistory.length >= 4) {
        const intervals: number[] = []
        for (let i = 1; i < this.onsetHistory.length; i++) {
          const interval = this.onsetHistory[i]! - this.onsetHistory[i - 1]!
          // Filter out unreasonable intervals (only keep 70-200 BPM range)
          if (interval > 300 && interval < 860) {
            intervals.push(interval)
          }
        }

        if (intervals.length >= 3) {
          // Use median interval for robustness
          intervals.sort((a, b) => a - b)
          const medianInterval = intervals[Math.floor(intervals.length / 2)]!

          // Also try double-time and half-time
          const bpm = 60000 / medianInterval
          const prevBPM = this.currentBPM

          // Smooth BPM updates (don't jump wildly)
          if (prevBPM === 0) {
            this.currentBPM = bpm
          } else {
            // Check if new BPM is close to current, double, or half
            const ratio = bpm / prevBPM
            if (ratio > 0.9 && ratio < 1.1) {
              // Close to current — smooth update
              this.currentBPM = this.currentBPM * 0.8 + bpm * 0.2
            } else if (ratio > 1.8 && ratio < 2.2) {
              // Double time — use half
              this.currentBPM = this.currentBPM * 0.8 + (bpm / 2) * 0.2
            } else if (ratio > 0.4 && ratio < 0.6) {
              // Half time — use double
              this.currentBPM = this.currentBPM * 0.8 + (bpm * 2) * 0.2
            } else {
              // Big change — new song section, jump
              this.currentBPM = bpm
            }
          }

          this.beatInterval = 60000 / this.currentBPM

          // Confidence based on variance of intervals
          const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
          const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length
          const stdDev = Math.sqrt(variance)
          // Low std dev relative to mean = high confidence
          this.bpmConfidence = Math.max(0, Math.min(1, 1 - (stdDev / mean) * 3))
        }
      }
    }

    // Update beat phase (where in the current beat we are)
    if (this.beatInterval > 0) {
      const elapsed = now - this.lastBeatTime
      this.beatPhase = (elapsed % this.beatInterval) / this.beatInterval
    }
  }

  // ── Snare detection (mid-high frequency onset) ─────────────────────

  private detectSnares(rawMidHigh: number): void {
    // Snares have a distinctive broadband "crack" in the 2-8kHz range
    // plus a body around 150-300Hz. We detect the high-frequency transient
    // which is what makes snare rolls visually exciting.
    const snareEnergy = rawMidHigh

    // Slow envelope follower (same approach as kick detection)
    const energyDelta = snareEnergy - this.prevSnareEnergy
    this.prevSnareEnergy = snareEnergy * 0.08 + this.prevSnareEnergy * 0.92

    const now = performance.now()

    // Decay snare value each frame (~0.88 per frame = faster decay than kick for snappy feel)
    this._snareHit *= 0.88

    // Snares can be closer together than kicks (snare rolls!), so shorter cooldown (100ms)
    if (energyDelta > this.snareThreshold && now - this.lastSnareTime > 100) {
      // Make sure this isn't just a kick bleed-through:
      // If a kick JUST fired (within 30ms), skip — it's likely the same transient
      if (now - this.lastBeatTime < 30) return

      this._snareHit = Math.min(1.0, energyDelta * 8.0)
      this.lastSnareTime = now
    }
  }

  // ── Track loading ───────────────────────────────────────────────────

  private async loadAudioTrack(videoId: string, signal: AbortSignal): Promise<HTMLAudioElement> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Aborted'))
        return
      }

      const audio = document.createElement('audio')
      audio.crossOrigin = 'anonymous'
      audio.preload = 'auto'
      audio.src = `${YOUTUBE_API_BASE}/proxy/${videoId}?audioOnly=true`

      const cleanup = () => {
        audio.removeEventListener('canplay', onCanPlay)
        audio.removeEventListener('error', onError)
      }

      const onCanPlay = () => {
        cleanup()
        resolve(audio)
      }

      const onError = () => {
        cleanup()
        reject(new Error(`Audio load failed: ${audio.error?.message ?? 'unknown'}`))
      }

      audio.addEventListener('canplay', onCanPlay)
      audio.addEventListener('error', onError)

      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Audio load timeout'))
      }, 15_000)

      signal.addEventListener('abort', () => {
        clearTimeout(timeout)
        cleanup()
        audio.pause()
        audio.src = ''
        reject(new Error('Aborted'))
      })

      audio.load()

      // Clear timeout on resolve/reject
      const origResolve = resolve
      resolve = (v) => { clearTimeout(timeout); origResolve(v) }
      const origReject = reject
      reject = (e) => { clearTimeout(timeout); origReject(e) }
    })
  }

  // ── Layer info (for debug panel) ──────────────────────────────────

  getLayerInfo(): Array<{ effect: string; videoId: string }> {
    return this.layers.filter(Boolean).map(l => ({
      effect: l.pitchEffect.name,
      videoId: l.audioEl.src.split('/').pop()?.split('?')[0] ?? '?',
    }))
  }

  // ── Multi-layer playback ──────────────────────────────────────────

  private async playTrackOnLayer(layerIndex: number, videoId: string): Promise<void> {
    if (!this.abortController || this.abortController.signal.aborted) return

    const dbg = useDreamDebugStore.getState()
    const ctx = this.ensureContext()

    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    try {
      const audio = await this.loadAudioTrack(videoId, this.abortController!.signal)
      if (this.abortController!.signal.aborted) {
        audio.pause()
        audio.src = ''
        return
      }

      // Disable browser pitch correction — we WANT pitch to drop with speed (DJ Screw)
      audio.preservesPitch = false

      // Set playback rate
      const rate = dbg.dreamAudioRateMin +
        Math.random() * (dbg.dreamAudioRateMax - dbg.dreamAudioRateMin)
      audio.playbackRate = rate

      // Random seek
      this.seekToRandomPosition(audio)

      // Beat-matched rate
      if (this.currentBPM > 0 && this.bpmConfidence > 0.4) {
        const targetBeatInterval = this.beatInterval
        if (targetBeatInterval > 0) {
          const musicalRatios = [0.5, 0.667, 0.75, 0.8, 1.0]
          const chosenRatio = musicalRatios[Math.floor(Math.random() * musicalRatios.length)]!
          const matchedRate = rate * chosenRatio
          const clampedRate = Math.max(dbg.dreamAudioRateMin, Math.min(dbg.dreamAudioRateMax, matchedRate))
          audio.playbackRate = clampedRate
          console.log(`[DreamAudio] Layer ${layerIndex} beat-matched rate: ${clampedRate.toFixed(3)}x (ratio: ${chosenRatio}, BPM: ${this.currentBPM.toFixed(1)}, confidence: ${this.bpmConfidence.toFixed(2)})`)
        }
      }

      // Beat-aligned crossfade
      if (this.beatInterval > 0 && this.bpmConfidence > 0.3) {
        const msUntilNextBeat = this.beatInterval * (1 - this.beatPhase)
        if (msUntilNextBeat > 50 && msUntilNextBeat < this.beatInterval) {
          await new Promise(r => setTimeout(r, msUntilNextBeat))
          if (this.abortController?.signal.aborted) {
            audio.pause()
            audio.src = ''
            return
          }
        }
      }

      // If replacing an existing layer, crossfade out the old one
      const oldLayer = this.layers[layerIndex]
      if (oldLayer) {
        const oldAudio = oldLayer.audioEl
        const oldSource = oldLayer.sourceNode
        const oldGain = oldLayer.gainNode
        const oldEffect = oldLayer.pitchEffect
        const oldEffectOutput = oldLayer.effectOutput

        // Fade out the old layer's gain
        oldGain.gain.linearRampToValueAtTime(0, ctx.currentTime + CROSSFADE_DURATION)

        // Clean up after crossfade
        const oldSpectralFilter = oldLayer.spectralFilter
        setTimeout(() => {
          oldAudio.pause()
          oldAudio.src = ''
          oldAudio.load()
          try { oldSource.disconnect() } catch {}
          try { oldGain.disconnect() } catch {}
          try { oldEffect.disconnect() } catch {}
          try { oldEffectOutput.disconnect() } catch {}
          try { oldSpectralFilter?.disconnect() } catch {}
        }, CROSSFADE_DURATION * 1000 + 500)
      }

      // Create per-layer nodes
      const sourceNode = ctx.createMediaElementSource(audio)
      const layerVolume = dbg.dreamAudioVolume / this.layerCount
      const gainNode = ctx.createGain()
      gainNode.gain.value = layerVolume

      const effectOutput = ctx.createGain()
      effectOutput.gain.value = 1.0

      // Create and connect pitch effect: sourceNode → effect → effectOutput
      const pitchEffect = randomPitchEffect()
      pitchEffect.connect(ctx, sourceNode, effectOutput)

      // Spectral layer split: layer 0 keeps lows, layer 1 keeps highs, others full spectrum
      // This creates the effect of one track's bass driving the mix while another's
      // presence/texture floats on top — unexpected harmonic combinations
      let spectralFilter: BiquadFilterNode | null = null
      if (layerIndex === 0) {
        spectralFilter = ctx.createBiquadFilter()
        spectralFilter.type = 'lowpass'
        spectralFilter.frequency.value = this.spectralCrossover
        spectralFilter.Q.value = 0.9
      } else if (layerIndex === 1) {
        spectralFilter = ctx.createBiquadFilter()
        spectralFilter.type = 'highpass'
        spectralFilter.frequency.value = this.spectralCrossover
        spectralFilter.Q.value = 0.9
      }

      // Wire: effectOutput → gainNode → [spectralFilter] → lowpass (main chain)
      //                              → preAnalyser (raw, bypasses spectral filter for clean beat detection)
      //                              → hiSplitFilter (spectral highs processing, full spectrum)
      effectOutput.connect(gainNode)
      if (spectralFilter) {
        gainNode.connect(spectralFilter)
        spectralFilter.connect(this.lowpass!)
      } else {
        gainNode.connect(this.lowpass!)
      }
      gainNode.connect(this.preAnalyser!)
      gainNode.connect(this.hiSplitFilter!)

      // Store layer
      this.layers[layerIndex] = {
        audioEl: audio,
        sourceNode,
        gainNode,
        pitchEffect,
        effectOutput,
        spectralFilter,
        cycleTimer: oldLayer?.cycleTimer ?? null,
        layerIndex,
      }

      await audio.play()

      // Fade in master on first layer
      if (this.masterGain && !oldLayer) {
        this.masterGain.gain.linearRampToValueAtTime(
          dbg.dreamAudioVolume,
          ctx.currentTime + FADE_DURATION
        )
      }

      // Reset onset history for new tracks
      this.onsetHistory = []
      this.prevOnsetEnergy = 0

      console.log(`[DreamAudio] Layer ${layerIndex} playing ${videoId} at ${audio.playbackRate.toFixed(3)}x with effect "${pitchEffect.name}"`)
    } catch (err) {
      if (this.abortController?.signal.aborted) return
      console.warn(`[DreamAudio] Layer ${layerIndex} failed to play track:`, err)
    }
  }

  private scheduleLayerCycle(layerIndex: number): void {
    const delay = 60_000 + Math.random() * 60_000

    const layer = this.layers[layerIndex]
    if (layer?.cycleTimer) clearTimeout(layer.cycleTimer)

    const timer = setTimeout(async () => {
      if (!this._isPlaying || this.videoIds.length === 0) return

      // Radio tuning burst before switching tracks (50% chance)
      if (Math.random() < 0.5) {
        this.playTuningBurst()
      }

      // Pick a random video different from this layer's current
      const currentSrc = this.layers[layerIndex]?.audioEl?.src ?? ''
      let nextId: string
      do {
        nextId = this.videoIds[Math.floor(Math.random() * this.videoIds.length)]!
      } while (this.videoIds.length > 1 && currentSrc.includes(nextId))

      await this.playTrackOnLayer(layerIndex, nextId)
      this.scheduleLayerCycle(layerIndex)
    }, delay)

    if (this.layers[layerIndex]) {
      this.layers[layerIndex].cycleTimer = timer
    }
  }

  // ── Playback control ────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this._isPlaying) return

    const dbg = useDreamDebugStore.getState()
    if (!dbg.dreamAudioEnabled) return

    this._isPlaying = true
    this.abortController = new AbortController()
    this.layerCount = dbg.dreamAudioLayerCount

    // Fetch available audio IDs
    try {
      const res = await fetch(`${YOUTUBE_API_BASE}/cache/list?limit=20&random=true`, {
        signal: this.abortController.signal,
      })
      if (!res.ok) throw new Error('Cache list fetch failed')
      const data = await res.json()
      this.videoIds = (data.videoIds as string[]) || []
    } catch {
      this._isPlaying = false
      return
    }

    if (this.videoIds.length === 0) {
      console.warn('[DreamAudio] No cached audio available')
      this._isPlaying = false
      return
    }

    // Start analysis loop & play entry static
    this.ensureContext()
    this.playEntryStatic()
    this.startAnalysisLoop()

    // Launch layers with staggered starts — delay first layer to let static play
    const staticLeadIn = 1500 + Math.random() * 1000 // 1.5-2.5s of static before music
    for (let i = 0; i < this.layerCount && i < this.videoIds.length; i++) {
      const videoId = this.videoIds[i % this.videoIds.length]!
      const delay = staticLeadIn + i * (5000 + Math.random() * 10000)
      setTimeout(() => {
        void this.playTrackOnLayer(i, videoId)
        this.scheduleLayerCycle(i)
      }, delay)
    }
  }

  async stop(): Promise<void> {
    if (!this._isPlaying) return
    this._isPlaying = false

    // Cancel pending operations
    this.abortController?.abort()
    this.abortController = null

    // Clear all layer cycle timers
    for (const layer of this.layers) {
      if (layer?.cycleTimer) {
        clearTimeout(layer.cycleTimer)
        layer.cycleTimer = null
      }
    }

    this.stopAnalysisLoop()

    // Fade out master
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + FADE_DURATION)

      // Wait for fade then clean up
      await new Promise((resolve) => setTimeout(resolve, FADE_DURATION * 1000 + 200))
    }

    this.cleanup()
  }

  private cleanup(): void {
    // Clean up all layers
    for (const layer of this.layers) {
      if (!layer) continue
      layer.audioEl.pause()
      layer.audioEl.src = ''
      layer.audioEl.load()
      try { layer.sourceNode.disconnect() } catch {}
      try { layer.gainNode.disconnect() } catch {}
      try { layer.pitchEffect.disconnect() } catch {}
      try { layer.effectOutput.disconnect() } catch {}
      try { layer.spectralFilter?.disconnect() } catch {}
      if (layer.cycleTimer) clearTimeout(layer.cycleTimer)
    }
    this.layers = []

    // Stop noise
    try { this.noiseSource?.stop() } catch {}
    try { this.noiseSource?.disconnect() } catch {}
    try { this.noiseGain?.disconnect() } catch {}
    this.noiseSource = null
    this.noiseGain = null

    // Disconnect effects chain but keep context alive for re-use
    try { this.lowpass?.disconnect() } catch {}
    try { this.convolver?.disconnect() } catch {}
    try { this.wetGain?.disconnect() } catch {}
    try { this.dryGain?.disconnect() } catch {}
    try { this.sidechainGain?.disconnect() } catch {}
    try { this.masterGain?.disconnect() } catch {}
    try { this.analyser?.disconnect() } catch {}
    try { this.preAnalyser?.disconnect() } catch {}
    try { this.hiSplitFilter?.disconnect() } catch {}
    try { this.hiDelay?.disconnect() } catch {}
    try { this.hiDelayFeedback?.disconnect() } catch {}
    try { this.hiDelayWet?.disconnect() } catch {}
    try { this.hiReverb?.disconnect() } catch {}
    try { this.hiReverbGain?.disconnect() } catch {}

    this.lowpass = null
    this.convolver = null
    this.wetGain = null
    this.dryGain = null
    this.sidechainGain = null
    this.masterGain = null
    this.analyser = null
    this.dataArray = null
    this.preAnalyser = null
    this.preDataArray = null
    this.hiSplitFilter = null
    this.hiDelay = null
    this.hiDelayFeedback = null
    this.hiDelayWet = null
    this.hiReverb = null
    this.hiReverbGain = null

    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close()
    }
    this.ctx = null
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

let _instance: DreamAudioPlayer | null = null

export function getDreamAudioPlayer(): DreamAudioPlayer {
  if (!_instance) _instance = new DreamAudioPlayer()
  return _instance
}
