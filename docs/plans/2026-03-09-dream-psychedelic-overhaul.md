# Dream Psychedelic Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the dream state into a deep psychedelic acid trip — persistent dual-layer video, infinite sinking zoom, multi-layer audio with random pitch effects (granular, ring mod, chorus).

**Architecture:** Refactor DreamScene from single-video-with-transition to two independent video layers always blending. Refactor DreamAudioPlayer from single-track to multi-layer (2-3 simultaneous tracks), each with a randomly-assigned pitch effect. Remove TV static and NPC chat overlay.

**Tech Stack:** React/R3F, GLSL shaders, Web Audio API (AudioWorklet, OscillatorNode, DelayNode), Zustand

---

### Task 1: Remove TV Static + NPC Chat + Update Defaults

**Files:**
- Modify: `client-3d/src/stores/dreamDebugStore.ts`
- Modify: `client-3d/src/shaders/DreamMaterial.tsx`
- Modify: `client-3d/src/ui/DreamScene.tsx`
- Modify: `client-3d/src/ui/DreamIframe.tsx`
- Modify: `client-3d/src/ui/DreamDebugPanel.tsx`

**Step 1: Strip static from dreamDebugStore.ts**

Remove these fields from the `DreamDebugState` interface (lines 64-73):
```typescript
// DELETE: staticBursts, staticBurstChance, staticBurstIntervalMin,
// staticBurstIntervalMax, staticBurstDurationMin, staticBurstDurationMax,
// staticTransitions, staticTintA, staticTintB
```

Remove matching defaults (lines 148-156).

Add new field to interface + defaults:
```typescript
// Interface:
dreamAudioLayerCount: number  // 1-3

// Defaults:
dreamAudioLayerCount: 2,
```

Update these defaults:
```typescript
fisheye: false,       // was true
vhsEffect: false,     // was true
liquidAmount: 0.01,   // was 0.06
saturation: 2.2,      // was 1.3
blendOpacity: 0.5,    // was 0.3
```

**Step 2: Strip static from DreamMaterial.tsx**

Remove from fragment shader string:
- `uniform float uStaticMix;` and tint uniforms (lines 85-88)
- The entire `tvStatic()` function (lines 122-152)
- The static overlay block in main (lines 457-461)

Remove from uniforms object:
- `uStaticMix`, `uStaticTintA`, `uStaticTintB` (lines 523-526)

Remove from props interface + destructuring:
- `staticMix` prop (lines 471, 478)

Remove from useFrame:
- `u.uStaticMix.value = staticMix` (line 546)
- `u.uStaticTintA` / `u.uStaticTintB` lines (lines 595-597)

**Step 3: Add drift zoom uniform to DreamMaterial.tsx**

Add to fragment shader uniforms:
```glsl
uniform float uDriftZoom;
```

Add drift zoom as the very first UV transform in main() (before fisheye, line ~196):
```glsl
// 0. Infinite sinking zoom
{
  vec2 centered = uv - 0.5;
  centered /= (1.0 + uDriftZoom);
  uv = centered + 0.5;
}
```

Add to uniforms object:
```typescript
uDriftZoom: { value: 0.0 },
```

Add to useFrame:
```typescript
// Infinite sinking zoom — slow sine breathing that never stops
u.uDriftZoom.value = 0.08 + Math.sin(t * 0.025) * 0.07
```

**Step 4: Strip static from DreamScene.tsx**

Remove:
- `staticBurstTimerRef` ref (line 137)
- `staticMixRef`, `staticTargetRef`, `staticMix` state (lines 142-145)
- Entire static bursts useEffect (lines 278-318)
- Static-related code from cleanup (line 241)
- All `staticTarget` / `useStaticTransition` logic from the cycle function (lines 354-363, 388-413, 430-431)
- `staticMix` prop from `<DreamMaterial>` (line 516)
- Static interpolation block from useFrame (lines 484-494)

Simplify the cycle function back to just the normal melt dissolve path.

**Step 5: Remove DreamChatOverlay from DreamIframe.tsx**

Replace the full file with:
```typescript
import { useDreamStore } from '../dream/dreamStore'
import { DreamScene } from './DreamScene'

export function DreamIframe() {
  const isDreaming = useDreamStore((s) => s.isDreaming)
  if (!isDreaming) return null
  return <DreamScene />
}
```

