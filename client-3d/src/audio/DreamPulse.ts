// client-3d/src/audio/DreamPulse.ts
import type { Rng } from '../dream/seededRandom'

const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.12

/**
 * Sparse synthesized kick on a clock WE own (vs. detecting beats in the collage).
 * Half-time feel: kick on beats 1 and 3 of each 4-beat bar, beat 3 occasionally skipped.
 * Connect directly to ctx.destination — must NOT pass through the sidechain it triggers.
 * Starts silent (gain 0) — call setGain() to fade in.
 */
export class DreamPulse {
  private ctx: AudioContext | null = null
  private out: GainNode | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private pendingKicks: Array<ReturnType<typeof setTimeout>> = []
  private nextBeatTime = 0
  private beatIndex = 0
  private beatInterval = 1
  private rng: Rng

  /** Fires at the audible moment of each kick — drives sidechain duck + visual flash */
  onKick: ((velocity: number) => void) | null = null

  constructor(rng: Rng) {
    this.rng = rng
  }

  start(ctx: AudioContext, destination: AudioNode, bpm: number): void {
    this.stop() // guard against double-start leaking the previous interval + nodes
    this.ctx = ctx
    this.beatInterval = 60 / bpm
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.out.connect(destination)
    this.nextBeatTime = ctx.currentTime + 0.1
    this.beatIndex = 0
    this.timer = setInterval(() => this.schedule(), LOOKAHEAD_MS)
  }

  setGain(gain: number, rampSeconds: number): void {
    if (!this.ctx || !this.out) return
    const g = this.out.gain
    g.cancelScheduledValues(this.ctx.currentTime)
    g.setValueAtTime(g.value, this.ctx.currentTime)
    g.linearRampToValueAtTime(gain, this.ctx.currentTime + rampSeconds)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    for (const t of this.pendingKicks) clearTimeout(t)
    this.pendingKicks = []
    try {
      this.out?.disconnect()
    } catch {}
    this.out = null
    this.ctx = null
  }

  private schedule(): void {
    if (!this.ctx || !this.out) return
    while (this.nextBeatTime < this.ctx.currentTime + SCHEDULE_AHEAD_S) {
      const beatInBar = this.beatIndex % 4
      const isKickBeat = beatInBar === 0 || (beatInBar === 2 && !this.rng.chance(0.2))
      if (isKickBeat) {
        const velocity = beatInBar === 0 ? 1.0 : this.rng.range(0.6, 0.85)
        this.scheduleKick(this.nextBeatTime, velocity)
      }
      this.nextBeatTime += this.beatInterval
      this.beatIndex++
    }
  }

  private scheduleKick(when: number, velocity: number): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(110, when)
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.09)
    env.gain.setValueAtTime(0, when)
    env.gain.linearRampToValueAtTime(velocity, when + 0.004)
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.4)
    osc.connect(env)
    env.connect(this.out!)
    osc.start(when)
    osc.stop(when + 0.45)

    const delayMs = Math.max(0, (when - ctx.currentTime) * 1000)
    const timeout = setTimeout(() => {
      this.pendingKicks = this.pendingKicks.filter((t) => t !== timeout)
      this.onKick?.(velocity)
    }, delayMs)
    this.pendingKicks.push(timeout)
  }
}
