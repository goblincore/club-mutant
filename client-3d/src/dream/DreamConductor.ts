import type { Rng } from './seededRandom'

export type DreamSectionKind = 'submerge' | 'surface' | 'peak' | 'breakdown' | 'themeReturn'

export interface SectionParams {
  lowpassFreq: number
  wetMix: number
  /** How many YouTube collage layers are audible (0-2). themeReturn: 1 = the theme track alone. */
  activeLayers: number
  shimmerMix: number
  pulseGain: number
  droneGain: number
}

export interface DreamSection {
  kind: DreamSectionKind
  index: number
  bars: number
  params: SectionParams
}

const SECTION_TABLE: Record<DreamSectionKind, { barsChoices: number[]; params: SectionParams }> = {
  submerge:    { barsChoices: [8, 16],  params: { lowpassFreq: 500,  wetMix: 0.7,  activeLayers: 1, shimmerMix: 0.2,  pulseGain: 0,   droneGain: 0.5 } },
  surface:     { barsChoices: [16],     params: { lowpassFreq: 2500, wetMix: 0.4,  activeLayers: 2, shimmerMix: 0.12, pulseGain: 0.6, droneGain: 0.35 } },
  peak:        { barsChoices: [16, 24], params: { lowpassFreq: 6000, wetMix: 0.3,  activeLayers: 2, shimmerMix: 0.18, pulseGain: 1,   droneGain: 0.25 } },
  breakdown:   { barsChoices: [8],      params: { lowpassFreq: 900,  wetMix: 0.85, activeLayers: 0, shimmerMix: 0.35, pulseGain: 0,   droneGain: 0.6 } },
  themeReturn: { barsChoices: [16],     params: { lowpassFreq: 3500, wetMix: 0.45, activeLayers: 1, shimmerMix: 0.15, pulseGain: 0.8, droneGain: 0.3 } },
}

const TRANSITIONS: Record<DreamSectionKind, Array<[DreamSectionKind, number]>> = {
  submerge:    [['surface', 0.7], ['breakdown', 0.1], ['themeReturn', 0.2]],
  surface:     [['peak', 0.5], ['themeReturn', 0.3], ['submerge', 0.2]],
  peak:        [['breakdown', 0.5], ['surface', 0.3], ['themeReturn', 0.2]],
  breakdown:   [['themeReturn', 0.4], ['submerge', 0.4], ['surface', 0.2]],
  themeReturn: [['surface', 0.4], ['peak', 0.3], ['submerge', 0.3]],
}

/** Force the theme back if this many consecutive non-theme sections elapse */
const MAX_SECTIONS_WITHOUT_THEME = 4

export class DreamConductor {
  readonly bpm: number
  private rng: Rng
  private _current: DreamSection
  private sectionsSinceTheme = 1

  constructor(rng: Rng) {
    this.rng = rng
    this.bpm = Math.round(rng.range(58, 72))
    this._current = this.makeSection('submerge', 0)
  }

  get current(): DreamSection {
    return this._current
  }

  sectionDurationMs(section: DreamSection = this._current): number {
    return section.bars * 4 * (60_000 / this.bpm)
  }

  nextSection(): DreamSection {
    let kind: DreamSectionKind
    if (this.sectionsSinceTheme >= MAX_SECTIONS_WITHOUT_THEME) {
      kind = 'themeReturn'
    } else {
      const options = TRANSITIONS[this._current.kind]
      kind = this.rng.pickWeighted(
        options.map((o) => o[0]),
        options.map((o) => o[1])
      )
    }
    this.sectionsSinceTheme = kind === 'themeReturn' ? 0 : this.sectionsSinceTheme + 1
    this._current = this.makeSection(kind, this._current.index + 1)
    return this._current
  }

  private makeSection(kind: DreamSectionKind, index: number): DreamSection {
    const def = SECTION_TABLE[kind]
    return { kind, index, bars: this.rng.pick(def.barsChoices), params: { ...def.params } }
  }
}

// ── Module-level section broadcast (same pattern as useAudioAnalyser) ──
// DreamScene subscribes to sync video transitions to section boundaries.

type SectionListener = (section: DreamSection, bpm: number) => void
const listeners = new Set<SectionListener>()

export function onDreamSection(cb: SectionListener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function emitDreamSection(section: DreamSection, bpm: number): void {
  listeners.forEach((cb) => {
    try {
      cb(section, bpm)
    } catch (err) {
      console.warn('[DreamConductor] section listener failed:', err)
    }
  })
}
