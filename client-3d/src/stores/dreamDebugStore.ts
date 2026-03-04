import { create } from 'zustand'

export interface DreamDebugState {
  showPanel: boolean

  // Effect toggles
  chromaAberration: boolean
  zoomPulse: boolean
  rotation: boolean
  stretch: boolean
  uvWarp: boolean
  smear: boolean
  waxLighting: boolean
  hueRotation: boolean
  filmGrain: boolean
  vignette: boolean

  // Effect strengths
  chromaStrength: number     // 0–2
  smearStrength: number      // 0–2
  waxSmooth: number          // 0–5
  waxSpecular: number        // 0–2
  waxRim: number             // 0–1
  saturation: number         // 0.5–2
  hueSpeed: number           // 0–0.2
  vignetteSize: number       // 0.1–1.0

  // Datamosh
  datamoshEnabled: boolean
  datamoshIntensity: number  // 0–1
  datamoshBlockSize: number  // 4–64 pixels

  // Transition
  transitionType: 'melt' | 'datamosh'
  transitionDuration: number // ms

  // Playback behavior
  playbackRateMin: number
  playbackRateMax: number
  randomCuts: boolean
  randomCutChance: number    // 0–1

  // Actions
  togglePanel: () => void
  set: (partial: Partial<DreamDebugState>) => void
  reset: () => void
}

const DEFAULTS = {
  showPanel: false,

  chromaAberration: true,
  zoomPulse: true,
  rotation: true,
  stretch: true,
  uvWarp: true,
  smear: true,
  waxLighting: true,
  hueRotation: true,
  filmGrain: true,
  vignette: true,

  chromaStrength: 1.0,
  smearStrength: 0.4,
  waxSmooth: 1.5,
  waxSpecular: 0.5,
  waxRim: 0.35,
  saturation: 1.3,
  hueSpeed: 0.03,
  vignetteSize: 0.3,

  datamoshEnabled: false,
  datamoshIntensity: 0.5,
  datamoshBlockSize: 16,

  transitionType: 'melt' as const,
  transitionDuration: 5000,

  playbackRateMin: 0.5,
  playbackRateMax: 0.8,
  randomCuts: true,
  randomCutChance: 0.25,
}

export const useDreamDebugStore = create<DreamDebugState>((set) => ({
  ...DEFAULTS,

  togglePanel: () => set((s) => ({ showPanel: !s.showPanel })),
  set: (partial) => set(partial),
  reset: () => set(DEFAULTS),
}))