**Step 6: Strip static section from DreamDebugPanel.tsx**

Remove the entire "TV Static (void signals)" `<Section>` block (lines 228-236).

Update saturation slider max from 2 to 4:
```typescript
<Slider label="saturation" field="saturation" min={0.5} max={4} />
```

**Step 7: Verify TypeScript compiles**

Run: `cd client-3d && npx tsc --noEmit`
Expected: clean (0 errors)

**Step 8: Commit**

```bash
git add -A
git commit -m "feat(dream): remove static + chat overlay, update psychedelic defaults"
```

---

### Task 2: Dual-Layer Video Architecture

**Files:**
- Modify: `client-3d/src/ui/DreamScene.tsx`

**Step 1: Replace VideoState with dual-layer types**

Replace the `VideoState` interface and `DreamLayer` component state with:

```typescript
interface VideoLayer {
  videoEl: HTMLVideoElement
  texture: THREE.VideoTexture
  videoId: string
  currentRate: number
  targetRate: number
}

interface DualLayerState {
  layerA: VideoLayer
  layerB: VideoLayer | null  // null until second layer loads
  // Which layer is currently transitioning (swapping its video)
  swappingLayer: 'a' | 'b' | null
  swapTransition: number  // 0-1 melt progress for the swapping layer
  swapPrevTexture: THREE.VideoTexture | null
  swapPrevVideoEl: HTMLVideoElement | null
}
```

**Step 2: Update randomCycleDelay for longer segments**

```typescript
function randomCycleDelay(): number {
  const min = 60_000   // was 15_000
  const max = 120_000  // was 40_000
  return min + Math.random() * (max - min)
}
```

**Step 3: Rewrite DreamLayer initialization**

The init function loads TWO videos. Layer A loads first, then Layer B loads with a 10s offset before its first cycle fires. Both layers cycle independently.

Key changes:
- Load layer A immediately (first video from cache list)
- Load layer B after a brief delay (second video, different from A)
- Each layer has its own cycle timer (stored as `cycleTimerARef` and `cycleTimerBRef`)
- Each layer has its own rate timer
- Random cuts apply to both layers independently

**Step 4: Rewrite the cycle function**

The cycle function takes a parameter `which: 'a' | 'b'` indicating which layer to swap. When cycling:
1. Load new video
2. Set `swappingLayer` to which layer is swapping
3. Store the old texture as `swapPrevTexture`
4. Animate `swapTransition` 0→1 over `transitionDuration`
5. When done, dispose old video/texture, clear swap state

**Step 5: Update the shader pass**

The `<DreamMaterial>` now always receives both layer textures. Update props:
```typescript
<DreamMaterial
  videoTexture={state.layerA.texture}
  prevVideoTexture={state.layerB?.texture ?? null}
  transition={swapTransition context}
/>
```

The key insight: `uVideoTex` = layer A, `uPrevVideoTex` = layer B. The blend mode runs continuously between them (not just during transitions). The `uTransition` uniform is repurposed: when no swap is happening, it stays at 0.5 (equal blend). During a layer swap, it temporarily shifts to control the melt dissolve for that layer's video change.

Actually, simpler approach: keep `uTransition` at 1.0 (meaning "show current"), and rely entirely on `uBlendMode` + `uBlendOpacity` (now 0.5) to create the persistent dual-layer look. The blend mode section of the shader already mixes `uVideoTex` and `uPrevVideoTex` using the blend mode. When a layer swaps, we briefly use the melt transition on that layer.

**Step 6: Update useFrame for dual-layer**

- Smooth playback rate for both layers independently
- Handle swap transition animation (lerp swapTransition toward 1.0)
- When swap completes, dispose old resources and clear swap state

**Step 7: Verify TypeScript compiles**

Run: `cd client-3d && npx tsc --noEmit`

**Step 8: Commit**

```bash
git add client-3d/src/ui/DreamScene.tsx
git commit -m "feat(dream): dual-layer video architecture with 60-120s segments"
```

---

### Task 3: Pitch Effects — Interface + Ring Modulator

**Files:**
- Create: `client-3d/src/audio/effects/types.ts`
- Create: `client-3d/src/audio/effects/RingModulator.ts`

