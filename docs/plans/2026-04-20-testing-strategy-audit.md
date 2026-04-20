# Testing Strategy Audit — 2026-04-20

## Executive summary

Club Mutant has 8 passing smoke tests (5 schema, 3 enum) and zero automated coverage for its most critical path: **multiplayer room join → state sync → DJ queue rotation → player movement → chat delivery**. Phase 1's Colyseus bump (commit `537a6bf`) could only be validated by a manual browser smoke.

**Recommended investment order:**

1. **Colyseus integration tests** — highest leverage. `@colyseus/testing` provides a test harness that boots a real `Room` with real `Client` connections, asserts on schema state, and captures broadcasts. A single test file covering "join → move → chat → DJ rotation" would have caught every regression risk from Phase 1 and Phase 2. This is the first test to write.

2. **Pure-logic unit tests** — cheap, fast, zero infra. Add tests for `AnimationCodec` (encode/decode roundtrips, sanitization boundary cases) and the DJ queue rotation logic extracted into pure helpers. These don't catch Colyseus wiring bugs but are trivially easy to add.

3. **E2E (Playwright)** — skip for now. The server integration layer covers the risky wiring. E2E would only add value for rendering/UI regressions, which are low-severity for a prototype.

## Current coverage

### Existing test files

| File | Framework | What it covers | Lines |
|------|-----------|----------------|-------|
| `server/src/__tests__/schema.test.ts` | vitest | RoomState instantiation, Player add/remove/defaults, ChatMessage creation, MusicStream defaults | ~45 |
| `types/__tests__/messages.test.ts` | vitest | Message enum: expected keys exist, unique values, key↔value symmetry | ~25 |

### Test configuration

| Item | Status |
|------|--------|
| `vitest` dependency | Declared in root `package.json` (`^4.1.1`), not installed in worktree (hoisted via pnpm) |
| `vitest.config.*` | None — vitest auto-discovers by default |
| `server/package.json` scripts | `"test": "vitest run"` |
| `types/package.json` scripts | `"test": "vitest run"` |
| `client-3d/package.json` scripts | No test script |
| TypeScript decorator support | `experimentalDecorators: true` in `server/tsconfig.json` and `types/tsconfig.json` — required for Colyseus Schema |

### What the existing tests actually verify

The schema test instantiates `RoomState`, `Player`, `ChatMessage`, and `MusicStream` outside a Colyseus server context. It verifies that Schema decorators work and default values are correct. This caught the Phase 2 rename (import path changed from `OfficeState` → `RoomState`), but it would **not** catch:

- A broken `onJoin` handler (no clients connect)
- A broken message handler (no messages sent)
- A broken DJ queue rotation (no commands dispatched)
- Schema serialization over the wire (no encode/decode cycle)
- Speed-hack validation being too strict/loose (no movement messages)

## Recent regressions worth guarding against

### Commit `537a6bf` — Colyseus 0.17.39 → 0.17.42 bump

**What changed:** `@colyseus/core`, `@colyseus/schema`, `@colyseus/command`, SDK, transport all bumped within 0.17.x. Lockfile had 297 lines changed.

**What could have broken:**
| Risk | Would be caught by |
|------|-------------------|
| Schema serialization format change breaking client decode | Colyseus integration test (real encode/decode cycle) |
| `Dispatcher.dispatch()` behavioral change in `@colyseus/command` 0.2→0.3 | Colyseus integration test (command execution + state assertion) |
| `MapSchema.set()` / `ArraySchema.push()` behavioral change | Colyseus integration test (join→state assert) |
| Transport-level message framing change | Colyseus integration test (send message→receive broadcast) |
| Client SDK `getStateCallbacks()` change | Colyseus integration test (connect client→listen on state) |

**What was needed:** None of these broke, but the **only way to know** was manual browser testing. An integration test that joins a room, sends a move, and asserts state would have provided confidence in <2 seconds.

### Commit `d9fd5f2` — OfficeState→RoomState rename + schema consolidation

**What changed:** Moved schema from `server/src/rooms/schema/` to shared `types/RoomState.ts`. Renamed all classes. Deleted `IOfficeState.ts` interface mirror.

