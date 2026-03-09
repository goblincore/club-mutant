# Dream Psychedelic Overhaul Design

## Goal

Transform the dream state from a VHS-aesthetic video player into a deep psychedelic acid trip — two videos always layered and blending, slowly sinking deeper via continuous zoom, with 2-3 screwed/pitched audio tracks overlapping in a sonic collage.

## Changes

### Remove

- **TV static** — all shader code (`tvStatic()`, `uStaticMix`, `uStaticTintA/B`), store params (9 fields), DreamScene burst timers, debug panel section
- **NPC chat overlay** — remove `<DreamChatOverlay />` from `DreamIframe.tsx`

### Visual — Defaults

| Param | Old | New |
|-------|-----|-----|
| `fisheye` | `true` | `false` |
| `vhsEffect` | `true` | `false` |
| `liquidAmount` | `0.06` | `0.01` |
| `saturation` | `1.3` | `2.2` |
| `blendOpacity` | `0.3` | `0.5` |

### Visual — Persistent Dual-Layer Video

Current: video A transitions fully to video B, then B plays solo until C arrives.

New: DreamScene maintains **Layer A** and **Layer B**, both always visible via blend mode. Each layer cycles independently on offset timers (60-120s). When one layer swaps its video, it does a brief melt transition for just that layer while the other stays. Both textures are always passed to the shader as the active pair.

Implementation: refactor `VideoState` into two independent `VideoLayer` objects, each with their own video element, texture, cycle timer, and transition state. The shader's `uVideoTex` and `uPrevVideoTex` become Layer A and Layer B respectively, with `uTransition` controlling the brief swap-dissolve for whichever layer is currently cycling.

### Visual — Infinite Sinking Zoom

New `uDriftZoom` uniform — continuous zoom toward center via sine modulation that creates the feeling of endlessly sinking deeper. Cycles smoothly (0 -> ~0.15 over ~40s, ease back, repeat). Combined with the existing slow rotation.

Added to the shader UV section before other transforms:
```glsl
vec2 centered = uv - 0.5;
centered /= (1.0 + uDriftZoom);
uv = centered + 0.5;
```

Driven from `useFrame`: `uDriftZoom = 0.08 + sin(t * 0.025) * 0.07`

### Audio — Three Pitch Effects (randomly per-layer)

Each audio layer randomly gets one of:

**A) Granular Pitch Shifter** — AudioWorklet that grabs ~60ms overlapping grains, plays them back detuned (-200 to -800 cents), crossfades grains with Hann window. True pitch-down without speed change.

**B) Ring Modulation** — OscillatorNode (5-30Hz sine) connected to GainNode that modulates the audio signal. Creates ghostly, underwater frequency shifting.

**C) Detuned Delay Chorus** — 3 modulated DelayNodes (20/35/50ms base delay, LFO-modulated +/-5-12ms) mixed with dry signal. Thick, woozy detuning.

Each effect implements a common interface:
```typescript
interface PitchEffect {
  connect(input: AudioNode, output: AudioNode): void
  disconnect(): void
  randomize(): void  // re-roll parameters
}
```

### Audio — Multi-Layer (2-3 simultaneous tracks)

Replace single-track model with an array of `AudioLayer` objects:
- Each layer: own `<audio>` element, own `MediaElementSourceNode`, own pitch effect, own `GainNode` (~0.3 each)
- Independent cycle timers, offset so changes are staggered
- All layers feed into the shared lowpass -> reverb -> master chain
- Layer count: 2 by default (configurable in debug store)

### Audio — Longer Segments

Cycle delay: 60-120s (up from 15-40s). With persistent dual-layer video and multi-layer audio, there's always movement even with longer per-layer durations.

## Files Modified

- `client-3d/src/stores/dreamDebugStore.ts` — remove static params, add layer count, update defaults
- `client-3d/src/shaders/DreamMaterial.tsx` — remove static code, add `uDriftZoom`, remove `staticMix` prop
- `client-3d/src/ui/DreamScene.tsx` — dual-layer video architecture, remove static burst system, longer cycle times
- `client-3d/src/ui/DreamIframe.tsx` — remove `<DreamChatOverlay />`
- `client-3d/src/ui/DreamDebugPanel.tsx` — remove static section, add layer count control
- `client-3d/src/audio/DreamAudioPlayer.ts` — multi-layer audio, pitch effects, longer cycles

## New Files

- `client-3d/src/audio/effects/GranularPitchShifter.ts` — AudioWorklet-based pitch shifter
- `client-3d/src/audio/effects/RingModulator.ts` — OscillatorNode frequency shifter
- `client-3d/src/audio/effects/DetunedChorus.ts` — Modulated delay chorus
- `client-3d/src/audio/effects/types.ts` — `PitchEffect` interface