**Step 1: Create the PitchEffect interface**

```typescript
// client-3d/src/audio/effects/types.ts
export interface PitchEffect {
  readonly name: string
  /** Wire into the audio graph: input → effect → output */
  connect(ctx: AudioContext, input: AudioNode, output: AudioNode): void
  /** Disconnect all nodes */
  disconnect(): void
  /** Re-roll random parameters */
  randomize(): void
}
```

**Step 2: Create RingModulator**

```typescript
// client-3d/src/audio/effects/RingModulator.ts
import type { PitchEffect } from './types'

export class RingModulator implements PitchEffect {
  readonly name = 'ring-mod'
  private osc: OscillatorNode | null = null
  private modGain: GainNode | null = null
  private inputGain: GainNode | null = null
  private freq = 15

  connect(ctx: AudioContext, input: AudioNode, output: AudioNode): void {
    // Ring mod: input → inputGain, osc → modGain → inputGain.gain
    // The oscillator modulates the gain of the input signal
    this.inputGain = ctx.createGain()
    this.inputGain.gain.value = 0 // will be modulated by oscillator

    this.modGain = ctx.createGain()
    this.modGain.gain.value = 1.0

    this.osc = ctx.createOscillator()
    this.osc.type = 'sine'
    this.osc.frequency.value = this.freq

    // Oscillator → modGain → inputGain.gain (AudioParam modulation)
    this.osc.connect(this.modGain)
    this.modGain.connect(this.inputGain.gain)

    input.connect(this.inputGain)
    this.inputGain.connect(output)

    this.osc.start()
  }

  disconnect(): void {
    try { this.osc?.stop() } catch {}
    try { this.osc?.disconnect() } catch {}
    try { this.modGain?.disconnect() } catch {}
    try { this.inputGain?.disconnect() } catch {}
    this.osc = null
    this.modGain = null
    this.inputGain = null
  }

  randomize(): void {
    this.freq = 5 + Math.random() * 25 // 5-30 Hz
    if (this.osc) {
      this.osc.frequency.value = this.freq
    }
  }
}
```

**Step 3: Commit**

```bash
git add client-3d/src/audio/effects/
git commit -m "feat(dream): pitch effect interface + ring modulator"
```

---

### Task 4: Pitch Effects — Detuned Chorus

**Files:**
- Create: `client-3d/src/audio/effects/DetunedChorus.ts`

**Step 1: Create DetunedChorus**

3 modulated delay lines mixed with dry signal:

```typescript
// client-3d/src/audio/effects/DetunedChorus.ts
import type { PitchEffect } from './types'

interface ChorusVoice {
  delay: DelayNode
  lfo: OscillatorNode
  lfoGain: GainNode
  gain: GainNode
}

export class DetunedChorus implements PitchEffect {
  readonly name = 'chorus'
  private voices: ChorusVoice[] = []
  private dryGain: GainNode | null = null
  private merger: GainNode | null = null

  // Voice configs: [baseDelay(s), lfoRate(Hz), lfoDepth(s)]
  private configs = [
    [0.020, 0.3, 0.005],
    [0.035, 0.2, 0.008],
    [0.050, 0.15, 0.012],
  ]

  connect(ctx: AudioContext, input: AudioNode, output: AudioNode): void {
    this.merger = ctx.createGain()
    this.merger.gain.value = 1.0
    this.merger.connect(output)

    // Dry signal
    this.dryGain = ctx.createGain()
    this.dryGain.gain.value = 0.5
    input.connect(this.dryGain)
    this.dryGain.connect(this.merger)

    // Wet voices
    const wetLevel = 0.5 / this.configs.length
    for (const [baseDelay, lfoRate, lfoDepth] of this.configs) {
      const delay = ctx.createDelay(0.1)
      delay.delayTime.value = baseDelay!

      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = lfoRate!

      const lfoGain = ctx.createGain()
      lfoGain.gain.value = lfoDepth!

      const gain = ctx.createGain()
      gain.gain.value = wetLevel

      // LFO → lfoGain → delay.delayTime
      lfo.connect(lfoGain)
      lfoGain.connect(delay.delayTime)

      input.connect(delay)
      delay.connect(gain)
      gain.connect(this.merger)

      lfo.start()
      this.voices.push({ delay, lfo, lfoGain, gain })
    }
  }

  disconnect(): void {
    for (const v of this.voices) {
      try { v.lfo.stop() } catch {}
      try { v.lfo.disconnect() } catch {}
      try { v.lfoGain.disconnect() } catch {}
      try { v.delay.disconnect() } catch {}
      try { v.gain.disconnect() } catch {}
    }
    this.voices = []
    try { this.dryGain?.disconnect() } catch {}
    try { this.merger?.disconnect() } catch {}
    this.dryGain = null
    this.merger = null
  }

  randomize(): void {
    this.configs = [
      [0.015 + Math.random() * 0.015, 0.2 + Math.random() * 0.3, 0.003 + Math.random() * 0.007],
      [0.025 + Math.random() * 0.020, 0.1 + Math.random() * 0.2, 0.005 + Math.random() * 0.010],
      [0.040 + Math.random() * 0.025, 0.08 + Math.random() * 0.15, 0.008 + Math.random() * 0.012],
    ]
    // If already connected, update voice params
    this.voices.forEach((v, i) => {
      const cfg = this.configs[i]!
      v.delay.delayTime.value = cfg[0]!
      v.lfo.frequency.value = cfg[1]!
      v.lfoGain.gain.value = cfg[2]!
    })
  }
}
```

