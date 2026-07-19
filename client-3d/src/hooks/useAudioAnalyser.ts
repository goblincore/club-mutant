import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import { useBoothStore } from '../stores/boothStore'
import { useMusicStore } from '../stores/musicStore'
import { getNetwork } from '../network/NetworkManager'

const LOAD_TIMEOUT_MS = 12_000
const FFT_SIZE = 256 // 128 frequency bins
const SMOOTHING = 0.15 // Exponential smoothing factor for visual stability

// Precomputed analysis timeline served by the Go service at /analysis/{videoId}.
// When present, the client drives the visualizer from the synced playback
// clock instead of opening a live silent audio stream per client.
export interface PrecomputedAnalysis {
  videoId: string
  version: number
  sampleRate: number
  frameRate: number
  frameCount: number
  duration: number
  bass: number[] // 0-255 per frame
  mid: number[]
  high: number[]
  energy: number[]
}

// ── Module-level state (read imperatively by shader useFrame) ──────────
export let audioBass = 0
export let audioMid = 0
export let audioHigh = 0
export let audioEnergy = 0
export let audioAnalyserActive = false
export let audioBeatKick = 0 // 0-1, spikes on detected bass kick
export let audioSnareHit = 0 // 0-1, spikes on detected snare hit

// Setter for external writers (DreamAudioPlayer uses this during dream state)
export function setAudioBands(bass: number, mid: number, high: number, energy: number): void {
  audioBass = bass
  audioMid = mid
  audioHigh = high
  audioEnergy = energy
  audioAnalyserActive = bass > 0 || mid > 0 || high > 0 || energy > 0
}

export function setAudioBeatKick(kick: number): void {
  audioBeatKick = kick
}

export function setAudioSnareHit(snare: number): void {
  audioSnareHit = snare
}

// ── Singleton AudioContext ─────────────────────────────────────────────
let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

// Extract YouTube video ID from a URL or link field
function extractVideoId(link: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const pattern of patterns) {
    const match = link.match(pattern)
    if (match) return match[1]!
  }
  return null
}

function lerp(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha
}

/**
 * Loads a low-bitrate audio-only stream and extracts frequency band data
 * for driving audio-reactive visual effects on the video wall.
 *
 * - Creates a silent <audio> element pointing at the audio-only proxy
 * - Pipes through Web Audio API AnalyserNode for FFT data
 * - Writes bass/mid/high/energy to module-level exports each frame
 * - Gracefully degrades: if audio fails to load, video plays without effects
 */
