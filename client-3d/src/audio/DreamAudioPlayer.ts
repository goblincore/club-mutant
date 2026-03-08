import { useDreamDebugStore } from '../stores/dreamDebugStore'
import { setAudioBands } from '../hooks/useAudioAnalyser'

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

  // Current track
  private audioEl: HTMLAudioElement | null = null
  private sourceNode: MediaElementAudioSourceNode | null = null

  // Crossfade: outgoing track
  private prevAudioEl: HTMLAudioElement | null = null
  private prevSourceNode: MediaElementAudioSourceNode | null = null
  private prevGainNode: GainNode | null = null

  // Effects chain
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
  private currentIndex = 0
  private cycleTimer: ReturnType<typeof setTimeout> | null = null
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

  private connectSource(audio: HTMLAudioElement): MediaElementAudioSourceNode {
    const ctx = this.ensureContext()
    const source = ctx.createMediaElementSource(audio)
    source.connect(this.lowpass!)
    return source
  }

  // ── Playback control ────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this._isPlaying) return

    const dbg = useDreamDebugStore.getState()
    if (!dbg.dreamAudioEnabled) return

    this._isPlaying = true
    this.abortController = new AbortController()

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

    this.currentIndex = 0
    await this.playTrack(this.videoIds[0]!)

    // Start cycling
    this.scheduleCycle()
  }

  private async playTrack(videoId: string): Promise<void> {
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

      // Set playback rate
      const rate = dbg.dreamAudioRateMin +
        Math.random() * (dbg.dreamAudioRateMax - dbg.dreamAudioRateMin)
      audio.playbackRate = rate

      // Random seek position for variety
      if (audio.duration && isFinite(audio.duration) && audio.duration > 30) {
        audio.currentTime = Math.random() * (audio.duration * 0.7)
      }

      // If there's a current track, crossfade
      if (this.audioEl && this.sourceNode) {
        // Move current to prev for fadeout
        this.prevAudioEl = this.audioEl
        this.prevSourceNode = this.sourceNode

        // Create a gain for the outgoing track and fade it out
        this.prevGainNode = ctx.createGain()
        this.prevGainNode.gain.value = 1.0
        this.prevSourceNode.disconnect()
        this.prevSourceNode.connect(this.prevGainNode)
        this.prevGainNode.connect(this.lowpass!)
        this.prevGainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + CROSSFADE_DURATION)

        // Clean up prev after crossfade
        const prevAudio = this.prevAudioEl
        const prevSource = this.prevSourceNode
        const prevGain = this.prevGainNode
        setTimeout(() => {
          prevAudio.pause()
          prevAudio.src = ''
          prevAudio.load()
          try { prevSource.disconnect() } catch {}
          try { prevGain.disconnect() } catch {}
        }, CROSSFADE_DURATION * 1000 + 500)
      }

      // Connect new track
      const source = this.connectSource(audio)
      this.audioEl = audio
      this.sourceNode = source

      await audio.play()

      // Fade in master on first track
      if (this.masterGain) {
        this.masterGain.gain.linearRampToValueAtTime(
          dbg.dreamAudioVolume,
          ctx.currentTime + FADE_DURATION
        )
      }

      // Start analysis loop
      this.startAnalysisLoop()

      console.log(`[DreamAudio] Playing ${videoId} at ${rate.toFixed(2)}x`)
    } catch (err) {
      if (this.abortController?.signal.aborted) return
      console.warn('[DreamAudio] Failed to play track:', err)
    }
  }

  private scheduleCycle(): void {
    if (this.cycleTimer) clearTimeout(this.cycleTimer)

    // Cycle every 20-45 seconds
    const delay = 20_000 + Math.random() * 25_000

    this.cycleTimer = setTimeout(async () => {
      if (!this._isPlaying || this.videoIds.length === 0) return

      this.currentIndex = (this.currentIndex + 1) % this.videoIds.length
      await this.playTrack(this.videoIds[this.currentIndex]!)
      this.scheduleCycle()
    }, delay)
  }

  async stop(): Promise<void> {
    if (!this._isPlaying) return
    this._isPlaying = false

    // Cancel pending operations
    this.abortController?.abort()
    this.abortController = null

    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer)
      this.cycleTimer = null
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
    if (this.audioEl) {
      this.audioEl.pause()
      this.audioEl.src = ''
      this.audioEl.load()
      this.audioEl = null
    }
    if (this.prevAudioEl) {
      this.prevAudioEl.pause()
      this.prevAudioEl.src = ''
      this.prevAudioEl.load()
      this.prevAudioEl = null
    }

    try { this.sourceNode?.disconnect() } catch {}
    try { this.prevSourceNode?.disconnect() } catch {}
    try { this.prevGainNode?.disconnect() } catch {}

    this.sourceNode = null
    this.prevSourceNode = null
    this.prevGainNode = null

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