**Step 2: Commit**

```bash
git add client-3d/src/audio/effects/DetunedChorus.ts
git commit -m "feat(dream): detuned delay chorus pitch effect"
```

---

### Task 5: Pitch Effects — Granular Pitch Shifter

**Files:**
- Create: `client-3d/src/audio/effects/GranularPitchShifter.ts`

**Step 1: Create GranularPitchShifter**

Uses a ScriptProcessorNode (simpler than AudioWorklet for this use case — we only need low-quality processing for the dreamy effect). Grabs overlapping grains from the input, plays them detuned.

Actually, a simpler approach that works well: use two AudioBufferSourceNodes alternating, each capturing a short segment and playing it back detuned. But that's complex for streaming audio.

Simplest correct approach: use the `playbackRate` on the audio element (which we already do for DJ Screw) and accept that this one changes both pitch AND speed. The "granular" effect can instead be simulated by rapidly modulating the playback rate in small oscillations around the target rate, creating a wobbly tape-stop-like pitch shifting.

Actually even simpler and more practical: use a **pitch-shifting delay trick**. A single delay with its delay time being continuously swept creates a Doppler-like pitch shift. This is a well-known technique:

```typescript
// client-3d/src/audio/effects/GranularPitchShifter.ts
import type { PitchEffect } from './types'

/**
 * Pitch shifter using the "swept delay" technique.
 * A sawtooth LFO drives the delay time, creating continuous Doppler pitch shift.
 * Two voices with offset phases smooth the output.
 */
export class GranularPitchShifter implements PitchEffect {
  readonly name = 'granular'
  private voices: Array<{
    delay: DelayNode
    lfo: OscillatorNode
    lfoGain: GainNode
    gain: GainNode
  }> = []
  private merger: GainNode | null = null
  private shiftAmount = -0.15 // negative = pitch down

  connect(ctx: AudioContext, input: AudioNode, output: AudioNode): void {
    this.merger = ctx.createGain()
    this.merger.gain.value = 1.0
    this.merger.connect(output)

    // Two voices with 180° phase offset for smooth output
    for (let i = 0; i < 2; i++) {
      const delay = ctx.createDelay(1.0)
      delay.delayTime.value = 0.05

      const lfo = ctx.createOscillator()
      lfo.type = 'sawtooth'
      // LFO rate controls grain size: slower = larger grains = smoother
      lfo.frequency.value = 4 + Math.random() * 2 // 4-6 Hz

      const lfoGain = ctx.createGain()
      // The sweep depth determines pitch shift amount
      // Negative values sweep delay time down → pitch shifts down
      lfoGain.gain.value = this.shiftAmount * 0.02

      const gain = ctx.createGain()
      gain.gain.value = 0.5

      lfo.connect(lfoGain)
      lfoGain.connect(delay.delayTime)

      input.connect(delay)
      delay.connect(gain)
      gain.connect(this.merger)

      // Offset second voice by half a cycle
      lfo.start(ctx.currentTime + (i * 0.5) / lfo.frequency.value)

      this.voices.push({ delay, lfo, lfoGain, gain })
    }
  }

  disconnect(): void {
    for (const v of this.voices) {
      try { v.lfo.stop() } catch {}
      try { v.lfo.disconnect() } catch {}
      try { v.lfoGain.disconnect() } catch {}
      try { v.delay.disconnect() } catch {}
      try { v.gain.disconnect() } catch {}
    }
    this.voices = []
    try { this.merger?.disconnect() } catch {}
    this.merger = null
  }

  randomize(): void {
    // Random pitch shift: -3 to -8 semitones worth of shift
    this.shiftAmount = -(0.1 + Math.random() * 0.25)
    for (const v of this.voices) {
      v.lfoGain.gain.value = this.shiftAmount * 0.02
      v.lfo.frequency.value = 3 + Math.random() * 4
    }
  }
}
```

