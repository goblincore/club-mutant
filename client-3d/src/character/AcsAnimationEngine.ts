/**
 * AcsAnimationEngine — Tick-based animation state machine for ACS characters.
 *
 * Designed for R3F's useFrame loop: call tick(deltaMs) every frame.
 * No setTimeout — pure accumulator-based timing.
 *
 * Ported from bonzi/acs-web-example/src/main.ts (lines 369-548),
 * adapted from setTimeout-driven to deltaTime-driven.
 */

import type { AcsFile, AnimationData, ImageData as AcsImageData } from 'acs-web'
import type { AcsCharacterData } from './AcsLoader'

// ── Types ──

export type AcsNpcState = 'idle' | 'speaking' | 'greeting' | 'reacting'

export interface TickResult {
  /** Whether the frame index changed this tick (need to re-render). */
  frameChanged: boolean
  /** Current frame index in the active animation. */
  frameIndex: number
  /** Active animation name. */
  animName: string
  /** Sound index to play this tick (-1 = none). */
  soundIndex: number
}

// ── LRU Frame Cache ──

const MAX_CACHED_FRAMES = 60 // ~20MB for Bonzi (320×256×4 bytes × 60)

interface CachedFrame {
  /** RGBA pixel data (already copied from WASM). */
  rgba: Uint8ClampedArray
  width: number
  height: number
}

class FrameCache {
  private cache = new Map<string, CachedFrame>()
  private order: string[] = [] // LRU order (newest at end)

  get(key: string): CachedFrame | undefined {
    const entry = this.cache.get(key)
    if (entry) {
      // Move to end (most recently used)
      const idx = this.order.indexOf(key)
      if (idx !== -1) {
        this.order.splice(idx, 1)
        this.order.push(key)
      }
    }
    return entry
  }

  set(key: string, frame: CachedFrame): void {
    if (this.cache.has(key)) {
      // Update existing
      this.cache.set(key, frame)
      const idx = this.order.indexOf(key)
      if (idx !== -1) {
        this.order.splice(idx, 1)
        this.order.push(key)
      }
      return
    }

    // Evict oldest if at capacity
    while (this.order.length >= MAX_CACHED_FRAMES) {
      const oldest = this.order.shift()
      if (oldest) this.cache.delete(oldest)
    }

    this.cache.set(key, frame)
    this.order.push(key)
  }

  clear(): void {
    this.cache.clear()
    this.order = []
  }
}

// ── Engine ──

export class AcsAnimationEngine {
  private acsFile: AcsFile
  private charData: AcsCharacterData

  // Current playback state
  private currentAnim: AnimationData | null = null
  private currentAnimName = ''
  private currentFrame = 0
  private frameClock = 0 // ms accumulated since last frame advance
  private currentFrameDuration = 100 // ms for current frame

  // State management
  private requestedState: AcsNpcState = 'idle'
  private activeState: AcsNpcState = 'idle'
  private stateChangeQueued = false

  // Frame rendering cache
  private frameCache = new FrameCache()

  // Sound tracking (reports once per frame change)
  private pendingSoundIndex = -1

  // Track if we need to render
  private _frameChanged = true // Start true to trigger initial render

  constructor(charData: AcsCharacterData) {
    this.charData = charData
    this.acsFile = charData.acsFile

    // Start with an idle animation
    this.pickAnimationForState('idle')
  }

  /** Request a state change. Takes effect at next animation boundary. */
  requestState(state: AcsNpcState): void {
    if (state === this.requestedState) return
    this.requestedState = state
    this.stateChangeQueued = true

    // For speaking/greeting, interrupt immediately if currently idle
    if (state !== 'idle' && this.activeState === 'idle') {
      this.transitionToState(state)
    }
  }

  /** Get the current active state. */
  get state(): AcsNpcState {
    return this.activeState
  }

  /**
   * Advance the animation by deltaMs.
   * Call this from useFrame: `engine.tick(delta * 1000)`
   */
  tick(deltaMs: number): TickResult {
    if (!this.currentAnim) {
      return { frameChanged: false, frameIndex: 0, animName: '', soundIndex: -1 }
    }

    this.frameClock += deltaMs
    let frameChanged = false
    let soundIndex = -1

    // Process accumulated time — may advance multiple frames if delta is large
    while (this.frameClock >= this.currentFrameDuration && this.currentAnim) {
      this.frameClock -= this.currentFrameDuration

      const nextFrame = this.selectNextFrame()
      const frameCount = this.currentAnim.frameCount

      if (nextFrame < 0 || nextFrame >= frameCount) {
        // Animation finished
        this.handleAnimationEnd()
        frameChanged = true
        break
      } else {
        this.currentFrame = nextFrame
        frameChanged = true

        // Update duration for new frame
        const frameData = this.currentAnim.getFrame(this.currentFrame)
        if (frameData) {
          this.currentFrameDuration = frameData.durationMs || 100
          if (frameData.soundIndex >= 0) {
            soundIndex = frameData.soundIndex
          }
          frameData.free()
        }
      }
    }

    // Check initial render flag
    if (this._frameChanged) {
      frameChanged = true
      this._frameChanged = false
    }

    return {
      frameChanged,
      frameIndex: this.currentFrame,
      animName: this.currentAnimName,
      soundIndex,
    }
  }

