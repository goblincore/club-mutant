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

  // Playback behavior
  playbackRateMin: number
  playbackRateMax: number
  randomCuts: boolean
  randomCutChance: number    // 0–1
  cutIntervalMin: number     // ms
  cutIntervalMax: number     // ms

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

  playbackRateMin: 0.5,
  playbackRateMax: 0.8,
  randomCuts: true,
  randomCutChance: 0.6,
  cutIntervalMin: 8_000,
  cutIntervalMax: 20_000,
}

export const useDreamDebugStore = create<DreamDebugState>((set) => ({
  ...DEFAULTS,

  togglePanel: () => set((s) => ({ showPanel: !s.showPanel })),
  set: (partial) => set(partial),
  reset: () => set(DEFAULTS),
}))
