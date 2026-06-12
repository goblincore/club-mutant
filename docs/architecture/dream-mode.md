# Dream Mode — Generative Audio/Visual Collage

Dream mode is a solitary generative audio/visual experience entered by sleeping in the MyRoom futon. It plays a collage of slowed YouTube material through a heavy WebAudio effects chain while a shader melts video layers together — structured by a **section conductor** so each dream has form, a recurring theme, and a personal connection to what the player heard in the club.

> Historical note: dream mode was originally planned as a Yume Nikki-style 2D tile exploration (see `docs/archive/dream-mode-yume-nikki-plan.md`). That concept was superseded by the current generative A/V design.

## Entry / exit

- Futon in `client-3d/src/scene/JapaneseRoom.tsx` → SleepPrompt → `dreamStore.enterDream()`; `App.tsx` lazily mounts `DreamScene` as a full-screen overlay.
- Server involvement is minimal: `DREAM_SLEEP`/`DREAM_WAKE` set `player.isDreaming` so visitors see the sleeping character. All dream content is client-side.
- Wake via the corner button → WakePrompt ("Pinch your cheek?").

## The conductor (musical form)

`client-3d/src/dream/DreamConductor.ts` — a pure-logic Markov state machine over five section kinds:

| Section | Feel | Collage layers | Pulse | Drone |
|---|---|---|---|---|
| `submerge` | murky opening — filter closed, wet reverb | 1 (the theme) | off | strong |
| `surface` | filter opens, second layer enters | 2 | mid | mid |
| `peak` | full density, brightest | 2 | full | low |
| `breakdown` | collage drops out; drone + shimmer tails | 0 | off | strong |
| `themeReturn` | the theme alone — the dream's chorus | 1 | mid | low |

Sections last 8–24 bars at a session BPM of 58–72 (4/4). Transitions follow weighted Markov arcs; a `themeReturn` is **guaranteed at least every 5 sections**. `emitDreamSection`/`onDreamSection` broadcast section changes to the visual layer.

## Seeded sessions

All musical structure flows through a seeded RNG (`client-3d/src/dream/seededRandom.ts`, mulberry32). The seed is `hash(anonymous-identity : UTC-date)`, so a given player's dream is anchored per day: same BPM, theme track, drone root, and opening. (Full section-sequence reproducibility is approximate — pulse and conductor draws interleave on real-time clocks, and the track pool is network-dependent.)

## Audio engine

`client-3d/src/audio/DreamAudioPlayer.ts` (singleton):

- **Collage layers**: up to 2 simultaneous YouTube audio tracks (via the youtube-api proxy), slowed 0.6–0.9x with pitch dropping (`preservesPitch = false`), spectrally split (one lowpassed / one highpassed at a per-session crossover), each through a random pitch effect (`src/audio/effects/`).
- **Theme track**: chosen at session start — the player's most recent club play if available, else first cache id. It opens the dream and returns on every `themeReturn` at the *same seek position and rate*.
- **Personal sources**: track picks are weighted (`dreamPersonalBias`, default 3x) toward the player's last-24h club listening, recorded by `client-3d/src/dream/playHistory.ts` (localStorage, subscribes to the music store).
- **DreamPulse** (`src/audio/DreamPulse.ts`): synthesized kick on a lookahead-scheduled clock we own — half-time feel at the session BPM. Drives the sidechain pump and the shader's `uBeatKick` via `onKick` (gated on the pulse actually being audible). Routed to `ctx.destination` so it isn't ducked by its own sidechain.
- **DreamDrone** (`src/audio/DreamDrone.ts`): 3-voice harmonic drone (root from E1/G1/A1/B1) with a breathing lowpass — the tonal anchor that lets random material above it read as color instead of clash. Routed through `masterGain` so it pumps with the sidechain.
- **Shared chain** (unchanged): lowpass → vocal formants → reverb wet/dry, hi-band delay+reverb, bright shimmer reverb, sidechain duck → destination.
- The conductor applies each section's params with ~4s `linearRamp`s and decides which layers are audible / swapped. The old independent 60–120s cycle timers and detected-BPM "beat matching" are gone; FFT BPM detection survives only as a debug readout (and visual flicker when the pulse is silent).
- Lifecycle is guarded by a session-generation counter (rapid wake→re-sleep and StrictMode double-mounts are safe) and a pending-load set (section boundaries can't double-dispatch a layer).

## Visuals

`client-3d/src/ui/DreamScene.tsx`: two video layers (youtube proxy, video-only) blended through `DreamMaterial.tsx` (~50 audio-reactive uniforms: chromatic aberration, liquid warp, VHS, glitch, melt dissolve). Video melt-transitions now fire on conductor **section boundaries** (alternating layers; breakdowns hold the image), and the video source list is also personal-history-first. Fallback: `DreamGenerativeMaterial` (FBM noise) when no videos are available.

## Tuning

`D` toggles the debug panel (`dreamDebugStore` + `DreamDebugPanel.tsx`): pulse/drone enable + volume, personal bias, plus all pre-existing audio/visual params, and a live section readout. Note: lowpass/wet/shimmer sliders are conductor-owned during a dream; the ethereal toggle takes effect at the next section boundary.

## Tests

Pure-logic seams are unit-tested (`client-3d/src/dream/__tests__/`): seeded RNG determinism, conductor section logic + theme guarantee, play-history recording. Audio/visual layers are verified by ear (`pnpm test` in client-3d).
