/**
 * AcsLoader — WASM init + ACS file loading & caching.
 *
 * Same promise-cache pattern as CharacterLoader.ts: first call for a given URL
 * initiates the fetch+parse, subsequent calls return the same promise.
 *
 * ACS files contain their own images, sounds, and animation definitions —
 * unlike PaperDoll characters which have separate manifest + textures.
 */

import init, { AcsFile, type AnimationInfo, type StateInfo } from 'acs-web'
// Vite resolves this to a proper URL for the .wasm asset (works in both dev & prod)
import wasmUrl from 'acs-web/acs_web_bg.wasm?url'

// ── WASM Initialization ──

let wasmReady: Promise<void> | null = null

/** Lazy one-time WASM module initialization. */
export function ensureWasmInit(): Promise<void> {
  if (!wasmReady) {
    wasmReady = init({ module_or_path: wasmUrl }).then(() => {})
  }
  return wasmReady
}

// ── Types ──

export interface AcsAnimationMeta {
  name: string
  frameCount: number
  hasSound: boolean
  returnAnimation: string | undefined
}

export interface AcsCharacterData {
  acsFile: AcsFile
  width: number
  height: number
  /** All animation metadata (lightweight, no WASM cleanup needed). */
  animations: AcsAnimationMeta[]
  /** Animation name → state name (e.g. "Greet" → "GREETING"). */
  animationToState: Map<string, string>
  /** Categorized idle-state animations for random selection. */
  idleAnimations: string[]
  /** Categorized speaking-state animations. */
  speakingAnimations: string[]
  /** Categorized greeting-state animations. */
  greetingAnimations: string[]
  /** Preloaded sound buffers keyed by sound index. */
  soundBuffers: Map<number, AudioBuffer>
}

// ── Cache ──

const cache = new Map<string, Promise<AcsCharacterData>>()

// Shared AudioContext for sound preloading
let sharedAudioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioContext()
  }
  return sharedAudioCtx
}

// ── Loader ──

/**
 * Load an ACS character from a URL with caching.
 * First call fetches + parses; subsequent calls return the same promise.
 */
export function loadAcsCharacterCached(url: string): Promise<AcsCharacterData> {
  let existing = cache.get(url)
  if (existing) return existing

  const promise = loadAcsCharacter(url)
  cache.set(url, promise)

  // Evict on failure so next attempt retries
  promise.catch(() => {
    cache.delete(url)
  })

  return promise
}

async function loadAcsCharacter(url: string): Promise<AcsCharacterData> {
  await ensureWasmInit()

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ACS file: ${response.status} ${url}`)
  const buffer = await response.arrayBuffer()
  const acsFile = new AcsFile(new Uint8Array(buffer))

  // Extract animation metadata
  const animInfoList = acsFile.getAllAnimationInfo()
  const animations: AcsAnimationMeta[] = animInfoList.map((info: AnimationInfo) => ({
    name: info.name,
    frameCount: info.frameCount,
    hasSound: info.hasSound,
    returnAnimation: info.returnAnimation,
  }))

  // Build state maps
  const animationToState = new Map<string, string>()
  const idleAnimations: string[] = []
  const speakingAnimations: string[] = []
  const greetingAnimations: string[] = []

  // Create case-insensitive lookup for actual animation names
  const actualAnimNames = new Map<string, string>()
  for (const anim of animations) {
    actualAnimNames.set(anim.name.toLowerCase(), anim.name)
  }

  const states = acsFile.getStates()
  for (const state of states) {
    const stateName = state.name.toLowerCase()
    const stateAnims: string[] = state.animations

    for (const stateAnimName of stateAnims) {
      const actualName = actualAnimNames.get(stateAnimName.toLowerCase())
      if (actualName) {
        animationToState.set(actualName.toLowerCase(), state.name)

        if (stateName.includes('idl')) {
          idleAnimations.push(actualName)
        }
        if (stateName.includes('speak') || stateName.includes('explain') || stateName.includes('announc')) {
          speakingAnimations.push(actualName)
        }
        if (stateName.includes('greet') || stateName.includes('wave')) {
          greetingAnimations.push(actualName)
        }
      }
    }
    state.free()
  }

  // Preload sounds
  const soundBuffers = new Map<number, AudioBuffer>()
  const audioCtx = getAudioContext()
  const soundCount = acsFile.soundCount()

  for (let i = 0; i < soundCount; i++) {
    try {
      const arrayBuffer = acsFile.getSoundAsArrayBuffer(i)
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      soundBuffers.set(i, audioBuffer)
    } catch (err) {
      console.warn(`[AcsLoader] Failed to decode sound ${i}:`, err)
    }
  }

  return {
    acsFile,
    width: acsFile.width,
    height: acsFile.height,
    animations,
    animationToState,
    idleAnimations,
    speakingAnimations,
    greetingAnimations,
    soundBuffers,
  }
}

/** Get the shared AudioContext (for playback from other modules). */
export function getSharedAudioContext(): AudioContext {
  return getAudioContext()
}