**What could have broken:**
| Risk | Would be caught by |
|------|-------------------|
| Import path broken in any command file | TypeScript compilation (caught) |
| `experimentalDecorators` not applied to new file location | Schema smoke test (caught) |
| Colyseus Schema metadata lost during file move (decorator execution order) | Colyseus integration test |
| Client `getStateCallbacks()` failing against renamed class | Colyseus integration test with real client |

### Commit `6937539` — Delete orphaned files

**What changed:** Removed `notificationStore.ts`, `NotificationBell.tsx`, `FriendsSidebar.tsx`, etc.

**Risk:** Low — these were unused dead code. No test gap here.

### Commit `4281f36` — Inline DreamScene

**What changed:** `DreamIframe.tsx` (1-line wrapper) inlined into `App.tsx`.

**Risk:** Low — cosmetic refactor.

## Layer analysis

### Layer 1: Pure-logic unit tests

**What it catches:** Bugs in deterministic pure functions — wrong encoding, bad validation, off-by-one errors.

**Infra cost:** Near zero. Vitest is already a dependency. No server, no network, no mocks beyond basic test setup.

**High-value targets:**

| Module | Why test | Difficulty |
|--------|----------|------------|
| `types/AnimationCodec.ts` | 257 lines of encode/decode/sanitize logic with bit-packing, texture-specific behavior, special cases. The `packDirectionalAnimId`/`unpackDirectionalAnimId` pair must roundtrip. `sanitizeTextureId` and `sanitizeAnimId` are security-critical (server validates client input with these). | Easy — pure functions, no deps |
| `server/src/rooms/commands/DJQueueCommand.ts` (rotation logic) | 399 lines with `advanceRotation`, `markTrackAsPlayed`, `removeDJFromQueue`. Complex state machine: queue reordering, current DJ promotion, auto-play logic. Has had bugs in rotation order. Currently untestable outside a Room context because it uses `this.state` — but the helper functions (`findNextDJWithTracks`, `hasUnplayedTracks`) are pure. | Medium — need to extract helpers or pass state |
| `server/src/rooms/commands/djHelpers.ts` | `playTrackForCurrentDJ` — sets musicStream state from player playlist. Pure state mutation. | Easy if extracted from Room context |
| `server/src/rooms/commands/JukeboxCommand.ts` | `playNextJukeboxTrack`, `stopJukeboxStream` — state mutation helpers. | Easy if extracted |
| `client-3d/src/stores/gameStore.ts` | `setLocalPosition` clamps to ±550. `addOrUpdateRoom` dedup logic. | Easy — Zustand stores can be tested by importing and calling actions |
| `client-3d/src/stores/chatStore.ts` | Bubble timer logic, message cap at 100, stack cap at 4. | Easy — but timer-based tests need `vi.useFakeTimers()` |
| `server/src/lib/verifyNakamaToken.ts` | JWT verification. Currently requires `NAKAMA_ENCRYPTION_KEY` env. Testable with known key + known token. | Easy |

**Leverage:** Medium. Catches logic bugs in codecs and validators. Does NOT catch Colyseus wiring bugs (the highest-risk category for this codebase).

**Verdict:** **Invest — cheap and fast, do alongside integration tests.**

### Layer 2: Colyseus integration tests (`@colyseus/testing`)

**What it catches:** Everything that matters for a multiplayer server — room lifecycle, message handling, command dispatch, state serialization, client connect/disconnect, broadcast correctness, reconnection, auth flow.

**How `@colyseus/testing` works:**

```typescript
import { boot } from '@colyseus/testing'
import { defineServer } from 'colyseus'

// boot() takes the same config as your real server (or a Server instance)
// Returns a ColyseusTestServer with:
//   .createRoom(roomName, options) → creates room server-side, returns Room instance
//   .connectTo(room, clientOptions) → connects a real SDK Client, returns SDK Room
//   .cleanup() → disconnect all clients, clear rooms
//   .shutdown() → gracefully shut down

// Room extensions (monkey-patched by @colyseus/testing):
//   room.waitForMessage(type, timeout?) → Promise<[Client, message]>
//   room.waitForNextPatch(delay?) → Promise<void>
//   room.waitForNextSimulationTick() → Promise<void>

// Client SDK Room extensions:
//   clientRoom.waitForMessage(type, timeout?) → Promise<message>
//   clientRoom.waitForNextPatch(delay?) → Promise<void>
```

