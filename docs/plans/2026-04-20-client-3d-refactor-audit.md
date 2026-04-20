# client-3d Refactor Audit — 2026-04-20

## Executive summary

1. **JukeboxRoom.tsx (1455 LOC) is the most bloated file** — 80% is inline GLSL/geometry JSX for diner furniture props that should be extracted into a `scene/props/` directory. The actual room logic (wall occlusion, stage exports) is ~250 LOC buried under 1200 LOC of 3D props.
2. **DreamAudioPlayer.ts (1113 LOC) is a monolithic audio engine** mixing Web Audio graph construction, BPM detection, beat/snare analysis, track loading, noise generation, and multi-layer playback scheduling. It should split into 4 focused modules (effects chain, beat detection, track loader, player controller).
3. **NetworkManager.ts (1042 LOC) is a god-class** — connection lifecycle, room joining, message dispatching, Colyseus schema syncing, and YouTube API calls all coexist. The `wireRoomListeners()` method alone is ~250 LOC. Splitting message handlers into per-domain files would cut it in half.
4. **NetworkManager imports from scene/** (PlayerEntity, TrampolineRipples) creating a circular-layer dependency — the network layer should not know about Three.js scene nodes. This is a medium-term architectural issue.
5. **PlayerEntity.tsx (898 LOC) bundles chat bubble rendering, jump physics, billboard rotation, and character rendering in one component.** The chat bubble system alone is ~300 LOC of Three.js mesh construction that belongs in its own module.

## File inventory

| File | LOC | Verdict |
|------|-----|---------|
| `scene/JukeboxRoom.tsx` | 1455 | **urgent** — inline props dominate |
| `audio/DreamAudioPlayer.ts` | 1113 | **urgent** — monolithic audio engine |
| `network/NetworkManager.ts` | 1042 | **urgent** — god-class, tangled concerns |
| `scene/Room.tsx` | 958 | **split** — inline props + wall occlusion |
| `scene/PlayerEntity.tsx` | 898 | **split** — chat bubbles + jump physics + rendering |
| `shaders/DreamMaterial.tsx` | 747 | OK — shader-heavy by nature |
| `shaders/PsxPostProcess.tsx` | 693 | OK — shader-heavy by nature |
| `ui/LobbyScreen.tsx` | 686 | **split** — character select + room select + room browser |
| `ui/DreamScene.tsx` | 587 | OK — video layer management is inherently complex |
| `network/nakamaClient.ts` | 587 | OK — auth + RPC wrapper for Nakama |
| `character/PaperDoll.tsx` | 542 | OK — sprite rendering is one concern |
| `ui/components/TurntableCarousel.tsx` | 521 | OK — single component |
| `ui/MyPlaylistsPanel.tsx` | 509 | **split** — panel is large for its role |
| `ui/DjQueuePanel.tsx` | 495 | **split** — panel is large for its role |
| `scene/JapaneseRoom.tsx` | 471 | **split** — same pattern as JukeboxRoom |
| `ui/ProfileEditPanel.tsx` | 367 | OK |
| `ui/AuthScreen.tsx` | 367 | OK |
| `audio/SamSinger.ts` | 358 | OK |
| `character/AcsAnimationEngine.ts` | 353 | OK |
| `ui/CustomRoomBrowser.tsx` | 318 | OK |
| `input/usePlayerInput.ts` | 304 | OK |
| `ui/ChatInput.tsx` | 299 | OK |
| `ui/MagazineReader.tsx` | 297 | OK |
| `stores/playlistStore.ts` | 292 | OK — persistence + server sync |
| `ui/DreamDebugPanel.tsx` | 273 | OK |
| `hooks/useAudioAnalyser.ts` | 269 | OK |
| `character/AcsCharacter.tsx` | 265 | OK |
| `ui/UserProfilePage.tsx` | 263 | OK |
| `App.tsx` | 257 | OK — router + main layout |
| `ui/CreateRoomForm.tsx` | 237 | OK |
| `ui/NowPlaying.tsx` | 235 | OK |
| `hooks/useVideoBackground.ts` | 225 | OK |
| `scene/InteractableObject.tsx` | 222 | OK |
| `character/DistortMaterial.ts` | 212 | OK |
| `services/messengerService.ts` | 210 | OK |
| `scene/MagazineRack.tsx` | 206 | OK |
| `scene/GameScene.tsx` | 202 | OK — thin orchestrator |
| `stores/gameStore.ts` | 179 | OK — well-structured |
| `audio/npcTtsPlayer.ts` | 178 | OK |
| `ui/CharacterSidePreview.tsx` | 177 | OK |
| `shaders/VortexGridSky.tsx` | 175 | OK |
| `character/AcsLoader.ts` | 173 | OK |
| `shaders/DreamGenerativeMaterial.tsx` | 172 | OK |
| `scene/Camera.tsx` | 169 | OK |
| `shaders/NightSky.tsx` | 167 | OK |
| `ui/FpsCounter.tsx` | 158 | OK |
| `stores/dreamDebugStore.ts` | 158 | OK |
| `shaders/TvStaticFloor.tsx` | 158 | OK |
| `shaders/OceanViewMaterial.tsx` | 158 | OK |
| `character/CharacterLoader.ts` | 154 | OK |
| `network/TimeSync.ts` | 153 | OK |
| All remaining files | <150 | OK |

**Thresholds:** urgent > 800 LOC, split candidate > 400 LOC, OK ≤ 400 LOC.

## Directory hygiene

| CLAUDE.md claim | Reality | Mismatch? |
|-----------------|---------|-----------|
| `src/scene/` — Three.js scene components (rooms, player entities, environment) | ✅ Correct. Contains Room.tsx, PlayerEntity.tsx, Camera.tsx, JukeboxRoom.tsx, JapaneseRoom.tsx, InteractableObject.tsx, GLBModel.tsx, MagazineRack.tsx, TrampolineRipples.ts | No |
| `src/network/` — Colyseus multiplayer layer | ⚠️ Also contains `nakamaClient.ts` (auth/social sidecar) which is NOT Colyseus — it's a separate auth system. `TimeSync.ts` is Colyseus-adjacent but fine. | Minor — nakamaClient is conceptually auth, not network |
| `src/stores/` — Zustand state stores | ✅ Correct. Lists `konpyuutaStore` in CLAUDE.md but it doesn't exist (removed during repo cleanup). | **Stale** — CLAUDE.md mentions `konpyuutaStore` which no longer exists |
| `src/ui/` — React UI panels and overlays | ✅ Correct. | No |
| `src/ui/konpyuuta/` — KonpyuuTA integration | ✅ Correct, only KonpyuuTAShell.tsx. | No |
| `src/ui/components/` — Shared UI components | ✅ Contains MutantLogo.tsx, TurntableCarousel.tsx, VersionTag.tsx. | No |
| `src/character/` — Avatar/NPC character rendering and animation | ✅ Correct. | No |
| `src/audio/` — Audio system | ✅ Correct. Also contains `effects/` subdirectory. | No |
| `src/shaders/` — Custom GLSL shaders | ✅ Correct. 13 shader files. | No |
| `src/dream/` — Dream mode bridge and state | ✅ Correct. Contains dreamStore.ts, types.ts, worlds/*.json. | No |
| `src/hooks/` — React hooks | ✅ Correct. 3 hooks: useAudioAnalyser, useSlideshowTexture, useVideoBackground. | No |
| `src/input/` — Input handling | ✅ Correct. Single file: usePlayerInput.ts. | No |
| `src/events/` — Event system | ❌ **Directory does not exist.** Empty claim in CLAUDE.md. | **Stale** — remove from CLAUDE.md |
| `src/services/` — Not mentioned in CLAUDE.md | ⚠️ Exists with messengerService.ts but not documented in the directory map. | **Missing** — add to CLAUDE.md |

**Action items:**
- Remove `src/events/` from CLAUDE.md directory map
- Remove `konpyuutaStore` from CLAUDE.md store list
- Add `src/services/` to CLAUDE.md directory map (external service adapters)

## Store audit

| Store | LOC | Responsibility | Dependencies | Issues |
|-------|-----|----------------|--------------|--------|
| `gameStore` | 179 | Connection state, player map, room type, local position | None (leaf store) | ✅ Well-bounded. Mutable position map outside React state is intentional perf optimization. |
| `uiStore` | 105 | All UI panel visibility flags, render settings, OS state | None (leaf store) | ⚠️ **Bag-of-state** — 20+ boolean toggles for unrelated panels (boothPrompt, magazineReader, sleepPrompt, osActive, djQueue, etc.). Should be split into `panelStore` (panel visibility) and `settingsStore` (render quality, nametags, PSX). |
| `dreamDebugStore` | 158 | ~30 debug parameters for dream mode shaders/audio | None (leaf store) | ✅ Single responsibility — debug tunables for one feature. |
| `playlistStore` | 292 | CRUD for user playlists, localStorage persistence, Nakama server sync | `authStore`, `nakamaClient` | ⚠️ **Side-effects in store** — directly calls `saveServerPlaylist()`, `deleteServerPlaylist()` via debounced timers. Server sync logic should be extracted to a service, store should be pure state. |
| `boothStore` | 89 | DJ booth connection, DJ queue, video background mode | None (leaf store) | ✅ Well-bounded. |
| `chatStore` | 100 | Chat messages, input value, chat bubbles with auto-clear timers | None (leaf store) | ✅ Well-bounded. |
| `musicStore` | 36 | Current music stream state (link, title, DJ, startTime) | None (leaf store) | ✅ Minimal and focused. |
| `jukeboxStore` | 40 | Shared room playlist + occupant tracking | None (leaf store) | ✅ Minimal and focused. |
| `authStore` | 125 | Auth tokens, login/guest/logout, JWT validation | None (leaf store) | ✅ Well-bounded. |
| `toastStore` | 30 | Transient toast notifications | None (leaf store) | ✅ Minimal. |
| `presenceStore` | 28 | Online user ID set | None (leaf store) | ✅ Minimal. |
| `dreamStore` | 30 | Dream mode active flag + collectibles | None (leaf store) | ✅ Minimal. |

**Flagged overlaps:**
- `boothStore.djQueue` vs `jukeboxStore.playlist` — Both manage playlist-like data for different music modes. Not a true overlap (DJ queue ≠ jukebox playlist), but both are consumed by `DjQueuePanel.tsx` which switches behavior based on `musicMode`. The panel is 495 LOC partly because it handles both modes.
- `musicStore.stream` is written by NetworkManager and read by UI — single source of truth, no overlap.
- `uiStore` mixing panel toggles with render settings is the main cohesion issue.

## Top refactor candidates (prioritized)

### 1. `scene/JukeboxRoom.tsx` — 1455 LOC

**Size:** 1455 LOC
**Current responsibilities:**
- Inline GLSL shaders for checkerboard floor and diner wall material (~80 LOC)
- 15+ 3D prop components as inline sub-components: CheckerFloor, DinerWallMaterial, DinerBooth, DinerTable, BarIsland, BackShelf, CounterStool, JukeboxMachine, HeavensNightSign, ArcadeMachine, VideoDisplay, WallRecord, Stage, MicStand, DinerPoster, CounterProps, NeonSign, JukeboxStatusBubble (~1000 LOC)
- Room geometry and wall occlusion logic (~200 LOC)
- Stage bounds constants exported for PlayerEntity (~10 LOC)
- Lighting setup (~40 LOC)

**Proposed split:**

| New file | Est. LOC | What moves | Public API |
|----------|----------|------------|------------|
| `scene/props/diner/` (new directory) | — | All diner-themed props extracted | — |
| `scene/props/diner/CheckerFloor.tsx` | ~30 | CheckerFloor + GLSL | `export function CheckerFloor` |
| `scene/props/diner/DinerWall.tsx` | ~60 | DinerWallMaterial + GLSL | `export function DinerWallMaterial` |
| `scene/props/diner/DinerFurniture.tsx` | ~120 | DinerBooth, DinerTable, CounterStool, CounterProps | Named exports |
| `scene/props/diner/BarIsland.tsx` | ~100 | BarIsland | `export function BarIsland` |
| `scene/props/diner/BackShelf.tsx` | ~80 | BackShelf | `export function BackShelf` |
| `scene/props/JukeboxMachine.tsx` | ~120 | JukeboxMachine cat-ears jukebox | `export function JukeboxMachine` |
| `scene/props/HeavensNightSign.tsx` | ~90 | HeavensNightSign + spark system | `export function HeavensNightSign` |
| `scene/props/ArcadeMachine.tsx` | ~70 | ArcadeMachine (fighter + racer) | `export function ArcadeMachine` |
| `scene/props/Stage.tsx` | ~80 | Stage, MicStand | `export function Stage` |
| `scene/props/NeonSign.tsx` | ~30 | NeonSign | `export function NeonSign` |
| `scene/props/WallDecor.tsx` | ~80 | WallRecord, DinerPoster, VideoDisplay | Named exports |
| `scene/JukeboxRoom.tsx` | ~250 | Room geometry, wall occlusion, lighting, prop composition | `export function JukeboxRoom` + stage constants |

**Blast radius:** Low. JukeboxRoom is only imported by GameScene.tsx. The stage constants (`JUKEBOX_STAGE_*`) are imported by PlayerEntity.tsx — those stay in JukeboxRoom.tsx.

**Priority:** High — largest file, purely mechanical extraction, zero risk, immediate agent-friendliness improvement.

---

### 2. `network/NetworkManager.ts` — 1042 LOC

**Size:** 1042 LOC
**Current responsibilities:**
- Connection lifecycle (constructor, session lock, reconnection) ~100 LOC
- Room joining (5 join/create methods) ~150 LOC
- `wireRoomListeners()` — monolithic message + schema handler wiring ~350 LOC
  - Player add/remove/listen
  - Chat message handling + history
  - Music stream sync + drift correction
  - DJ queue schema sync
  - Jukebox playlist schema sync
  - Jukebox occupant sync
  - Trampoline jump relay
  - Reconnection handlers
- Message sending helpers (chat, position, DJ booth, jukebox, dream) ~200 LOC
- YouTube API (search, resolve, proxy URLs) ~80 LOC
- Utility functions (timeout, player ID, duration parsing) ~50 LOC

**Proposed split:**

| New file | Est. LOC | What moves | Public API |
|----------|----------|------------|------------|
| `network/messages/playerHandlers.ts` | ~80 | Player add/remove/listen callbacks | `export function wirePlayerHandlers(room, stateProxy)` |
| `network/messages/chatHandlers.ts` | ~60 | Chat message + history handlers | `export function wireChatHandlers(room)` |
| `network/messages/musicHandlers.ts` | ~100 | Music stream, drift correction, late-join sync | `export function wireMusicHandlers(room, timeSync)` |
| `network/messages/djQueueHandlers.ts` | ~60 | DJ queue + jukebox playlist + occupant schema callbacks | `export function wireDJQueueHandlers(room, stateProxy)` |
| `network/messages/jukeboxHandlers.ts` | ~50 | Jukebox add/remove/play/stop/occupant messages | `export function wireJukeboxHandlers(room, stateProxy)` |
| `network/roomJoiner.ts` | ~150 | joinPublicRoom, joinMyRoom, createCustomRoom, joinCustomById, joinJukeboxRoom + setupRoom | `export class RoomJoiner` or functions |
| `network/NetworkManager.ts` | ~350 | Core: constructor, lobby, session lock, wireRoomListeners (now delegates to handlers), message senders | `export class NetworkManager`, `export function getNetwork()` |

**Blast radius:** Medium. NetworkManager is imported by 19 files — but the public API (`getNetwork()`, the NetworkManager class methods) doesn't change. Only internal organization changes.

**Priority:** High — the `wireRoomListeners()` method is the most tangled function in the codebase, mixing 6+ domains in one scope. Splitting it dramatically improves agent navigability.

---

### 3. `audio/DreamAudioPlayer.ts` — 1113 LOC

**Size:** 1113 LOC
**Current responsibilities:**
- Web Audio context + effects chain setup (lowpass, convolver, shimmer, formant, sidechain) ~200 LOC
- Impulse response generation (dark + bright IR) ~60 LOC
- Noise generation (brown noise, entry static, tuning bursts) ~80 LOC
- Beat detection (BPM onset detection, kick transients) ~120 LOC
- Snare detection (mid-high frequency onset) ~40 LOC
- Analysis loop (band data, pre-analyser, visual band smoothing) ~80 LOC
- Track loading (fetch audio, create layer, crossfade) ~200 LOC
- Layer cycling (schedule next track, beat-aligned crossfade) ~80 LOC
- Playback control (start, stop, cleanup) ~120 LOC
- Param sync (from dreamDebugStore) ~30 LOC
- Singleton export ~5 LOC

**Proposed split:**

| New file | Est. LOC | What moves | Public API |
|----------|----------|------------|------------|
| `audio/dreamAudio/effectsChain.ts` | ~150 | `ensureContext()`, IR generation, noise buffer generation | `export function createEffectsChain(ctx)` |
| `audio/dreamAudio/beatDetection.ts` | ~150 | BPM detection, kick/snare onset, beat phase tracking | `export class BeatDetector` |
| `audio/dreamAudio/trackLoader.ts` | ~100 | `loadAudioTrack()`, `seekToRandomPosition()` | `export function loadAudioTrack(videoId, signal)` |
| `audio/dreamAudio/audioAnalysis.ts` | ~100 | Analysis loop, band data, smoothing | `export function startAnalysisLoop(analyser)` |
| `audio/DreamAudioPlayer.ts` | ~400 | Player class: orchestration, layer management, start/stop/cleanup, param sync | `export class DreamAudioPlayer`, `export function getDreamAudioPlayer()` |

**Blast radius:** Low. DreamAudioPlayer is only imported by DreamScene.tsx and DreamDebugPanel.tsx. The singleton and public API stay the same.

**Priority:** Medium — the file is large but it's a self-contained audio engine with no external tangles. Still, 1100 LOC is hard for agents to load in context.

---

### 4. `scene/Room.tsx` — 958 LOC

**Size:** 958 LOC
**Current responsibilities:**
- Inline 3D props: Laptop, Sofa, PottedPlant, WaterStation, OldComputerDesk, VideoDisplay, Door, PictureFrame, BobbingGroup (~500 LOC)
- Room geometry + wall occlusion logic (~200 LOC)
- Scene composition: walls, furniture placement, lighting (~200 LOC)
- Exports: BOOTH_WORLD_Z, DJ_SLOT_OFFSETS_X, getDJSlotWorldX (~20 LOC)

**Proposed split:**

| New file | Est. LOC | What moves | Public API |
|----------|----------|------------|------------|
| `scene/props/RoomFurniture.tsx` | ~300 | Sofa, PottedPlant, WaterStation, OldComputerDesk, Door, PictureFrame, Laptop | Named exports |
| `scene/props/VideoDisplay.tsx` | ~50 | VideoDisplay | `export function VideoDisplay` |
| `scene/Room.tsx` | ~250 | Room geometry, wall occlusion, scene composition, BobbingGroup | `export function Room` + booth constants |

**Blast radius:** Low. Room.tsx is only imported by GameScene.tsx. The booth constants are imported by BoothPrompt.tsx and Room.tsx.

**Priority:** Medium — same pattern as JukeboxRoom, but less urgent since the props are simpler.

---

### 5. `scene/PlayerEntity.tsx` — 898 LOC

**Size:** 898 LOC
**Current responsibilities:**
- 3D chat bubble system: SingleBubble, ChatBubble container, bubble geometry helpers, texture cache, image loading (~350 LOC)
- Jump physics: gravity, double jump, squash/stretch, chain launch, landing ripple (~150 LOC)
- Billboard rotation with twist (~50 LOC)
- Character rendering orchestration: PaperDoll vs AcsCharacter selection (~50 LOC)
- Nametag component (~40 LOC)
- Animation state machine (idle/walk/dance transitions) (~50 LOC)
- PlayerEntity main component tying everything together (~150 LOC)

**Proposed split:**

| New file | Est. LOC | What moves | Public API |
|----------|----------|------------|------------|
| `scene/ChatBubble3D.tsx` | ~300 | SingleBubble, ChatBubble, bubble geometry helpers, texture cache, image loading, BUBBLE_DURATION | `export function ChatBubble3D` |
| `scene/Nametag.tsx` | ~50 | Nametag component | `export function Nametag` |
| `scene/usePlayerPhysics.ts` | ~150 | Jump physics, floor height, squash/stretch as a hook | `export function usePlayerPhysics(sessionId, isLocal)` |
| `scene/PlayerEntity.tsx` | ~300 | Billboard rotation, animation state, character selection, main component | `export function PlayerEntity`, `export function triggerRemoteJump` |

**Blast radius:** Medium. `triggerRemoteJump` is imported by NetworkManager.ts (this is the circular-layer dependency noted in the architecture section). `PlayerEntity` is only used in GameScene's `Players` component. Chat bubble and nametag are self-contained.

**Priority:** Medium-High — the chat bubble system is the most extractable chunk and would significantly improve the readability of PlayerEntity.

## Architectural observations

### 1. Network → Scene circular-layer dependency

`NetworkManager.ts` imports from `scene/PlayerEntity.tsx` (`triggerRemoteJump`) and `scene/TrampolineRipples.ts` (`addRipple`). This means the network layer knows about Three.js scene nodes. A better pattern would be:
- NetworkManager emits jump events to a simple event bus or store
- PlayerEntity subscribes to jump events in its useFrame loop
- TrampolineRipples subscribes similarly

This eliminates the `network/ → scene/` import and makes both layers independently testable.

### 2. Scene files duplicate wall-occlusion logic

Both `Room.tsx` and `JukeboxRoom.tsx` contain nearly identical wall-occlusion systems (~80 LOC each): raycaster from camera to player, per-wall opacity fading, attachment traversal. This should be extracted into a shared `scene/useWallOcclusion.ts` hook.

### 3. Room props should follow a consistent pattern

All three room files (Room, JukeboxRoom, JapaneseRoom) inline their 3D furniture props. A `scene/props/` directory with per-prop files would:
- Let agents load only the prop they're editing
- Make props reusable across rooms
- Keep room files focused on layout and composition

### 4. DreamDebugStore is a 30-field bag

The store has ~30 numeric/boolean tunables for dream mode shaders and audio. It's well-typed and works fine, but it's a single flat object that forces any consumer to load all 30 fields. Grouping into sub-objects (render, UV, color, VHS, glitch, audio) would improve selective subscriptions.

### 5. UI panels (DjQueuePanel, MyPlaylistsPanel) are large because they handle dual modes

`DjQueuePanel.tsx` (495 LOC) switches between DJ queue mode and jukebox mode. `MyPlaylistsPanel.tsx` (509 LOC) handles playlist CRUD + track search. Both could benefit from extracting inner components, but this is lower priority than the scene/network splits.

### 6. No circular imports detected

The import graph is a clean DAG with no cycles. The main dependency flow is:
```
ui/ → network/, stores/, scene/
scene/ → stores/, network/, character/
network/ → stores/, scene/ (the circular-layer issue above)
stores/ → stores/ (playlistStore → authStore only)
```

## Recommended sequencing

1. **Phase 3A: Extract room props** (JukeboxRoom → scene/props/*, Room → scene/props/*, JapaneseRoom → scene/props/*)
   - Independent, zero API changes, pure file moves
   - Unlocks: room files become 250 LOC, agents can edit props in isolation
   - Estimated effort: 1 session

2. **Phase 3B: Extract chat bubble system** (PlayerEntity → ChatBubble3D.tsx + Nametag.tsx)
   - Independent, pure extraction
   - Unlocks: PlayerEntity drops to ~400 LOC
   - Estimated effort: 1 session

3. **Phase 3C: Split NetworkManager message handlers** (NetworkManager → network/messages/*)
   - Independent but touches the most-coupled file
   - Unlocks: agents can navigate message handling by domain
   - Estimated effort: 1 session

4. **Phase 3D: Fix network → scene circular dependency** (event bus / store-based jump relay)
   - Depends on 3C for clean separation
   - Unlocks: proper layer boundaries, testability
   - Estimated effort: 1 session

5. **Phase 3E: Extract shared wall occlusion hook** (Room + JukeboxRoom → useWallOcclusion.ts)
   - Depends on 3A (rooms must be clean first)
   - Unlocks: single source of truth for occlusion logic
   - Estimated effort: 0.5 session

6. **Phase 3F: Split DreamAudioPlayer** (DreamAudioPlayer → dreamAudio/*)
   - Fully independent, can be done any time
   - Unlocks: audio engine is navigable
   - Estimated effort: 1 session

7. **Phase 3G: Clean up uiStore** (split into panelStore + settingsStore)
   - Independent, straightforward
   - Unlocks: cleaner subscription patterns
   - Estimated effort: 0.5 session

**Recommended order:** 3A → 3B → 3C → 3D → 3E → 3F → 3G

Rationale: 3A and 3B are the highest-impact, lowest-risk changes. 3C sets up 3D which fixes an architectural issue. 3E is a cleanup that follows from 3A. 3F and 3G are independent quality-of-life improvements.

## Out of scope (for future passes)

- **LobbyScreen.tsx** (686 LOC) — large but coherent (multi-step lobby flow). Could extract `CharacterSelectStep` and `RoomSelectStep` as separate components, but not urgent.
- **DjQueuePanel.tsx / MyPlaylistsPanel.tsx** — 495/509 LOC respectively. They're large UI panels but not tangled. Could extract inner components for readability.
- **DreamScene.tsx** (587 LOC) — video layer management is inherently complex. No clear extraction points without over-engineering.
- **nakamaClient.ts** (587 LOC) — auth + social RPC wrapper. Cohesive enough for its role.
- **DreamDebugStore sub-grouping** — cosmetic improvement, low impact.
- **playlistStore server sync extraction** — the debounced sync pattern works and is well-contained. Moving it to a service would be cleaner but adds indirection for little practical gain.
- **Testing strategy** — Phase 4 in the plan, separate from this refactor pass.
- **GLSL shader consolidation** — many shaders share vertex/fragment boilerplate. Could create shared shader chunks, but this is a shader-specific concern.
- **Public os13k/ directory** (games, dweets, system) — legacy code, not worth refactoring.