export function useAudioAnalyser() {
  const enabled = useBoothStore((s) => s.videoBackgroundEnabled)
  const isPlaying = useMusicStore((s) => s.stream.isPlaying)
  const currentLink = useMusicStore((s) => s.stream.currentLink)
  const startTime = useMusicStore((s) => s.stream.startTime)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const analysisRef = useRef<PrecomputedAnalysis | null>(null)
  const activeVideoIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const cleanup = () => {
      abortRef.current?.abort()
      abortRef.current = null

      // Disconnect Web Audio nodes (don't close the singleton AudioContext)
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect()
        } catch {
          // Already disconnected
        }
        sourceRef.current = null
      }
      analyserRef.current = null
      dataArrayRef.current = null
      analysisRef.current = null

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current.load()
        audioRef.current = null
      }

      activeVideoIdRef.current = null
      audioAnalyserActive = false
      audioBass = 0
      audioMid = 0
      audioHigh = 0
      audioEnergy = 0
    }

    if (!enabled || !isPlaying || !currentLink) {
      cleanup()
      return
    }

    const videoId = extractVideoId(currentLink)
    if (!videoId) {
      cleanup()
      return
    }

    // Don't restart if same video is already being analysed. Covers both
    // paths: live analyser (audioRef set) and precomputed (analysisRef set).
    if (
      activeVideoIdRef.current === videoId &&
      ((audioRef.current && !audioRef.current.paused) || analysisRef.current)
    ) {
      return
    }

    cleanup()
    activeVideoIdRef.current = videoId

    const abort = new AbortController()
    abortRef.current = abort

    const loadAudio = async () => {
      if (abort.signal.aborted) return

      try {
        // Prefer the precomputed analysis timeline (one-shot fetch, no
        // persistent audio stream). If the service has it, we drive the
        // visualizer purely from the synced playback clock and skip the
        // <audio>/AudioContext entirely. On any non-200 (pending / not yet
        // available / network error) we fall through to the live path.
        const analysis = await getNetwork().fetchYouTubeAnalysis(videoId)
        if (abort.signal.aborted) return

        if (
          analysis &&
          analysis.version === 1 &&
          analysis.frameCount > 0 &&
          analysis.bass?.length === analysis.frameCount &&
          analysis.mid?.length === analysis.frameCount &&
          analysis.high?.length === analysis.frameCount &&
          analysis.energy?.length === analysis.frameCount
        ) {
          analysisRef.current = analysis
          audioAnalyserActive = true
          console.log('[AudioAnalyser] Using precomputed analysis for:', videoId)
          return
        }

        const proxyUrl = getNetwork().getYouTubeAudioProxyUrl(videoId)
        if (abort.signal.aborted) return

        const audio = document.createElement('audio')
        audio.crossOrigin = 'anonymous'
        audio.preload = 'auto'
        audio.src = proxyUrl
        // Volume 0 keeps it silent — audio playback comes from ReactPlayer
        audio.volume = 0

        audioRef.current = audio

        // Wait for enough data to start
        await new Promise<void>((resolve, reject) => {
          const onCanPlay = () => {
            audio.removeEventListener('canplay', onCanPlay)
            audio.removeEventListener('error', onError)
            resolve()
          }
          const onError = () => {
            audio.removeEventListener('canplay', onCanPlay)
            audio.removeEventListener('error', onError)
            reject(new Error(`Audio load failed: ${audio.error?.message ?? 'unknown'}`))
          }

          audio.addEventListener('canplay', onCanPlay)
          audio.addEventListener('error', onError)

          setTimeout(() => {
            audio.removeEventListener('canplay', onCanPlay)
            audio.removeEventListener('error', onError)
            reject(new Error('Audio load timeout'))
          }, LOAD_TIMEOUT_MS)

          audio.load()
        })

        if (abort.signal.aborted) {
          audio.pause()
          audio.src = ''
          return
        }

        // Seek to correct offset (sync with video)
        const offsetSec = startTime > 0 ? (Date.now() - startTime) / 1000 : 0
        if (offsetSec > 1) {
          audio.currentTime = offsetSec
        }

        await audio.play()

        if (abort.signal.aborted) {
          audio.pause()
          audio.src = ''
          return
        }

        // Set up Web Audio API analysis chain
        const ctx = getAudioContext()
        const source = ctx.createMediaElementSource(audio)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = FFT_SIZE
        analyser.smoothingTimeConstant = 0.8

        // Source → Analyser (no connection to destination = silent)
        source.connect(analyser)

        sourceRef.current = source
        analyserRef.current = analyser
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
        audioAnalyserActive = true

        console.log('[AudioAnalyser] Active for:', videoId, `(${analyser.frequencyBinCount} bins)`)
      } catch (err) {
        if (abort.signal.aborted) return
        console.warn('[AudioAnalyser] Failed to load audio stream:', err)
        audioAnalyserActive = false
      }
    }

    void loadAudio()

    return cleanup
  }, [enabled, isPlaying, currentLink, startTime])

  // Per-frame frequency analysis — writes to module-level exports
  useFrame(() => {
    // Precomputed path: derive band values from the synced playback clock
    // and the server-computed timeline. Reads the clock imperatively via
    // getState() because subscribed hook values are stale inside this closure.
    const analysis = analysisRef.current
    if (analysis) {
      const stream = useMusicStore.getState().stream
      let pos = 0
      if (stream.isPlaying && stream.startTime > 0) {
        pos = (Date.now() - stream.startTime) / 1000
      }

      const fc = analysis.frameCount
      const fr = analysis.frameRate
      let rawBass: number
      let rawMid: number
      let rawHigh: number
      let rawEnergy: number

      if (pos < 0 || pos > analysis.duration + 0.5 || fc <= 0 || fr <= 0) {
        // Past end / before start / not playing → decay target is 0 (the
        // module-level lerp below handles the fade).
        rawBass = 0
        rawMid = 0
        rawHigh = 0
        rawEnergy = 0
      } else {
        // Frame index with linear interpolation between floor/ceil frames.
        const exactFrame = pos * fr
        const f0 = Math.max(0, Math.min(fc - 1, Math.floor(exactFrame)))
        const f1 = Math.min(fc - 1, f0 + 1)
        const frac = exactFrame - f0
        const interp = (arr: number[], idx0: number, idx1: number) => {
          const a = arr[idx0] ?? 0
          const b = arr[idx1] ?? a
          return (a + (b - a) * frac) / 255
        }
        rawBass = interp(analysis.bass, f0, f1)
        rawMid = interp(analysis.mid, f0, f1)
        rawHigh = interp(analysis.high, f0, f1)
        rawEnergy = interp(analysis.energy, f0, f1)
      }

      audioBass = lerp(audioBass, rawBass, SMOOTHING)
      audioMid = lerp(audioMid, rawMid, SMOOTHING)
      audioHigh = lerp(audioHigh, rawHigh, SMOOTHING)
      audioEnergy = lerp(audioEnergy, rawEnergy, SMOOTHING)
      return
    }

    const analyser = analyserRef.current
    const dataArray = dataArrayRef.current
    if (!analyser || !dataArray) return

    analyser.getByteFrequencyData(dataArray)

    const binCount = dataArray.length // 128

    // Bass: bins 0-7 (~20-300Hz)
    let bassSum = 0
    for (let i = 0; i < 8; i++) bassSum += dataArray[i]!
    const rawBass = bassSum / (8 * 255)

    // Mid: bins 8-39 (~300-2kHz)
    let midSum = 0
    for (let i = 8; i < 40; i++) midSum += dataArray[i]!
    const rawMid = midSum / (32 * 255)

    // High: bins 40-127 (~2k-20kHz)
    let highSum = 0
    for (let i = 40; i < binCount; i++) highSum += dataArray[i]!
    const rawHigh = highSum / ((binCount - 40) * 255)

    // Overall energy (RMS-like)
    let energySum = 0
    for (let i = 0; i < binCount; i++) energySum += dataArray[i]!
    const rawEnergy = energySum / (binCount * 255)

    // Exponential smoothing for visual stability
    audioBass = lerp(audioBass, rawBass, SMOOTHING)
    audioMid = lerp(audioMid, rawMid, SMOOTHING)
    audioHigh = lerp(audioHigh, rawHigh, SMOOTHING)
    audioEnergy = lerp(audioEnergy, rawEnergy, SMOOTHING)
  })
}
