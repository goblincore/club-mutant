import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

import { useBoothStore } from '../stores/boothStore'
import { useMusicStore } from '../stores/musicStore'
import { getNetwork } from '../network/NetworkManager'

const LOAD_TIMEOUT_MS = 12_000
const FFT_SIZE = 256 // 128 frequency bins
const SMOOTHING = 0.15 // Exponential smoothing factor for visual stability

// ── Module-level state (read imperatively by shader useFrame) ──────────
export let audioBass = 0
export let audioMid = 0
export let audioHigh = 0
export let audioEnergy = 0
export let audioAnalyserActive = false
export let audioBeatKick = 0 // 0-1, spikes on detected bass kick

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

    // Don't restart if same video is already being analysed
    if (activeVideoIdRef.current === videoId && audioRef.current && !audioRef.current.paused) {
      return
    }

    cleanup()
    activeVideoIdRef.current = videoId

    const abort = new AbortController()
    abortRef.current = abort

    const loadAudio = async () => {
      if (abort.signal.aborted) return

      try {
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