**Step 2: Create index barrel export**

```typescript
// client-3d/src/audio/effects/index.ts
export type { PitchEffect } from './types'
export { RingModulator } from './RingModulator'
export { DetunedChorus } from './DetunedChorus'
export { GranularPitchShifter } from './GranularPitchShifter'

import { RingModulator } from './RingModulator'
import { DetunedChorus } from './DetunedChorus'
import { GranularPitchShifter } from './GranularPitchShifter'
import type { PitchEffect } from './types'

/** Create a random pitch effect */
export function randomPitchEffect(): PitchEffect {
  const effects = [
    () => new RingModulator(),
    () => new DetunedChorus(),
    () => new GranularPitchShifter(),
  ]
  const effect = effects[Math.floor(Math.random() * effects.length)]!()
  effect.randomize()
  return effect
}
```

**Step 3: Verify compiles**

Run: `cd client-3d && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add client-3d/src/audio/effects/
git commit -m "feat(dream): granular pitch shifter + effect barrel export"
```

---

### Task 6: Multi-Layer Audio Architecture

**Files:**
- Modify: `client-3d/src/audio/DreamAudioPlayer.ts`

This is the biggest refactor. Replace the single-track model with multi-layer.

**Step 1: Define AudioLayer type**

Add at the top of DreamAudioPlayer.ts:

```typescript
import { randomPitchEffect, type PitchEffect } from './effects'

interface AudioLayer {
  audioEl: HTMLAudioElement
  sourceNode: MediaElementAudioSourceNode
  gainNode: GainNode
  pitchEffect: PitchEffect
  /** Node that the pitch effect outputs to (connects to shared lowpass) */
  effectOutput: GainNode
  cycleTimer: ReturnType<typeof setTimeout> | null
  layerIndex: number
}
```

**Step 2: Replace single-track fields with layers array**

Remove these fields from the class:
- `audioEl`, `sourceNode` (lines 36-37)
- `prevAudioEl`, `prevSourceNode`, `prevGainNode` (lines 40-42)
- `currentIndex`, `cycleTimer` (lines 58-59)

Add:
```typescript
private layers: AudioLayer[] = []
private layerCount = 2
```

**Step 3: Rewrite playTrack → playTrackOnLayer**

New method signature:
```typescript
private async playTrackOnLayer(layerIndex: number, videoId: string): Promise<void>
```

For each layer:
1. Load audio track
2. Seek to random position
3. Set playback rate (with BPM matching)
4. Create a per-layer GainNode (volume = `dreamAudioVolume / layerCount`)
5. Create a random pitch effect via `randomPitchEffect()`
6. Wire: `sourceNode → pitchEffect → effectOutput → lowpass (shared)`
7. If replacing an existing layer, crossfade out the old one
8. Start playback

**Step 4: Rewrite start() to launch N layers**

```typescript
async start(): Promise<void> {
  // ... existing setup (fetch cache list, etc.)

  const dbg = useDreamDebugStore.getState()
  this.layerCount = dbg.dreamAudioLayerCount

  // Launch layers with staggered starts
  for (let i = 0; i < this.layerCount && i < this.videoIds.length; i++) {
    const videoId = this.videoIds[i]!
    // Stagger layer starts by 5-15 seconds
    const delay = i * (5000 + Math.random() * 10000)
    setTimeout(() => {
      void this.playTrackOnLayer(i, videoId)
      this.scheduleLayerCycle(i)
    }, delay)
  }
}
```

