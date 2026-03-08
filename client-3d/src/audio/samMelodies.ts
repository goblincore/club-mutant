import type { NoteEvent } from './SamSinger'

// ── Aria di Mezzo Carattere ──────────────────────────────────────────────
// Melody from MIDI, lyrics mapped syllable-per-note.
// 75 BPM, key of D major. Durations from MIDI tick data.
//
// "Oh my hero, so far away now.
//  Will I ever see your smile?
//  Love goes away, like night into day.
//  It's just a fading dream..."

export const MELODY_OPERA: NoteEvent[] = [
  // ── "Oh my hero, so far away now." ──
  { syllable: 'OH',    midiNote: 66, duration: 0.80, rest: 0 },  // F#4
  { syllable: 'MY',    midiNote: 67, duration: 0.80, rest: 0 },  // G4
  { syllable: 'HEE',   midiNote: 69, duration: 0.80, rest: 0 },  // A4
  { syllable: 'ROH',   midiNote: 62, duration: 1.60, rest: 0 },  // D4 (held)
  { syllable: 'SOH',   midiNote: 66, duration: 0.40, rest: 0 },  // F#4
  { syllable: 'FAR',   midiNote: 68, duration: 0.40, rest: 0 },  // G#4
  { syllable: 'WAY',   midiNote: 69, duration: 0.80, rest: 0 },  // A4
  { syllable: 'NOW',   midiNote: 73, duration: 1.60, rest: 0 },  // C#5 (held)

  // ── "Will I ever see your smile?" ──
  { syllable: 'WILL',  midiNote: 71, duration: 0.40, rest: 0 },  // B4
  { syllable: 'AY',    midiNote: 73, duration: 0.40, rest: 0 },  // C#5
  { syllable: 'EH',    midiNote: 74, duration: 1.20, rest: 0 },  // D5 (held)
  { syllable: 'VER',   midiNote: 74, duration: 0.40, rest: 0 },  // D5
  { syllable: 'SEE',   midiNote: 73, duration: 0.80, rest: 0 },  // C#5
  { syllable: 'YOR',   midiNote: 71, duration: 0.80, rest: 0 },  // B4
  { syllable: 'SMILE', midiNote: 69, duration: 2.80, rest: 0 },  // A4 (long hold)

  // ── "Love goes away, like night into day." ──
  { syllable: 'LUV',   midiNote: 69, duration: 0.40, rest: 0 },  // A4
  { syllable: 'GOHZ',  midiNote: 69, duration: 0.80, rest: 0 },  // A4
  { syllable: 'AH',    midiNote: 67, duration: 0.40, rest: 0 },  // G4
  { syllable: 'WAY',   midiNote: 66, duration: 0.40, rest: 0 },  // F#4
  { syllable: 'LIYK',  midiNote: 67, duration: 1.20, rest: 0 },  // G4 (held)
  { syllable: 'NIYT',  midiNote: 67, duration: 0.40, rest: 0 },  // G4
  { syllable: 'IHN',   midiNote: 67, duration: 0.80, rest: 0 },  // G4
  { syllable: 'TUH',   midiNote: 66, duration: 0.40, rest: 0 },  // F#4
  { syllable: 'DAY',   midiNote: 64, duration: 0.40, rest: 0 },  // E4

  // ── "It's just a fading dream..." ──
  { syllable: 'IHTS',  midiNote: 66, duration: 1.20, rest: 0 },  // F#4 (held)
  { syllable: 'JUST',  midiNote: 66, duration: 0.40, rest: 0 },  // F#4
  { syllable: 'AH',    midiNote: 66, duration: 1.20, rest: 0 },  // F#4 (held)
  { syllable: 'FAY',   midiNote: 66, duration: 0.40, rest: 0 },  // F#4
  { syllable: 'DIHNG', midiNote: 65, duration: 0.80, rest: 0 },  // F4
  { syllable: 'DREEM', midiNote: 63, duration: 0.40, rest: 0 },  // D#4
  { syllable: 'EE',    midiNote: 65, duration: 0.40, rest: 0 },  // F4  (melisma)
  { syllable: 'EE',    midiNote: 66, duration: 1.60, rest: 0 },  // F#4 (melisma)
  { syllable: 'EE',    midiNote: 69, duration: 1.20, rest: 0 },  // A4  (final rise)
]

// ── Simple test melodies ─────────────────────────────────────────────────

export const MELODY_ARIA: NoteEvent[] = [
  { syllable: 'AH',  midiNote: 60, duration: 0.8, rest: 0.1 },
  { syllable: 'AH',  midiNote: 64, duration: 0.6, rest: 0.1 },
  { syllable: 'OH',  midiNote: 67, duration: 1.0, rest: 0.2 },
  { syllable: 'OH',  midiNote: 72, duration: 1.2, rest: 0.3 },
  { syllable: 'EE',  midiNote: 71, duration: 0.5, rest: 0.1 },
  { syllable: 'AH',  midiNote: 69, duration: 0.5, rest: 0.1 },
  { syllable: 'OH',  midiNote: 67, duration: 1.5, rest: 0.4 },
  { syllable: 'LAH', midiNote: 65, duration: 0.6, rest: 0.1 },
  { syllable: 'LAH', midiNote: 64, duration: 0.6, rest: 0.1 },
  { syllable: 'OH',  midiNote: 60, duration: 2.0, rest: 0.5 },
]

export const MELODY_GREETING: NoteEvent[] = [
  { syllable: 'HEH', midiNote: 60, duration: 0.3, rest: 0.05 },
  { syllable: 'LOH', midiNote: 64, duration: 0.5, rest: 0.1 },
  { syllable: 'OH',  midiNote: 67, duration: 0.8, rest: 0.0 },
]

export const MELODY_LAMENT: NoteEvent[] = [
  { syllable: 'AH',  midiNote: 69, duration: 1.0, rest: 0.2 },
  { syllable: 'OH',  midiNote: 68, duration: 0.8, rest: 0.1 },
  { syllable: 'EE',  midiNote: 65, duration: 0.6, rest: 0.1 },
  { syllable: 'AH',  midiNote: 64, duration: 1.2, rest: 0.3 },
  { syllable: 'OH',  midiNote: 60, duration: 2.0, rest: 0.0 },
]

export const MELODY_CHANT: NoteEvent[] = [
  { syllable: 'DOH', midiNote: 55, duration: 1.0, rest: 0.15 },
  { syllable: 'REH', midiNote: 57, duration: 0.8, rest: 0.15 },
  { syllable: 'MEE', midiNote: 59, duration: 0.8, rest: 0.15 },
  { syllable: 'AH',  midiNote: 60, duration: 1.4, rest: 0.3 },
  { syllable: 'OH',  midiNote: 62, duration: 0.8, rest: 0.15 },
  { syllable: 'AH',  midiNote: 64, duration: 0.8, rest: 0.15 },
  { syllable: 'OH',  midiNote: 67, duration: 2.0, rest: 0.0 },
]

// ── All melodies for random selection ────────────────────────────────────

export const ALL_MELODIES: NoteEvent[][] = [
  MELODY_OPERA,
  MELODY_ARIA,
  MELODY_GREETING,
  MELODY_LAMENT,
  MELODY_CHANT,
]