**Infra cost:**

- Add `@colyseus/testing` and `vitest` to `server/package.json` devDependencies
- Need a test entry point that constructs the server config (or reuses `server/src/index.ts` logic)
- The server currently constructs itself via `defineServer()` + `server.listen()` in `index.ts`. For testing, we'd extract the room definitions into a testable config or pass a `Server` instance directly to `boot()`
- Must set `NAKAMA_ENCRYPTION_KEY` env var (or mock `verifyNakamaToken`)
- Tests run in ~50-200ms each (in-memory, no real network)

**Sketch of the recommended first test:**

```typescript
// server/src/__tests__/room.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { boot, ColyseusTestServer } from '@colyseus/testing'
import { Server } from '@colyseus/core'
import { ClubMutant } from '../rooms/ClubMutant'
import { Message } from '@club-mutant/types/Messages'
import { RoomType } from '@club-mutant/types/Rooms'

describe('ClubMutant room integration', () => {
  let server: ColyseusTestServer

  beforeAll(async () => {
    // Option A: boot from Server instance
    const gameServer = new Server()
    gameServer.define(RoomType.CUSTOM, ClubMutant)
    server = await boot(gameServer)
  })

  afterAll(async () => {
    await server.shutdown()
  })

  beforeEach(async () => {
    await server.cleanup()
  })

  it('player joins, state syncs, player leaves', async () => {
    // Create room server-side
    const room = await server.createRoom(RoomType.CUSTOM, {
      name: 'Test Room',
      musicMode: 'djqueue',
    })

    // Connect a real SDK client
    const client = await server.connectTo(room, {
      name: 'Alice',
      playerId: 'test-1',
      textureId: 0,
      spawnX: 100,
      spawnY: 200,
    })

    // Wait for state to sync to client
    await client.waitForNextPatch()

    // Assert: player exists in server state
    expect(room.state.players.size).toBe(1)
    const serverPlayer = room.state.players.get(client.sessionId)
    expect(serverPlayer).toBeDefined()
    expect(serverPlayer.name).toBe('Alice')

    // Assert: player exists in client state
    const clientPlayer = client.state.players.get(client.sessionId)
    expect(clientPlayer).toBeDefined()
    expect(clientPlayer.name).toBe('Alice')
    expect(clientPlayer.connected).toBe(true)

    // Leave
    await client.leave()
    await room.waitForNextPatch()

    expect(room.state.players.size).toBe(0)
  })

  it('player movement updates state', async () => {
    const room = await server.createRoom(RoomType.CUSTOM, { musicMode: 'djqueue' })
    const client = await server.connectTo(room, {
      name: 'Bob', playerId: 'test-2', textureId: 0, spawnX: 0, spawnY: 0,
    })

    await client.waitForNextPatch()

    // Send movement
    client.send(Message.UPDATE_PLAYER_ACTION, { x: 100, y: 200, textureId: 0 })
    await room.waitForNextPatch()
    await client.waitForNextPatch()

    const player = client.state.players.get(client.sessionId)
    expect(player.x).toBe(100)
    expect(player.y).toBe(200)
  })

  it('chat message broadcasts to other clients', async () => {
    const room = await server.createRoom(RoomType.CUSTOM, { musicMode: 'djqueue' })
    const alice = await server.connectTo(room, {
      name: 'Alice', playerId: 't1', textureId: 0, spawnX: 0, spawnY: 0,
    })
    const bob = await server.connectTo(room, {
      name: 'Bob', playerId: 't2', textureId: 0, spawnX: 0, spawnY: 0,
    })

    await alice.waitForNextPatch()
    await bob.waitForNextPatch()

    // Alice sends chat
    alice.send(Message.ADD_CHAT_MESSAGE, { content: 'hello!' })

    // Bob should receive the broadcast
    const msg = await bob.waitForMessage(Message.ADD_CHAT_MESSAGE, 3000)
    expect(msg.content).toBe('hello!')

    // Server state should have the message in chatMessages
    expect(room.state.chatMessages.length).toBeGreaterThanOrEqual(1)
  })

  it('DJ queue join → play → track complete → rotation', async () => {
    const room = await server.createRoom(RoomType.CUSTOM, { musicMode: 'djqueue' })
    const dj1 = await server.connectTo(room, {
      name: 'DJ1', playerId: 'dj1', textureId: 0, spawnX: 0, spawnY: 0,
    })
    const dj2 = await server.connectTo(room, {
      name: 'DJ2', playerId: 'dj2', textureId: 0, spawnX: 0, spawnY: 0,
    })

    await dj1.waitForNextPatch()
    await dj2.waitForNextPatch()

    // Both DJs join queue
    dj1.send(Message.DJ_QUEUE_JOIN, { slotIndex: 0 })
    dj2.send(Message.DJ_QUEUE_JOIN, { slotIndex: 1 })
    await room.waitForNextPatch()

    expect(room.state.djQueue.length).toBe(2)
    expect(room.state.currentDjSessionId).toBe(dj1.sessionId)

    // DJ1 adds a track to their playlist
    dj1.send(Message.ROOM_QUEUE_PLAYLIST_ADD, {
      title: 'Test Track',
      link: 'dQw4w9WgXcQ',
      duration: 213,
    })
    await room.waitForNextMessage()

    // DJ1 starts playback
    dj1.send(Message.DJ_PLAY)
    await room.waitForNextPatch()

    expect(room.state.musicStream.status).toBe('playing')
    expect(room.state.musicStream.currentTitle).toBe('Test Track')

    // DJ1 track completes → rotation
    dj1.send(Message.DJ_TURN_COMPLETE)
    await room.waitForNextPatch()

    // DJ2 should now be current DJ (rotation advanced)
    expect(room.state.currentDjSessionId).toBe(dj2.sessionId)
  })
})
```

