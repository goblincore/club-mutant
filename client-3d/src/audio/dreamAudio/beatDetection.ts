// Kick + snare onset detection with rolling BPM estimate.
//
// Caller feeds raw bass/mid-high energy per frame; BeatDetector surfaces:
//   - getBPM() / getBeatPhase() / getBPMConfidence() — musical timing
//   - getBeatKick() / getSnareHit() — 0..1 envelopes that spike on transient
//
// An optional onKick callback fires when a new kick is detected, used by
// the player to drive sidechain ducking on its own audio nodes.

export class BeatDetector {
  private currentBPM = 0
  private beatPhase = 0 // 0-1, where in the current beat we are
  private lastBeatTime = 0
  private beatInterval = 0 // ms between beats
  private onsetHistory: number[] = [] // timestamps of detected bass onsets
  private prevOnsetEnergy = 0
  private onsetThreshold = 0.06
  private bpmConfidence = 0 // 0-1 how confident we are in the detected BPM
  private _beatKick = 0 // 0-1, spikes on kick then decays

  // Snare detection state
  private prevSnareEnergy = 0
  private snareThreshold = 0.04 // lower than kick — snares are often quieter
  private lastSnareTime = 0
  private _snareHit = 0 // 0-1, spikes on snare then decays

  constructor(private onKick?: () => void) {}

  getBPM(): number { return this.currentBPM }
  getBeatPhase(): number { return this.beatPhase }
  getBPMConfidence(): number { return this.bpmConfidence }
  getBeatKick(): number { return this._beatKick }
  getSnareHit(): number { return this._snareHit }
  getBeatInterval(): number { return this.beatInterval }

  /** Reset onset/BPM history. Call when a new track starts to prevent
   *  cross-track interval pollution. */
  resetOnsetHistory(): void {
    this.onsetHistory = []
    this.prevOnsetEnergy = 0
  }

  /** Feed raw (unsmoothed) bass energy per frame. Raw preserves kick transients. */
  detectBeats(rawBass: number): void {
    // Onset detection: slow envelope follower so transients create large deltas
    const bassEnergy = rawBass
    const energyDelta = bassEnergy - this.prevOnsetEnergy
    this.prevOnsetEnergy = bassEnergy * 0.05 + this.prevOnsetEnergy * 0.95

    const now = performance.now()

    // Decay beat kick value each frame (~0.92 per frame at 60fps ≈ fast decay)
    this._beatKick *= 0.92

    if (energyDelta > this.onsetThreshold && now - this.lastBeatTime > 200) {
      // Detected an onset (beat) — fire the kick
      // Scale delta to 0-1 range: raw bass deltas on techno kicks can be 0.1-0.5+
      this._beatKick = Math.min(1.0, energyDelta * 6.0)
      this.lastBeatTime = now
      this.onsetHistory.push(now)

      this.onKick?.()

      // Keep last 20 onsets
      if (this.onsetHistory.length > 20) {
        this.onsetHistory.shift()
      }

      // Calculate BPM from inter-onset intervals
      if (this.onsetHistory.length >= 4) {
        const intervals: number[] = []
        for (let i = 1; i < this.onsetHistory.length; i++) {
          const interval = this.onsetHistory[i]! - this.onsetHistory[i - 1]!
          // Filter out unreasonable intervals (only keep 70-200 BPM range)
          if (interval > 300 && interval < 860) {
            intervals.push(interval)
          }
        }

        if (intervals.length >= 3) {
          // Use median interval for robustness
          intervals.sort((a, b) => a - b)
          const medianInterval = intervals[Math.floor(intervals.length / 2)]!

          // Also try double-time and half-time
          const bpm = 60000 / medianInterval
          const prevBPM = this.currentBPM

          // Smooth BPM updates (don't jump wildly)
          if (prevBPM === 0) {
            this.currentBPM = bpm
          } else {
            // Check if new BPM is close to current, double, or half
            const ratio = bpm / prevBPM
            if (ratio > 0.9 && ratio < 1.1) {
              // Close to current — smooth update
              this.currentBPM = this.currentBPM * 0.8 + bpm * 0.2
            } else if (ratio > 1.8 && ratio < 2.2) {
              // Double time — use half
              this.currentBPM = this.currentBPM * 0.8 + (bpm / 2) * 0.2
            } else if (ratio > 0.4 && ratio < 0.6) {
              // Half time — use double
              this.currentBPM = this.currentBPM * 0.8 + (bpm * 2) * 0.2
            } else {
              // Big change — new song section, jump
              this.currentBPM = bpm
            }
          }

          this.beatInterval = 60000 / this.currentBPM

          // Confidence based on variance of intervals
          const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
          const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length
          const stdDev = Math.sqrt(variance)
          // Low std dev relative to mean = high confidence
          this.bpmConfidence = Math.max(0, Math.min(1, 1 - (stdDev / mean) * 3))
        }
      }
    }

    // Update beat phase (where in the current beat we are)
    if (this.beatInterval > 0) {
      const elapsed = now - this.lastBeatTime
      this.beatPhase = (elapsed % this.beatInterval) / this.beatInterval
    }
  }

  /** Feed raw mid-high energy per frame. Detects snare transients (2-8kHz crack). */
  detectSnares(rawMidHigh: number): void {
    // Snares have a distinctive broadband "crack" in the 2-8kHz range
    // plus a body around 150-300Hz. We detect the high-frequency transient
    // which is what makes snare rolls visually exciting.
    const snareEnergy = rawMidHigh

    // Slow envelope follower (same approach as kick detection)
    const energyDelta = snareEnergy - this.prevSnareEnergy
    this.prevSnareEnergy = snareEnergy * 0.08 + this.prevSnareEnergy * 0.92

    const now = performance.now()

    // Decay snare value each frame (~0.88 per frame = faster decay than kick for snappy feel)
    this._snareHit *= 0.88

    // Snares can be closer together than kicks (snare rolls!), so shorter cooldown (100ms)
    if (energyDelta > this.snareThreshold && now - this.lastSnareTime > 100) {
      // Make sure this isn't just a kick bleed-through:
      // If a kick JUST fired (within 30ms), skip — it's likely the same transient
      if (now - this.lastBeatTime < 30) return

      this._snareHit = Math.min(1.0, energyDelta * 8.0)
      this.lastSnareTime = now
    }
  }
}
