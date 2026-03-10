import { useDreamDebugStore } from '../stores/dreamDebugStore'
import { setAudioBands } from '../hooks/useAudioAnalyser'
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
  private masterGain: GainNode | null = null

  // Analysis
  private analyser: AnalyserNode | null = null
  private dataArray: Uint8Array<ArrayBuffer> | null = null

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

    const dbg = useDreamDebugStore.getState()

    // Lowpass filter
    this.lowpass = this.ctx.createBiquadFilter()
    this.lowpass.type = 'lowpass'
    this.lowpass.frequency.value = dbg.dreamAudioLowpassFreq
    this.lowpass.Q.value = 0.7

    // Reverb convolver
    this.convolver = this.ctx.createConvolver()
    this.convolver.buffer = this.generateIR(dbg.dreamAudioReverbDecay)

    // Wet/dry mix
    this.wetGain = this.ctx.createGain()
    this.wetGain.gain.value = dbg.dreamAudioWetMix

    this.dryGain = this.ctx.createGain()
    this.dryGain.gain.value = 1.0 - dbg.dreamAudioWetMix

    // Master volume
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 0 // start silent, fade in

    // Analyser for writing band data
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = FFT_SIZE
    this.analyser.smoothingTimeConstant = 0.8
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>

    // Wiring: lowpass → dry → master → destination
    //         lowpass → convolver → wet → master → destination
    //         master → analyser (for band data)
    this.lowpass.connect(this.dryGain)
    this.dryGain.connect(this.masterGain)

    this.lowpass.connect(this.convolver)
    this.convolver.connect(this.wetGain)
    this.wetGain.connect(this.masterGain)

    this.masterGain.connect(this.ctx.destination)
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

      // Smooth
      currentBass = lerp(currentBass, rawBass, SMOOTHING)
      currentMid = lerp(currentMid, rawMid, SMOOTHING)
      currentHigh = lerp(currentHigh, rawHigh, SMOOTHING)
      currentEnergy = lerp(currentEnergy, rawEnergy, SMOOTHING)

      // Write to shared module-level exports
      setAudioBands(currentBass, currentMid, currentHigh, currentEnergy)

      // Run beat detection
      this.detectBeats()

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
  private onsetThreshold = 0.15
  private bpmConfidence = 0 // 0-1 how confident we are in the detected BPM

  getBPM(): number { return this.currentBPM }
  getBeatPhase(): number { return this.beatPhase }
  getBPMConfidence(): number { return this.bpmConfidence }

  private detectBeats(): void {
    if (!this.analyser || !this.dataArray) return

    // We're already reading FFT data in the analysis loop, so just
    // look at the bass energy for onset detection
    const bassEnergy = currentBass

    // Onset detection: look for sudden energy increases in bass
    const energyDelta = bassEnergy - this.prevOnsetEnergy
    this.prevOnsetEnergy = bassEnergy * 0.7 + this.prevOnsetEnergy * 0.3 // smoothed envelope

    const now = performance.now()

    if (energyDelta > this.onsetThreshold && now - this.lastBeatTime > 200) {
      // Detected an onset (beat)
      this.lastBeatTime = now
      this.onsetHistory.push(now)

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
        setTimeout(() => {
          oldAudio.pause()
          oldAudio.src = ''
          oldAudio.load()
          try { oldSource.disconnect() } catch {}
          try { oldGain.disconnect() } catch {}
          try { oldEffect.disconnect() } catch {}
          try { oldEffectOutput.disconnect() } catch {}
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

      // Wire: effectOutput → gainNode → lowpass (shared)
      effectOutput.connect(gainNode)
      gainNode.connect(this.lowpass!)

      // Store layer
      this.layers[layerIndex] = {
        audioEl: audio,
        sourceNode,
        gainNode,
        pitchEffect,
        effectOutput,
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

    // Launch layers with staggered starts
    for (let i = 0; i < this.layerCount && i < this.videoIds.length; i++) {
      const videoId = this.videoIds[i % this.videoIds.length]!
      const delay = i * (5000 + Math.random() * 10000)
      setTimeout(() => {
        void this.playTrackOnLayer(i, videoId)
        this.scheduleLayerCycle(i)
      }, delay)
    }

    // Start analysis loop
    this.ensureContext()
    this.startAnalysisLoop()
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
      if (layer.cycleTimer) clearTimeout(layer.cycleTimer)
    }
    this.layers = []

    // Disconnect effects chain but keep context alive for re-use
    try { this.lowpass?.disconnect() } catch {}
    try { this.convolver?.disconnect() } catch {}
    try { this.wetGain?.disconnect() } catch {}
    try { this.dryGain?.disconnect() } catch {}
    try { this.masterGain?.disconnect() } catch {}
    try { this.analyser?.disconnect() } catch {}

    this.lowpass = null
    this.convolver = null
    this.wetGain = null
    this.dryGain = null
    this.masterGain = null
    this.analyser = null
    this.dataArray = null

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
