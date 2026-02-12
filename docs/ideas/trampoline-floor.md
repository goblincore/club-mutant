# Trampoline Floor — Planning Doc

## Implementation Status (Feb 2026)

**Core feature complete — in testing.**

### What was built

| Step                                          | Status     | Files                                                                                            |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| Ripple state manager                          | ✅ Done    | `client-3d/src/scene/TrampolineRipples.ts`                                                       |
| Subdivided floor + ripple vertex displacement | ✅ Done    | `client-3d/src/shaders/TvStaticFloor.tsx`, `client-3d/src/scene/Room.tsx`                        |
| Custom deforming grid (replaced drei Grid)    | ✅ Done    | `client-3d/src/shaders/TrampolineGrid.tsx`                                                       |
| Spacebar jump input with cooldown             | ✅ Done    | `client-3d/src/input/usePlayerInput.ts`                                                          |
| Jump physics + ripple + character animation   | ✅ Done    | `client-3d/src/scene/PlayerEntity.tsx`                                                           |
| Standing players ride waves + chain reactions | ✅ Done    | `client-3d/src/scene/PlayerEntity.tsx`                                                           |
| Furniture bobbing                             | ✅ Done    | `client-3d/src/scene/Room.tsx` (`BobbingGroup` wrapper)                                          |
| Multiplayer sync (PLAYER_JUMP message)        | ✅ Done    | `types/Messages.ts`, `server/src/rooms/ClubMutant.ts`, `client-3d/src/network/NetworkManager.ts` |
| Polish (screen shake, particles, sound)       | ⏳ Pending | —                                                                                                |

### Design decisions made

- **Analytical ripple approach** (Approach A) — up to 16 simultaneous ripples via uniform arrays, no render targets
- **Slow moon-bounce jump** — GRAVITY=6.0, JUMP_VELOCITY=3.5 (~1.2s air time)
- **Lingering waterbed decay** — DECAY_TIME=1.2, LIFETIME=4.0s
- **Double jump allowed** — second jump at DOUBLE_JUMP_VELOCITY=2.8
- **Chain reaction launches** — floor displacement > 0.15 auto-launches standing players
- **Furniture bobs with tilt** — BobbingGroup samples slope for subtle rotation
- **Grid replaced** — drei Grid → custom TrampolineGrid shader with same ripple displacement
- **Jump state in refs** — no Zustand/React state for per-frame physics (avoids re-renders)
- **Multiplayer sync is cosmetic** — server broadcasts PLAYER_JUMP, no validation needed

### Actual constants (tuned)

```typescript
// Ripple system (TrampolineRipples.ts)
MAX_RIPPLES = 16
WAVE_SPEED = 2.5, WAVE_FREQ = 5.0
DECAY_TIME = 1.2, DIST_DECAY = 0.2, LIFETIME = 4.0

// Jump physics (PlayerEntity.tsx)
JUMP_VELOCITY = 3.5, DOUBLE_JUMP_VELOCITY = 2.8
GRAVITY = 6.0, JUMP_COOLDOWN = 0.3s
LANDING_RIPPLE_AMP = 0.25, TAKEOFF_RIPPLE_AMP = 0.08
CHAIN_LAUNCH_THRESHOLD = 0.15, CHAIN_LAUNCH_MULTIPLIER = 12.0
JUMP_SPIN_SPEED = 8.0 rad/s

// Floor (TvStaticFloor.tsx / Room.tsx)
FLOOR_SEGMENTS = 96 (96×96 = 9,216 vertices)
```

---

## Concept

Spacebar turns the floor into a bouncy trampoline. When a player jumps:

- Their character launches upward with a spring arc, twisting and rotating in the air
- The floor mesh deforms like a fluid — a ripple propagates outward from the impact point
- Landing creates a secondary ripple
- Multiple players jumping creates overlapping wave interference
- Furniture optionally bobs/shakes from the ripples

The vibe: the room's floor is secretly a giant membrane/waterbed. Think Smash Bros. trampoline item meets liquid drum-head physics.

---

## Current State (what we're working with)

### Floor mesh

