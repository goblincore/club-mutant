/**
 * Web Audio API system sound manager — ported from the original Astro CDE.
 * AudioContext is created lazily on first user gesture (browser autoplay policy).
 */

let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null

function init(): void {
  if (audioCtx) return
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    audioCtx = new Ctx()
    masterGain = audioCtx.createGain()
    masterGain.connect(audioCtx.destination)
    masterGain.gain.value = 0.6
  } catch {
    // Silently fail — audio is non-critical
  }
}

async function ensureRunning(): Promise<boolean> {
  if (!audioCtx) init()
  if (!audioCtx) return false
  if (audioCtx.state === 'suspended') {
    try { await audioCtx.resume() } catch { return false }
  }
  return audioCtx.state === 'running'
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 1.0
): void {
  if (!audioCtx || !masterGain || audioCtx.state !== 'running') return
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime)
  gain.gain.setValueAtTime(volume, audioCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration)
  osc.connect(gain)
  gain.connect(masterGain)
  osc.start()
  osc.stop(audioCtx.currentTime + duration)
}

async function playMelody(
  notes: Array<{ freq: number; duration: number; type?: OscillatorType; delay?: number }>
): Promise<void> {
  if (!(await ensureRunning())) return
  for (const note of notes) {
    if (note.delay) await new Promise<void>((r) => setTimeout(r, note.delay))
    playTone(note.freq, note.duration, note.type ?? 'sine', 0.4)
  }
}

// Unlock AudioContext on first user gesture (required by browser autoplay policy)
if (typeof window !== 'undefined') {
  const unlock = () => {
    if (!audioCtx) init()
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
  }
  for (const ev of ['pointerdown', 'keydown', 'click', 'touchstart'] as const) {
    window.addEventListener(ev, unlock, { capture: true, once: false, passive: true })
  }
}

export const AudioManager = {
  click(): void { playTone(1200, 0.05, 'sine', 0.25) },

  windowOpen(): void {
    playMelody([
      { freq: 440, duration: 0.08, type: 'sine', delay: 0 },
      { freq: 880, duration: 0.05, type: 'sine', delay: 40 },
    ])
  },

  windowClose(): void {
    playMelody([
      { freq: 880, duration: 0.05, type: 'sine', delay: 0 },
      { freq: 440, duration: 0.08, type: 'sine', delay: 40 },
    ])
  },

  windowMaximize(): void {
    playMelody([
      { freq: 400, duration: 0.05, type: 'sine', delay: 0 },
      { freq: 600, duration: 0.05, type: 'sine', delay: 25 },
      { freq: 800, duration: 0.07, type: 'sine', delay: 25 },
    ])
  },

  windowShade(): void { playTone(700, 0.07, 'sine', 0.25) },

  menuOpen(): void { playTone(1000, 0.03, 'sine', 0.18) },

  error(): void {
    playMelody([
      { freq: 300, duration: 0.1, type: 'square', delay: 0 },
      { freq: 200, duration: 0.18, type: 'square', delay: 80 },
    ])
  },

  playStartupChime(): void {
    playMelody([
      { freq: 261.63, duration: 0.1, type: 'sine', delay: 0 },   // C4
      { freq: 329.63, duration: 0.1, type: 'sine', delay: 50 },  // E4
      { freq: 392.00, duration: 0.1, type: 'sine', delay: 50 },  // G4
      { freq: 523.25, duration: 0.3, type: 'sine', delay: 50 },  // C5
      { freq: 659.25, duration: 0.4, type: 'sine', delay: 100 }, // E5
    ])
  },
}