**Step 5: Rewrite scheduleCycle → scheduleLayerCycle**

Each layer cycles independently on 60-120s timers:
```typescript
private scheduleLayerCycle(layerIndex: number): void {
  const delay = 60_000 + Math.random() * 60_000  // 60-120s

  const layer = this.layers[layerIndex]
  if (layer?.cycleTimer) clearTimeout(layer.cycleTimer)

  const timer = setTimeout(async () => {
    if (!this._isPlaying || this.videoIds.length === 0) return
    // Pick a random video different from current
    const currentId = this.layers[layerIndex]?.audioEl.src
    let nextId: string
    do {
      nextId = this.videoIds[Math.floor(Math.random() * this.videoIds.length)]!
    } while (nextId === currentId && this.videoIds.length > 1)

    await this.playTrackOnLayer(layerIndex, nextId)
    this.scheduleLayerCycle(layerIndex)
  }, delay)

  // Store timer on the layer
  if (this.layers[layerIndex]) {
    this.layers[layerIndex].cycleTimer = timer
  }
}
```

**Step 6: Update connectSource to route through pitch effect**

Instead of `source.connect(this.lowpass!)`, each layer gets:
```
source → effectOutput (GainNode) → [pitchEffect wired in between] → lowpass
```

The pitch effect's `connect()` method handles the internal wiring.

**Step 7: Update cleanup() for multi-layer**

Iterate over `this.layers`, disconnect each layer's audio, source, gain, and pitch effect. Clear the array.

**Step 8: Update syncParams()**

When syncing, update per-layer gains based on `dreamAudioVolume / layerCount`.

**Step 9: Verify compiles**

Run: `cd client-3d && npx tsc --noEmit`

**Step 10: Commit**

```bash
git add client-3d/src/audio/DreamAudioPlayer.ts
git commit -m "feat(dream): multi-layer audio with random pitch effects per layer"
```

---

### Task 7: Update Debug Panel

**Files:**
- Modify: `client-3d/src/ui/DreamDebugPanel.tsx`

**Step 1: Add layer count slider**

In the "Dream Audio (DJ Screw)" section, add after the enabled toggle:
```typescript
<Slider label="audio layers" field="dreamAudioLayerCount" min={1} max={3} step={1} />
```

**Step 2: Update BPM display to show active effects**

Update `BPMDisplay` to also show which pitch effects are active on each layer. Add a method to DreamAudioPlayer:
```typescript
getLayerInfo(): Array<{ effect: string; videoId: string }> {
  return this.layers.map(l => ({
    effect: l.pitchEffect.name,
    videoId: l.audioEl.src.split('/').pop()?.split('?')[0] ?? '?',
  }))
}
```

Display in BPMDisplay:
```typescript
const layers = getDreamAudioPlayer().getLayerInfo()
// Show: "L1: ring-mod | L2: chorus"
```

**Step 3: Verify compiles**

Run: `cd client-3d && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add client-3d/src/ui/DreamDebugPanel.tsx client-3d/src/audio/DreamAudioPlayer.ts
git commit -m "feat(dream): debug panel layer count + effect info display"
```

---

### Task 8: Final Integration + Polish

**Step 1: Smoke test the full dream flow**

Run dev servers:
```bash
cd server && pnpm dev &
cd client-3d && pnpm dev
```

Enter dream mode and verify:
- Two video layers always blending via blend mode
- Slow continuous zoom creating "sinking deeper" feeling
- 60-120s per layer cycle
- Saturation cranked, no fisheye, no VHS
- No static bursts or static transitions
- No NPC chat overlay
- 2 audio layers playing simultaneously
- Each audio layer has a different pitch effect (check console logs)
- BPM detection still works
- Debug panel shows layer info

**Step 2: Tune any values that feel off**

Adjust drift zoom speed/amount, blend opacity, saturation, layer volumes based on how it looks and sounds.

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(dream): psychedelic acid trip overhaul complete"
```