- **File**: `client-3d/src/scene/Room.tsx` (line 771)
- Flat `<planeGeometry args={[12, 12]} />` — **no subdivisions** (1×1 segments)
- Rotated `-Math.PI/2` on X, positioned at `[0, -0.01, 0]`
- Material: `TvStaticFloorMaterial` (animated TV noise shader) or video texture
- Grid overlay: drei `<Grid>` at Y=0, purely visual

### Player positioning

- **File**: `client-3d/src/scene/PlayerEntity.tsx`
- Players always sit at Y=0 on the XZ plane
- `groupRef.current.position.y` is never modified — it's always the default 0
- Movement is purely horizontal (server coords → `x * 0.01, 0, -y * 0.01`)

### Input

- **File**: `client-3d/src/input/usePlayerInput.ts`
- WASD + click-to-move, spacebar is **unused**
- Input is blocked when typing in chat (`HTMLInputElement`/`HTMLTextAreaElement` guard)
- Input is blocked when connected to DJ booth

### Character distortion

- **File**: `client-3d/src/character/DistortMaterial.ts`
- Already has: lean, squash-stretch, twist, wobble, bounce — all driven by `uSpeed`, `uVelocityX`, `uBillboardTwist`
- Uses `onBeforeCompile` to patch MeshBasicMaterial vertex shader
- Bones are 8×8 subdivided planes

### Click-to-move raycast

- **File**: `client-3d/src/scene/GameScene.tsx` (ClickPlane)
- Invisible flat plane at Y=0.001 for raycasting
- Returns world XZ point → converted to server coords

### Furniture / room objects

- DJ booth, sofa, potted plants, water station, old computer desk, door, picture frames
- All positioned with base at Y=0
- Static geometry, no physics

### Multiplayer

- Colyseus server syncs `(x, y)` position + `animId` per player
- No jump state, no Y coordinate in the schema

---

## Implementation Plan

### Phase 1: Subdivided Floor + Displacement Shader

**Goal**: Replace the flat floor plane with a high-subdivision mesh whose vertices can be displaced vertically in a shader.

#### 1a. Subdivide the floor geometry

The current floor is a 1×1 segment plane. For visible ripples we need **64×64 to 128×128 segments** (4K–16K vertices). This is well within budget for a single plane.

```
Room.tsx — change:
  <planeGeometry args={[ROOM_SIZE, ROOM_SIZE]} />
to:
  <planeGeometry args={[ROOM_SIZE, ROOM_SIZE, 128, 128]} />
```

#### 1b. Extend TvStaticFloorMaterial with vertex displacement

Add a `uniform sampler2D uHeightMap` (or uniform array of ripple sources) to the existing TV static vertex shader. Each vertex reads its displacement from the heightmap and offsets along the plane normal (Y in world space, but the plane is rotated so it's the local Z).

**Two approaches**:

| Approach                                                                                                                                                      | Pros                                                        | Cons                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| **A. Ripple uniforms** — pass up to N impact points as vec4 uniforms (xy=position, z=time, w=amplitude) and compute ripples analytically in the vertex shader | Simple, no render targets, no ping-pong                     | Limited to ~16 simultaneous ripples, no complex wave interaction |
| **B. Heightmap texture** — run a 2D wave equation simulation on a render target (ping-pong), sample it in the vertex shader                                   | Proper wave propagation, interference, reflection off walls | More complex, needs a separate simulation pass each frame        |

**Recommendation**: Start with **Approach A** (analytical ripples). It's simpler, meshes well with the PSX aesthetic (don't need pixel-perfect fluid sim), and handles the "multiple players jumping" case well enough. Can upgrade to Approach B later if we want wall reflections and more complex fluid behavior.

**Analytical ripple formula** (per vertex, per impact):

```glsl
float ripple(vec2 vertexXZ, vec2 impactXZ, float timeSinceImpact, float amplitude) {
  float dist = distance(vertexXZ, impactXZ);
  float waveSpeed = 4.0;
  float waveFreq = 8.0;
  float decay = exp(-timeSinceImpact * 2.0) * exp(-dist * 0.5);
  float phase = dist * waveFreq - timeSinceImpact * waveSpeed * waveFreq;
  return sin(phase) * amplitude * decay;
}
```