  /**
   * Render the current frame to RGBA data.
   * Uses LRU cache — only calls WASM renderFrame on cache miss.
   */
  renderFrame(): CachedFrame | null {
    if (!this.currentAnim) return null

    const cacheKey = `${this.currentAnimName}:${this.currentFrame}`
    const cached = this.frameCache.get(cacheKey)
    if (cached) return cached

    // Cache miss — render from WASM
    let imageData: AcsImageData | null = null
    try {
      imageData = this.acsFile.renderFrame(this.currentAnimName, this.currentFrame)
      const frame: CachedFrame = {
        rgba: new Uint8ClampedArray(imageData.data),
        width: imageData.width,
        height: imageData.height,
      }
      this.frameCache.set(cacheKey, frame)
      return frame
    } catch (err) {
      console.error('[AcsAnimationEngine] renderFrame failed:', err)
      return null
    } finally {
      imageData?.free()
    }
  }

  /** Clean up WASM resources. */
  dispose(): void {
    if (this.currentAnim) {
      this.currentAnim.free()
      this.currentAnim = null
    }
    this.frameCache.clear()
  }

  // ── Private ──

  private pickAnimationForState(state: AcsNpcState): void {
    let candidates: string[]

    switch (state) {
      case 'speaking':
        candidates = this.charData.speakingAnimations
        break
      case 'greeting':
        candidates = this.charData.greetingAnimations
        break
      case 'reacting':
        // Reacting uses greeting anims as a fallback
        candidates = this.charData.greetingAnimations
        break
      case 'idle':
      default:
        candidates = this.charData.idleAnimations
        break
    }

    // Fallback to idle if no candidates for requested state
    if (candidates.length === 0) {
      candidates = this.charData.idleAnimations
    }

    // Still empty? Fall back to any animation
    if (candidates.length === 0) {
      const allAnims = this.charData.animations
      if (allAnims.length > 0) {
        candidates = [allAnims[0].name]
      } else {
        return // No animations at all
      }
    }

    // Pick random from candidates for variety
    const name = candidates[Math.floor(Math.random() * candidates.length)]
    this.startAnimation(name)
    this.activeState = state
  }

  private startAnimation(name: string): void {
    // Free previous animation data
    if (this.currentAnim) {
      this.currentAnim.free()
      this.currentAnim = null
    }

    try {
      this.currentAnim = this.acsFile.getAnimation(name)
      this.currentAnimName = name
      this.currentFrame = 0
      this.frameClock = 0
      this._frameChanged = true

      // Get first frame duration + sound
      const frameData = this.currentAnim.getFrame(0)
      if (frameData) {
        this.currentFrameDuration = frameData.durationMs || 100
        if (frameData.soundIndex >= 0) {
          this.pendingSoundIndex = frameData.soundIndex
        }
        frameData.free()
      }
    } catch (err) {
      console.error(`[AcsAnimationEngine] Failed to start animation "${name}":`, err)
    }
  }

  private selectNextFrame(): number {
    if (!this.currentAnim) return this.currentFrame + 1

    const branches = this.currentAnim.getFrameBranches(this.currentFrame)
    if (branches.length === 0) {
      return this.currentFrame + 1
    }

    // Probabilistic branching
    const total = branches.reduce((sum, b) => sum + b.probability, 0)
    if (total === 0) return this.currentFrame + 1

    const roll = Math.random() * total
    let cumulative = 0
    for (const branch of branches) {
      cumulative += branch.probability
      if (roll < cumulative) {
        return branch.frameIndex
      }
    }

    return branches[branches.length - 1].frameIndex
  }

  private handleAnimationEnd(): void {
    if (!this.currentAnim) return

    const transitionType = this.currentAnim.transitionType
    const returnAnim = this.currentAnim.returnAnimation

    if (transitionType.usesReturnAnimation && returnAnim) {
      // Play return animation (e.g., "GreetReturn")
      this.startAnimation(returnAnim)
      return
    }

    // Check if we need to change state
    if (this.stateChangeQueued && this.requestedState !== this.activeState) {
      this.stateChangeQueued = false
      this.transitionToState(this.requestedState)
      return
    }

    // Stay in current state — pick another animation for variety
    this.pickAnimationForState(this.activeState)
  }

  private transitionToState(state: AcsNpcState): void {
    this.stateChangeQueued = false
    this.pickAnimationForState(state)
  }
}
