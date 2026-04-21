// Buffer generation helpers for the dream audio engine.
// All functions take an AudioContext and return an AudioBuffer.

const IR_SAMPLE_RATE = 44100

/** Reverb impulse response — random noise with exponential decay, then smoothed for darker tail. */
export function generateIR(ctx: AudioContext, decay: number): AudioBuffer {
  const length = Math.floor(IR_SAMPLE_RATE * decay)
  const ir = ctx.createBuffer(2, length, IR_SAMPLE_RATE)

  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      const t = i / IR_SAMPLE_RATE
      const envelope = Math.exp(-t / (decay * 0.35))
      data[i] = (Math.random() * 2 - 1) * envelope
    }
    // Smooth IR to darken the reverb tail
    for (let pass = 0; pass < 3; pass++) {
      for (let i = length - 1; i >= 2; i--) {
        data[i] = (data[i]! + data[i - 1]! + data[i - 2]!) / 3
      }
    }
  }

  return ir
}

/** Bright impulse response — same as generateIR but WITHOUT the smoothing loop.
 *  The smoothing averages adjacent samples, which rolls off high frequencies.
 *  Omitting it preserves full-spectrum brightness for the angelic shimmer. */
export function generateBrightIR(ctx: AudioContext, decay: number): AudioBuffer {
  const length = Math.floor(IR_SAMPLE_RATE * decay)
  const ir = ctx.createBuffer(2, length, IR_SAMPLE_RATE)

  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      const t = i / IR_SAMPLE_RATE
      const envelope = Math.exp(-t / (decay * 0.40)) // slightly slower decay than dark IR
      data[i] = (Math.random() * 2 - 1) * envelope
      // No smoothing passes — brightness preserved
    }
  }

  return ir
}

/** Generate a brown noise buffer (warmer than white, like radio static). */
export function generateNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    let lastOut = 0

    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1

      // Brown noise: integrate white noise with leak
      lastOut = (lastOut + 0.02 * white) / 1.02
      data[i] = lastOut * 3.5 // boost amplitude

      // Add occasional crackle pops (radio tuning texture)
      if (Math.random() < 0.0003) {
        data[i] += (Math.random() - 0.5) * 0.8
      }
    }
  }

  return buffer
}