Sum all active ripples per vertex → offset the Y position.

#### 1c. Floor normals for shading (optional)

Displaced vertices will look flat without recalculated normals. For the PSX vibe, flat shading might actually look cool. But if we want the ripples to catch light:

- Compute normals analytically from the ripple derivative (cheap, exact)
- Or use `dFdx`/`dFdy` in the fragment shader for screen-space normals

### Phase 2: Jump Mechanic

**Goal**: Spacebar triggers a jump. The local player's Y position animates through a spring arc.

#### 2a. Jump state

New state in `gameStore.ts` or a dedicated `jumpStore.ts`:

```typescript
interface JumpState {
  isJumping: boolean
  jumpY: number // current Y offset (world units)
  jumpVelocity: number // current upward velocity
  jumpRotation: number // cumulative spin during air time
  jumpStartTime: number // for ripple timing
}
```

Or simpler: just track `jumpY` and `jumpVelocity` per player in a ref inside `PlayerEntity`.

#### 2b. Input binding

In `usePlayerInput.ts`:

- Listen for `spacebar` keydown
- If not already jumping and not in booth and not typing → trigger jump
- Set initial upward velocity (e.g., `jumpVelocity = 5.0`)
- Also need a cooldown to prevent spam (e.g., 300ms)

#### 2c. Physics tick

In `PlayerEntity.tsx` `useFrame`:

```
jumpVelocity -= GRAVITY * delta    // gravity pulls down
jumpY += jumpVelocity * delta      // integrate position
if (jumpY <= 0) {                  // landed
  jumpY = 0
  jumpVelocity = 0
  isJumping = false
  → emit landing ripple
}
groupRef.current.position.y = jumpY
```

Constants to tune:

- `JUMP_VELOCITY = 4.0` (initial upward speed, world units/sec)
- `GRAVITY = 12.0` (world units/sec²)
- This gives ~0.67s air time and ~0.67 world unit peak height

#### 2d. Character animation during jump

Leverage the existing `DistortMaterial` system:

- **Takeoff**: Squash (compress Y, expand X) for ~100ms before launch
- **Air**: Add a new `uJumpPhase` uniform (0 = ground, 0.5 = peak, 1 = landing)
  - Stretch vertically at launch (elongate)
  - Twist/spin: rotate the character group around Y axis (`jumpRotation += spinSpeed * delta`)
  - At peak: slight hang time (reduce gravity briefly)
- **Landing**: Hard squash for ~150ms, then spring back to normal scale

Could also add a full-body tumble (rotation around X or Z axis) for a more chaotic/fun feel.

### Phase 3: Ripple ↔ Player Integration

**Goal**: Connect jumps to floor ripples, and floor ripples back to player/object Y positions.

#### 3a. Emit ripples on jump events

When a player lands (jumpY crosses 0 from above):

- Add a ripple source: `{ position: [playerX, playerZ], time: now, amplitude: 0.3 }`
- Store in a shared ripple array (module-level or Zustand store)
- The floor shader reads this array each frame

Also emit a smaller ripple on **takeoff** (the membrane springs up as the player pushes off).

#### 3b. Floor pushes other players

When a ripple passes under a non-jumping player, their Y position should bob up/down with the wave. This creates the "everyone bounces when someone jumps" effect.

In each player's `useFrame`:

```
const floorHeight = computeRippleHeightAt(myWorldX, myWorldZ)
if (!isJumping) {
  groupRef.current.position.y = floorHeight
}
```

This means standing players passively ride the waves.

#### 3c. Furniture bobbing (optional, Phase 3+)

Same idea — each furniture group reads the ripple height at its base position and offsets Y. Maybe add a slight tilt (sample 2 points, compute slope → apply rotation).

### Phase 4: Multiplayer Sync

**Goal**: Other players see jumps and ripples.

#### 4a. Network message

Add a new message type:

```typescript
// types/Messages.ts
PLAYER_JUMP = 'player_jump'
```

