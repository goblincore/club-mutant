/**
 * npcTtsPlayer — Decodes and plays base64 WAV audio from NPC TTS messages.
 *
 * Receives base64-encoded WAV from server (via NPC_TTS_AUDIO message),
 * decodes to AudioBuffer, and plays through Web Audio API.
 *
 * Uses a simple queue to prevent overlapping NPC speech.
 */

let audioCtx: AudioContext | null = null
let gainNode: GainNode | null = null
let currentSource: AudioBufferSourceNode | null = null

// Queue of pending audio buffers
const audioQueue: AudioBuffer[] = []
let isPlaying = false

function ensureAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
    gainNode = audioCtx.createGain()
    gainNode.gain.value = 0.7
    gainNode.connect(audioCtx.destination)
  }
  return audioCtx
}

/**
 * Eagerly warm + resume the AudioContext from a user gesture context.
 * Call this on keypress/click BEFORE any async work, so the browser
 * doesn't block playback later due to autoplay policy.
 */
export function warmAudioContext(): void {
  const ctx = ensureAudioContext()
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }
}

/**
 * Play base64-encoded WAV audio from NPC TTS.
 * Queues if another NPC audio is currently playing.
 */
export async function playNpcTtsAudio(audioBase64: string): Promise<void> {
  try {
    const ctx = ensureAudioContext()

    // Resume if suspended (autoplay policy)
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    // Decode base64 → ArrayBuffer → AudioBuffer
    const binaryString = atob(audioBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    const audioBuffer = await ctx.decodeAudioData(bytes.buffer)

    // Queue or play immediately
    if (isPlaying) {
      audioQueue.push(audioBuffer)
    } else {
      playBuffer(audioBuffer)
    }
  } catch (err) {
    console.warn('[npcTtsPlayer] Failed to decode/play audio:', err)
  }
}

function playBuffer(buffer: AudioBuffer): void {
  if (!audioCtx || !gainNode) return

  isPlaying = true

  const source = audioCtx.createBufferSource()
  source.buffer = buffer
  source.connect(gainNode)
  currentSource = source

  source.onended = () => {
    currentSource = null
    isPlaying = false

    // Play next in queue
    const next = audioQueue.shift()
    if (next) {
      playBuffer(next)
    }
  }

  source.start()
}

/** Stop any currently playing NPC audio and clear the queue. */
export function stopNpcTtsAudio(): void {
  audioQueue.length = 0
  if (currentSource) {
    try { currentSource.stop() } catch { /* already stopped */ }
    currentSource = null
  }
  isPlaying = false
}

/** Set NPC TTS volume (0..1). */
export function setNpcTtsVolume(volume: number): void {
  if (gainNode) {
    gainNode.gain.value = Math.max(0, Math.min(1, volume))
  }
}

// ── Client-side SAPI4 TTS (for dream scene) ──

const SAPI4_URL = import.meta.env.VITE_SAPI4_SERVICE_URL || 'http://localhost:8089'
const SAPI4_TIMEOUT = 20_000

/**
 * Synthesize text via SAPI4 and play the resulting audio.
 * Returns duration in ms on success, null on failure (graceful fallback).
 * Used by DreamAcsCharacter for Bonzi speaking the Drifter's responses.
 */
export async function synthesizeAndPlay(text: string): Promise<number | null> {
  try {
    const response = await fetch(`${SAPI4_URL}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, agent: 'Bonzi.acs' }),
      signal: AbortSignal.timeout(SAPI4_TIMEOUT),
    })

    if (!response.ok) {
      console.warn(`[npcTts] SAPI4 synthesis failed (${response.status})`)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength < 44) {
      console.warn(`[npcTts] SAPI4 audio too small (${arrayBuffer.byteLength} bytes)`)
      return null
    }

    // Estimate duration from WAV header (bytes 28-31 = byte rate)
    const view = new DataView(arrayBuffer)
    const byteRate = view.getUint32(28, true) // little-endian
    const dataSize = arrayBuffer.byteLength - 44
    const durationMs = byteRate > 0 ? Math.round((dataSize / byteRate) * 1000) : 0

    console.log(`[npcTts] SAPI4 audio received: ${arrayBuffer.byteLength} bytes, ~${durationMs}ms`)

    // Decode WAV directly from ArrayBuffer (skip base64 round-trip)
    const ctx = ensureAudioContext()
    if (ctx.state === 'suspended') {
      console.warn('[npcTts] AudioContext suspended, attempting resume...')
      await ctx.resume()
    }

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    console.log(`[npcTts] Decoded AudioBuffer: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels}ch, ${audioBuffer.sampleRate}Hz`)

    // Play via queue (same as playNpcTtsAudio but without base64 decode)
    if (isPlaying) {
      audioQueue.push(audioBuffer)
    } else {
      playBuffer(audioBuffer)
    }

    return durationMs
  } catch (err) {
    // Graceful fallback — no audio, Bonzi still animates
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[npcTts] SAPI4 synthesis timed out')
    } else {
      console.warn('[npcTts] SAPI4 synthesis error:', err)
    }
    return null
  }
}
