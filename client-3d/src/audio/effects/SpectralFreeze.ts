import type { PitchEffect } from './types'

/**
 * SpectralFreeze — feedback delay with bandpass filtering that creates
 * shimmering, frozen sustain textures. The audio feeds back through a
 * narrow bandpass at a random center frequency, so different layers each
 * lock onto different frequency ranges and create pad-like drones that
 * bleed across tracks.
 */
export class SpectralFreeze implements PitchEffect {
  readonly name = 'spectral-freeze'

  private delay: DelayNode | null = null
  private feedback: GainNode | null = null
  private bandpass: BiquadFilterNode | null = null
  private dryGain: GainNode | null = null
  private wetGain: GainNode | null = null

  private delayTime = 0.3
  private feedbackAmount = 0.82
  private filterFreq = 800
  private filterQ = 4

  connect(ctx: AudioContext, input: AudioNode, output: AudioNode): void {
    // Dry path
    this.dryGain = ctx.createGain()
    this.dryGain.gain.value = 0.6

    // Wet path
    this.wetGain = ctx.createGain()
    this.wetGain.gain.value = 0.5

    // Delay with feedback loop
    this.delay = ctx.createDelay(2.0)
    this.delay.delayTime.value = this.delayTime

    this.feedback = ctx.createGain()
    this.feedback.gain.value = this.feedbackAmount

    // Bandpass in the feedback loop — each layer freezes a different band
    this.bandpass = ctx.createBiquadFilter()
    this.bandpass.type = 'bandpass'
    this.bandpass.frequency.value = this.filterFreq
    this.bandpass.Q.value = this.filterQ

    // Feedback loop: delay → bandpass → feedback gain → delay
    this.delay.connect(this.bandpass)
    this.bandpass.connect(this.feedback)
    this.feedback.connect(this.delay)

    // Wet output from delay
    this.delay.connect(this.wetGain)

    // Wire input
    input.connect(this.delay)
    input.connect(this.dryGain)

    // Both paths to output
    this.dryGain.connect(output)
    this.wetGain.connect(output)
  }

  disconnect(): void {
    try { this.delay?.disconnect() } catch {}
    try { this.feedback?.disconnect() } catch {}
    try { this.bandpass?.disconnect() } catch {}
    try { this.dryGain?.disconnect() } catch {}
    try { this.wetGain?.disconnect() } catch {}
    this.delay = null
    this.feedback = null
    this.bandpass = null
    this.dryGain = null
    this.wetGain = null
  }

  randomize(): void {
    // Random delay time: short for metallic, long for spacey
    this.delayTime = 0.1 + Math.random() * 0.6

    // High feedback for sustain but below 1.0 to avoid blowup
    this.feedbackAmount = 0.75 + Math.random() * 0.15

    // Random bandpass center — each layer will freeze a different frequency
    this.filterFreq = 200 + Math.random() * 2000
    this.filterQ = 2 + Math.random() * 6

    if (this.delay) this.delay.delayTime.value = this.delayTime
    if (this.feedback) this.feedback.gain.value = this.feedbackAmount
    if (this.bandpass) {
      this.bandpass.frequency.value = this.filterFreq
      this.bandpass.Q.value = this.filterQ
    }
  }
}