**Payload**: `{ sessionId: string }` (that's all — position is already synced)

Server handler: broadcast to all other clients in the room. No server-side validation needed (it's cosmetic).

#### 4b. Client-side ripple from remote jumps

When receiving a `PLAYER_JUMP` message:

1. Look up the player's current position
2. Start a jump animation on their `PlayerEntity` (same physics, just triggered remotely)
3. Add a ripple source at their position

**Important**: Ripple simulation is fully client-side. Each client runs its own ripple math. Since it's deterministic from the same inputs (position + time), it stays visually consistent.

#### 4c. Alternative: animation-only sync (simpler)

Instead of a dedicated message, piggyback on the existing `animId` system:

- Add a `jump` animation ID to the codec
- When a player jumps, send `animId = jump`
- Other clients see the anim change and trigger the jump + ripple locally

This avoids any server changes but is less precise on timing.

### Phase 5: Polish & Tuning

#### 5a. Visual effects

- **Ripple color tint**: The TV static shader could shift color where the ripple is (brighter, or different hue)
- **Splash particles**: Emit a few particles on landing (pixel confetti, screen-space sparkles)
- **Shadow distortion**: The grid overlay could also deform with the floor (replace drei Grid with a custom grid shader that samples the same ripple data)
- **Screen shake**: Slight camera shake on landing (already have camera control in Camera.tsx)

#### 5b. Sound

- Boing/spring SFX on jump
- Membrane wobble ambient when ripples are active
- Thud on landing

#### 5c. Interaction with existing features

- **DJ booth**: Disable jumping when connected to booth (already gated by `isConnected`)
- **Click-to-move**: Keep the invisible raycast plane flat (Y=0) — the visual floor deforms but movement stays on a flat plane. This avoids weird pathfinding issues.
- **VHS post-processing**: Ripples will look great through the VHS shader — the bloom will catch the wave peaks
- **Chat bubbles**: Already positioned relative to character, so they'll follow the Y offset naturally (they're children of the player group)
- **Nametags**: Same — children of the player group, will follow

#### 5d. Performance

- 128×128 floor = 16K vertices — trivial for modern GPUs
- Analytical ripples (Approach A): ~16 sin() calls per vertex per frame = ~256K sin() ops = negligible
- No extra render targets or passes needed
- The floor is a single draw call

---

## Disruption Assessment

### What breaks or needs adjustment

| Component                   | Impact                                                                          | Effort     |
| --------------------------- | ------------------------------------------------------------------------------- | ---------- |
| **Floor geometry**          | Must add subdivisions (trivial change)                                          | Low        |
| **TvStaticFloor shader**    | Needs vertex displacement added to vertex shader                                | Medium     |
| **PlayerEntity Y position** | Currently hardcoded to 0, needs jump offset                                     | Medium     |
| **usePlayerInput**          | Add spacebar binding                                                            | Low        |
| **Grid overlay**            | drei `<Grid>` won't deform — either replace with custom or accept it stays flat | Low–Medium |
| **ClickPlane raycast**      | Keep flat (invisible plane stays at Y=0) — no change needed                     | None       |
| **Furniture**               | Optional bobbing — no change needed for MVP                                     | None/Low   |
| **Server schema**           | Need `PLAYER_JUMP` message (or reuse animId)                                    | Low        |
| **Camera**                  | Optional screen shake on landing                                                | Low        |

### What stays untouched

- DJ booth interaction logic
- Chat system (bubbles, panel)
- Music/playlist system
- Lobby/character select
- VHS post-processing pipeline
- Brick wall shader
- TrippySky skybox
- All UI overlays

---

## Suggested Build Order

1. **Subdivide floor + analytical ripple shader** — get a single hardcoded ripple animating on the floor to prove the visual
2. **Spacebar jump** — local player Y animation with gravity
3. **Connect jump → ripple** — landing creates a ripple at player position
4. **Other players ride waves** — non-jumping players bob with the floor
5. **Multiplayer sync** — broadcast jumps, remote players trigger ripples
6. **Character jump animation** — squash/stretch/spin during air time
7. **Polish** — particles, screen shake, sound, furniture bobbing, grid deformation

Phases 1–3 are a self-contained demo (single player bouncing on a rippling floor). Phase 4 makes it multiplayer. Phases 5+ are gravy.

---

## Open Questions

- **Jump height / air time**: How floaty should it feel? More Mario (snappy, 0.5s) or more moon-bounce (slow, 1.5s)?
- **Ripple damping**: Should ripples die quickly (drum-head) or linger (waterbed)?
- **Furniture interaction**: Should furniture bounce, or is it anchored? Bouncing furniture is more fun but more work.
- **Chain jumps**: Can you jump again while airborne (double jump)? Or only from the ground?
- **Ripple chain reaction**: If a ripple lifts a standing player high enough, do they get "launched" into a mini jump? (This would be amazing but chaotic.)
- **Grid overlay**: Replace drei Grid with a custom deforming grid, or just hide it during active ripples, or leave it flat?
- **Video texture floor**: When the floor shows a YouTube video background, should it still ripple? (Vertex displacement works with any material, so yes — the video would warp with the surface, which looks sick.)

---

## Technical Notes

### Ripple uniform approach (Approach A detail)

```glsl
// Max simultaneous ripples
#define MAX_RIPPLES 16

uniform vec4 uRipples[MAX_RIPPLES]; // xy = world position, z = birth time, w = amplitude
uniform int uRippleCount;
uniform float uTime;

float getDisplacement(vec2 worldXZ) {
  float totalDisp = 0.0;

  for (int i = 0; i < MAX_RIPPLES; i++) {
    if (i >= uRippleCount) break;

    vec2 center = uRipples[i].xy;
    float birthTime = uRipples[i].z;
    float amplitude = uRipples[i].w;

    float age = uTime - birthTime;
    if (age < 0.0 || age > 4.0) continue; // expired

    float dist = distance(worldXZ, center);
    float waveSpeed = 4.0;
    float waveFreq = 6.0;
    float decay = exp(-age * 1.5) * exp(-dist * 0.3);
    float phase = dist * waveFreq - age * waveSpeed * waveFreq;

    totalDisp += sin(phase) * amplitude * decay;
  }

  return totalDisp;
}
```

In the vertex shader:

```glsl
// After standard position transform, offset along local normal (which is Z for rotated plane)
vec2 worldXZ = (modelMatrix * vec4(position, 1.0)).xz;
float disp = getDisplacement(worldXZ);
// For a plane rotated -PI/2 on X, the "up" direction in local space is +Z
transformed.z += disp;
```

### Jump physics constants (starting point)

```typescript
const JUMP_VELOCITY = 4.5 // world units/sec (initial upward speed)
const GRAVITY = 14.0 // world units/sec² (slightly floaty)
const LANDING_RIPPLE_AMP = 0.25 // world units (ripple height on landing)
const TAKEOFF_RIPPLE_AMP = 0.1 // smaller ripple on takeoff
const RIPPLE_LIFETIME = 3.0 // seconds before a ripple fully decays
const JUMP_COOLDOWN = 0.3 // seconds between jumps
const SPIN_SPEED = 8.0 // radians/sec during air time
```

### File change map (estimated)

| File                                         | Change                                                       |
| -------------------------------------------- | ------------------------------------------------------------ |
| `client-3d/src/scene/Room.tsx`               | Subdivide floor, pass ripple uniforms to floor material      |
| `client-3d/src/shaders/TvStaticFloor.tsx`    | Add vertex displacement from ripple uniforms                 |
| `client-3d/src/scene/PlayerEntity.tsx`       | Jump Y animation, ride ripple waves, squash/stretch          |
| `client-3d/src/input/usePlayerInput.ts`      | Spacebar binding                                             |
| `client-3d/src/stores/gameStore.ts`          | Jump state per player (or use refs)                          |
| `client-3d/src/character/DistortMaterial.ts` | Add `uJumpPhase` uniform for jump squash/stretch             |
| `client-3d/src/scene/GameScene.tsx`          | Wire ripple state management                                 |
| `server/src/rooms/ClubMutant.ts`             | Handle + broadcast PLAYER_JUMP message (if not using animId) |
| `types/Messages.ts`                          | Add PLAYER_JUMP message type                                 |
| `client-3d/src/network/NetworkManager.ts`    | Send/receive jump events                                     |
