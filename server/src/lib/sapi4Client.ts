/**
 * Sapi4Client — HTTP client for the sapi4-api TTS microservice.
 *
 * Calls POST /synthesize on the SAPI4 Wine+Docker service.
 * Returns raw WAV audio bytes. Converts to base64 data URL for
 * Colyseus message transport (small NPC phrases = ~30-60KB WAV).
 *
 * Runs on a separate VPS (or localhost:8080 in dev).
 */

const SAPI4_URL = process.env.SAPI4_SERVICE_URL || 'http://localhost:8080'
const SAPI4_TIMEOUT = 15_000 // ms
const SAPI4_AGENT = 'Bonzi.acs' // Default ACS agent voice

export interface Sapi4Options {
  text: string
  agent?: string
  voice?: string
  pitch?: number
  speed?: number
  gain?: number
}

export interface Sapi4Result {
  /** Base64-encoded WAV audio. */
  audioBase64: string
  /** Duration estimate in ms (from WAV header). */
  durationMs: number
  /** Size of the WAV in bytes. */
  sizeBytes: number
}

/**
 * Synthesize speech via the SAPI4 service.
 * Returns base64-encoded WAV audio suitable for Colyseus message transport.
 * Returns null on failure (non-blocking — NPC text still works without audio).
 */
export async function synthesizeSpeech(opts: Sapi4Options): Promise<Sapi4Result | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SAPI4_TIMEOUT)

    const body: Record<string, unknown> = {
      text: opts.text,
      agent: opts.agent ?? SAPI4_AGENT,
    }
    if (opts.voice) body.voice = opts.voice
    if (opts.pitch !== undefined) body.pitch = opts.pitch
    if (opts.speed !== undefined) body.speed = opts.speed
    if (opts.gain !== undefined) body.gain = opts.gain

    const response = await fetch(`${SAPI4_URL}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown')
      console.warn(`[sapi4] Synthesis failed (${response.status}): ${errText}`)
      return null
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('audio/wav')) {
      console.warn(`[sapi4] Unexpected content-type: ${contentType}`)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    if (buffer.length < 44) {
      console.warn(`[sapi4] Audio too small (${buffer.length} bytes)`)
      return null
    }

    // Estimate duration from WAV header
    // WAV: bytes 28-31 = byte rate, data size = total - 44
    const byteRate = buffer.readUInt32LE(28)
    const dataSize = buffer.length - 44
    const durationMs = byteRate > 0 ? Math.round((dataSize / byteRate) * 1000) : 0

    const audioBase64 = buffer.toString('base64')

    return {
      audioBase64,
      durationMs,
      sizeBytes: buffer.length,
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[sapi4] Synthesis timed out')
    } else {
      console.warn('[sapi4] Synthesis error:', err)
    }
    return null
  }
}

/**
 * Check if the SAPI4 service is reachable.
 */
export async function sapi4HealthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${SAPI4_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  } catch {
    return false
  }
}
