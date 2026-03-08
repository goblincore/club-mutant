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

  // SAM Singer
  samEnabled: boolean
  samPitch: number           // 0–255 (SAM formant pitch)
  samSpeed: number           // 0–255 (SAM speech rate)
  samMouth: number           // 0–255
  samThroat: number          // 0–255
  samLowpassFreq: number     // 500–8000 Hz
  samLowpassQ: number        // 0.1–10
  samReverbDecay: number     // 0.5–5 seconds
  samReverbMix: number       // 0–1 wet/dry
  samMasterGain: number      // 0–1
  samBaseMidiNote: number    // 48–72
  samChorusEnabled: boolean
  samChorusRate: number      // 0.1–5 Hz (LFO speed)
  samChorusDepth: number     // 0.001–0.02 (LFO amplitude in seconds)
  samChorusWet: number       // 0–1 chorus voice level

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

  hueRotation: true,
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

  scanlines: true,
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
  randomCutChance: 0.6,
  cutIntervalMin: 8_000,
  cutIntervalMax: 20_000,

  samEnabled: true,
  samPitch: 48,       // low male — Bonzi-inspired (SAPI4 "Sydney" approx)
  samSpeed: 80,       // slightly slower, deliberate cadence
  samMouth: 110,      // below neutral — darker, rounder F1
  samThroat: 105,     // below neutral — deeper chest resonance
  samLowpassFreq: 2500,
  samLowpassQ: 0.7,
  samReverbDecay: 2.0,
  samReverbMix: 0.6,
  samMasterGain: 0.5,
  samBaseMidiNote: 60,
  samChorusEnabled: true,
  samChorusRate: 1.2,
  samChorusDepth: 0.006,
  samChorusWet: 0.5,
}

export const useDreamDebugStore = create<DreamDebugState>((set) => ({
  ...DEFAULTS,

  togglePanel: () => set((s) => ({ showPanel: !s.showPanel })),
  set: (partial) => set(partial),
  reset: () => set(DEFAULTS),
}))