**Key implementation notes:**

1. **Server construction.** The current `server/src/index.ts` calls `defineServer()` with uWebSockets transport. For testing, we can either:
   - Construct a `Server` directly (simpler — `@colyseus/testing`'s `boot()` accepts a `Server` instance)
   - Or extract the room definitions into a shared module and call `boot()` with a config object

2. **Auth bypass.** The room's `onAuth` calls `verifyNakamaToken`. For tests:
   - Either don't send `nakamaToken` (guest path — `onAuth` returns `true`)
   - Or set `NAKAMA_ENCRYPTION_KEY` env and generate a valid test JWT
   - Guest path is simpler and sufficient for most tests

3. **Speed-hack validation.** The `UPDATE_PLAYER_ACTION` handler rejects movement exceeding 240px/s. Tests must account for this — either send small deltas or advance fake timers between moves.

4. **NPC behavior.** Tests against jukebox rooms will trigger NPC spawn + heartbeat. May want to mock the NPC service URL or accept the noise.

5. **Music stream tick.** The room starts a 5-second interval for `MUSIC_STREAM_TICK`. Tests should either clean up quickly or account for this timer.

**Leverage:** **Very high.** A single integration test file with 4-5 scenarios would catch:
- Schema encode/decode regressions (Colyseus bump risk)
- Command dispatch regressions (`@colyseus/command` version change)
- Room lifecycle bugs (join, leave, reconnect)
- Message routing bugs (broadcast to correct clients)
- State mutation bugs (DJ queue rotation, playlist management)
- Auth flow regressions

**Verdict:** **Invest heavily — this is the single highest-leverage testing layer.**

### Layer 3: E2E tests (Playwright)

**What it catches:** Full-stack regressions from browser → Colyseus → Nakama → Go services. UI rendering bugs. Auth flow end-to-end. Visual regressions.

**Smoke scenario (if we were to build it):**
1. Start Docker Compose (Nakama + Postgres)
2. Start Colyseus server
3. Start client-3d dev server
4. Open browser → AuthScreen → guest login
5. Join public room → see GameScene → see 3D world
6. Move player → see position update
7. Send chat → see message in panel
8. Open DJ panel → join queue → add track → play

**Infra cost:**

| Cost | Detail |
|------|--------|
| CI runner | Needs Docker, Node.js, a display server (or headless) |
| Boot time | Docker Compose (Nakama + Postgres): ~10-15s. Server: ~3s. Client: ~3s. Total: ~20s per test run |
| Test flakiness | WebSocket timing, 3D rendering, network latency — all sources of flakiness |
| Maintenance | UI selectors break on any layout change. 3D scene state is hard to assert |
| Nakama setup | Need to pre-create a test user or use guest auth. Guest path is simpler |
| Go services | YouTube service and NPC service would need to be running or mocked |

**Leverage for this codebase:**
- The critical paths (join, move, chat, DJ queue) are **server logic**, not UI logic. Colyseus integration tests cover them more reliably and faster.
- UI rendering (R3F components, shaders, 3D scene) is inherently hard to assert in E2E. Pixel-level assertions are fragile. DOM-level assertions miss canvas content.
- Auth flow (Nakama JWT → Colyseus onAuth) is a narrow path that's well-covered by mocking `verifyNakamaToken` in integration tests.

**Verdict:** **Skip for now.** Revisit when UI stability matters (post-prototype). Colyseus integration tests provide 90% of the value at 10% of the cost.

## Recommended first step

### Write: `server/src/__tests__/room.integration.test.ts`

**What it tests:**
1. Player join → state sync → player leave (room lifecycle)
2. Player movement → position update in state (movement + speed validation)
3. Chat → broadcast to other clients (message routing)
4. DJ queue join → play → track complete → rotation (the most complex state machine)

**Packages to add:**
```
server/package.json devDependencies:
  @colyseus/testing: ^0.17.11
```

Note: `vitest` is already available via the root workspace dependency. No additional vitest config needed — the existing `server/tsconfig.json` already has `experimentalDecorators: true`.

**Config changes needed:**
- None to `tsconfig.json`
- `vitest.config.ts` is optional — vitest auto-discovers `__tests__/` by default
- If `@colyseus/testing` needs `experimentalDecorators` applied to its own source (unlikely since it's compiled JS), no tsconfig change needed

**Setup complexity:**
- Extract room definition into a testable factory, OR construct `Server` directly in the test file
- Mock/stub external services: `verifyNakamaToken` (use guest path), `youtubeService.prefetchVideo` (no-op), NPC service (not relevant for djqueue rooms)
- Total setup: ~30-60 minutes for the first test, then each additional test is 10-15 minutes

**Parallel unit tests to add (same session):**

```typescript
// types/__tests__/animation-codec.test.ts
describe('AnimationCodec', () => {
  it('packDirectionalAnimId → unpackDirectionalAnimId roundtrips', ...)
  it('encodeAnimKey → decodeAnimKey roundtrips for all textures and directions', ...)
  it('sanitizeTextureId clamps to valid range', ...)
  it('sanitizeAnimId rejects out-of-range values', ...)
  it('collapseDirForTexture collapses 8-way to 4-way for non-mutant textures', ...)
})
```

These can be written in parallel with the integration test setup.

## Out of scope

| Layer | Why not now |
|-------|-------------|
| **E2E (Playwright)** | High infra cost, high flakiness, low marginal value over Colyseus integration tests. UI is still changing rapidly. |
| **Client unit tests for R3F components** | React Three Fiber components require a WebGL context. Testing these requires `@react-three/test-renderer` or similar — significant setup for low ROI on a prototype. |
| **Snapshot/visual regression tests** | No stable UI to snapshot yet. The 3D scene is procedurally generated. |
| **Load/stress tests** | Already have `loadtest/` with `@colyseus/loadtest`. Not a testing layer — it's a performance tool. |
| **Contract tests between server and Go services** | The Go services (YouTube, NPC) are thin wrappers. The HTTP interfaces are simple. Not worth the infra for a prototype. |
| **Nakama module tests** | Nakama modules are ES5 JavaScript running in a Go VM. Testing them requires the Nakama runtime. Out of scope for this audit — they're auth-only and rarely change. |
| **KonpyuuTA tests** | In-world OS apps are UI-only. The bridge SDK (`postMessage`) could be tested but is low priority. |
