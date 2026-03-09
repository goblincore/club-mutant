import { create } from 'zustand'

export type BlendMode = 'none' | 'difference' | 'multiply' | 'screen' | 'overlay' | 'add'

export interface DreamDebugState {
  showPanel: boolean

  // Render resolution
  dreamRenderScale: number   // 0.2–1.0 (Canvas DPR)

  // UV effects
  chromaAberration: boolean
  chromaStrength: number     // 0–2
  zoomPulse: boolean
  rotation: boolean
  stretch: boolean
  liquidWarp: boolean
  liquidAmount: number       // 0–0.2
  fisheye: boolean
  fisheyeAmount: number      // 0–3

  // Color / Post
  hueRotation: boolean
  hueSpeed: number           // 0–0.2
  filmGrain: boolean
  vignette: boolean
  vignetteSize: number       // 0.1–1.0
  saturation: number         // 0.5–2

  // VHS
  vhsEffect: boolean
  vhsStrength: number        // 0–1

  // Transition
  transitionDuration: number // ms

  // Blend mode overlay
  blendMode: BlendMode
  blendOpacity: number       // 0–1

  // Scanlines (moire)
  scanlines: boolean
  scanlineCount: number      // 0 = auto (res.y * 0.5)
  scanlineThickness: number  // 0–1
  scanlineIntensity: number  // 0–1
  scanlineScrollSpeed: number // 0 = static

  // Glitch
  interferenceLines: boolean
  interferenceIntensity: number  // 0–1
  frameGhosting: boolean
  frameGhostIntensity: number   // 0–1
  signalDropout: boolean
  signalDropoutIntensity: number // 0–1

  // Playback behavior
  playbackRateMin: number
  playbackRateMax: number
  randomCuts: boolean
  randomCutChance: number    // 0–1
  cutIntervalMin: number     // ms
  cutIntervalMax: number     // ms

  // TV Static (signals from the void)
  staticBursts: boolean           // random static interference bursts
  staticBurstChance: number       // 0–1 probability per interval
  staticBurstIntervalMin: number  // ms between burst checks
  staticBurstIntervalMax: number  // ms
  staticBurstDurationMin: number  // ms how long burst lasts
  staticBurstDurationMax: number  // ms
  staticTransitions: boolean      // fade through static when cycling videos
  staticTintA: [number, number, number]  // RGB 0-1 (dark tint A)
  staticTintB: [number, number, number]  // RGB 0-1 (dark tint B)

  // Dream Audio (warped/slowed/reverbed music)
  dreamAudioEnabled: boolean
  dreamAudioRateMin: number     // 0.25–1.0
  dreamAudioRateMax: number     // 0.25–1.0
  dreamAudioReverbDecay: number // seconds
  dreamAudioLowpassFreq: number // Hz
  dreamAudioVolume: number      // 0–1
  dreamAudioWetMix: number      // 0–1 reverb wet/dry

  // Actions
  togglePanel: () => void
  set: (partial: Partial<DreamDebugState>) => void
  reset: () => void
}

const DEFAULTS = {
  showPanel: false,

  dreamRenderScale: 0.35,

  chromaAberration: true,
  chromaStrength: 1.0,
  zoomPulse: true,
  rotation: true,
  stretch: true,
  liquidWarp: true,
  liquidAmount: 0.06,
  fisheye: true,
  fisheyeAmount: 0.8,

  hueRotation: false,
  hueSpeed: 0.03,
  filmGrain: true,
  vignette: true,
  vignetteSize: 0.3,
  saturation: 1.3,

  vhsEffect: true,
  vhsStrength: 0.7,

  transitionDuration: 5000,

  blendMode: 'difference' as BlendMode,
  blendOpacity: 0.3,

  scanlines: false,
  scanlineCount: 0,
  scanlineThickness: 0.4,
  scanlineIntensity: 0.5,
  scanlineScrollSpeed: 0,

  interferenceLines: false,
  interferenceIntensity: 0.3,
  frameGhosting: false,
  frameGhostIntensity: 0.3,
  signalDropout: false,
  signalDropoutIntensity: 0.1,

  playbackRateMin: 0.5,
  playbackRateMax: 0.8,
  randomCuts: true,
  randomCutChance: 0.95,
  cutIntervalMin: 3_000,
  cutIntervalMax: 20_000,

  dreamAudioEnabled: true,
  dreamAudioRateMin: 0.5,
  dreamAudioRateMax: 0.8,
  dreamAudioReverbDecay: 4.0,
  dreamAudioLowpassFreq: 2000,
  dreamAudioVolume: 0.6,
  dreamAudioWetMix: 0.7,

  staticBursts: true,
  staticBurstChance: 0.4,
  staticBurstIntervalMin: 8_000,
  staticBurstIntervalMax: 25_000,
  staticBurstDurationMin: 500,
  staticBurstDurationMax: 3_000,
  staticTransitions: true,
  staticTintA: [0.15, 0.05, 0.25] as [number, number, number],
  staticTintB: [0.05, 0.15, 0.2] as [number, number, number],

}

export const useDreamDebugStore = create<DreamDebugState>((set) => ({
  ...DEFAULTS,

  togglePanel: () => set((s) => ({ showPanel: !s.showPanel })),
  set: (partial) => set(partial),
  reset: () => set(DEFAULTS),
}))
