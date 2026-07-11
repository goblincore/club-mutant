# NPC DJ Presence & Behaviors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the server-side NPC automaton DJ visibly alive (walk to/from the booth, wander the dancefloor, chat reactions) and reachable (dev env docs + a room-creation toggle).

**Architecture:** All movement is server-driven mutation of the NPC `Player`'s `x/y` schema fields inside `NpcDjManager` (the client already renders, lerps, and animates any player in `state.players` — walking/dancing animations are derived client-side from velocity + music state; **zero client rendering changes**). Movement is a purely cosmetic layer: queue joins/leaves/playback stay instant, the body walks to catch up. Enablement adds a sanitized `npcDj` room-creation option surfaced by a selector in `CreateRoomForm`.

**Tech Stack:** TypeScript, Colyseus 0.17 (server), vitest (server tests), React (client-3d), pnpm workspaces.

**Design spec:** `docs/plans/2026-07-10-npc-dj-presence-design.md` (approved). Phase 1 background: `docs/plans/2026-07-05-npc-dj-design.md`.

---

## Critical context for the executing engineer

- **Repo root:** `/Users/donny/Projects/2026/club-mutant`. Work on the already-checked-out branch `npc-dj-presence`. Package manager is **pnpm**.
- **`NpcDjManager` (`server/src/rooms/NpcDjManager.ts`) is a headless Colyseus player with NO `Client`.** It must never flow through Command objects or anything that calls `client.send(...)`. It only uses the client-free helpers in `server/src/rooms/commands/djHelpers.ts`. Do not change this.
- **Do NOT touch Lily's NPC code** (the `npc*` fields/methods in `server/src/rooms/ClubMutant.ts` around lines 61–443). The DJ gets its own state machine inside `NpcDjManager`.
- **Do NOT add position jitter while the NPC stands at the booth.** The client plays the `dance` animation automatically when a player is stationary and music is playing; movement noise would flip it to `walk`.
- **Server tests:** `cd server && pnpm test` (vitest). Existing suites: `djRotation.test.ts`, `room.integration.test.ts`, `schema.test.ts` — all must stay green. Run a single file with `cd server && pnpm vitest run src/__tests__/<file>.ts`.
- The client clamps player positions to ±550 server px. All coordinates in this plan respect that.
- Commit after every task with the exact messages given. Do not push.

---

### Task 1: `joinDjQueue` optional teleport suppression

The NPC must walk to the booth instead of being teleported. `joinDjQueue()` currently hard-teleports the joining player to the slot coordinates.

**Files:**
- Modify: `server/src/rooms/commands/djHelpers.ts` (function `joinDjQueue`, currently at lines 389–457)
- Test: `server/src/__tests__/djRotation.test.ts` (append a new `describe` block)

- [ ] **Step 1: Write the failing tests**

Append to the end of `server/src/__tests__/djRotation.test.ts` (the file already imports `makeRoom`/`addPlayer` helpers at the top — reuse them; add `joinDjQueue` to the existing import from `../rooms/commands/djHelpers`):

```ts
describe('joinDjQueue — teleport parameter', () => {
  let room: ClubMutant

  beforeEach(() => {
    room = makeRoom()
  })

  it('teleports the joining player to the slot by default', () => {
    const player = addPlayer(room, 'A', 'Alice', ['track-a'])
    player.x = 50
    player.y = 50

    const ok = joinDjQueue(room, 'A', 'Alice', 0)

    expect(ok).toBe(true)
    expect(player.x).toBe(100) // DJ_SLOT_SERVER_X[0]
    expect(player.y).toBe(430) // BEHIND_BOOTH_SERVER_Y
  })

  it('leaves the player position untouched when teleport=false (NPC walks instead)', () => {
    const player = addPlayer(room, 'A', 'Alice', ['track-a'])
    player.x = 50
    player.y = 50

    const ok = joinDjQueue(room, 'A', 'Alice', 0, false)

    expect(ok).toBe(true)
    // Queue membership is instant…
    expect(room.state.djQueue.some((e) => e.sessionId === 'A')).toBe(true)
    // …but the body has not moved.
    expect(player.x).toBe(50)
    expect(player.y).toBe(50)
  })
})
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `cd /Users/donny/Projects/2026/club-mutant/server && pnpm vitest run src/__tests__/djRotation.test.ts`
Expected: the `teleport=false` test FAILS (position was mutated to 100/430); all pre-existing tests PASS. (The default-teleport test passes already — it pins current behavior.)

- [ ] **Step 3: Implement the parameter**

In `server/src/rooms/commands/djHelpers.ts`, change the `joinDjQueue` signature and the teleport block:

```ts
export function joinDjQueue(
  room: ClubMutant,
  sessionId: string,
  name: string,
  slotIndex?: number,
  teleport = true
): boolean {
```

and replace the teleport block (currently:

```ts
  // Teleport player behind the booth (must be server-authoritative so late-joining
  // clients see the correct position — client sendPosition can be rejected by speed check)
  player.x = DJ_SLOT_SERVER_X[slot] ?? 0
  player.y = BEHIND_BOOTH_SERVER_Y

  console.log(
    '[DJQueue] Joined:',
    sessionId,
    'Position:',
    entry.queuePosition,
    `teleported to (${player.x}, ${player.y})`
  )
```

) with:

```ts
  // Teleport player behind the booth (must be server-authoritative so late-joining
  // clients see the correct position — client sendPosition can be rejected by speed
  // check). The NPC DJ passes teleport=false and walks to the slot instead — its
  // movement is server-driven, so authority is preserved either way.
  if (teleport) {
    player.x = DJ_SLOT_SERVER_X[slot] ?? 0
    player.y = BEHIND_BOOTH_SERVER_Y
  }

  console.log(
    '[DJQueue] Joined:',
    sessionId,
    'Position:',
    entry.queuePosition,
    teleport ? `teleported to (${player.x}, ${player.y})` : 'walking to slot'
  )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/donny/Projects/2026/club-mutant/server && pnpm vitest run src/__tests__/djRotation.test.ts`
Expected: ALL tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/donny/Projects/2026/club-mutant
git add server/src/rooms/commands/djHelpers.ts server/src/__tests__/djRotation.test.ts
git commit -m "feat(server): optional teleport suppression in joinDjQueue for walking NPCs"
```

---

### Task 2: Movement state machine in `NpcDjManager`

Server-driven movement at a 200ms tick: walk to the booth slot on queue join, walk to the dancefloor on queue leave, wander/idle loop while on the floor, stand still while stationed at the booth.

**Files:**
- Modify: `server/src/rooms/NpcDjManager.ts`
- Create: `server/src/__tests__/npcDjMovement.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/__tests__/npcDjMovement.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RoomState, Player, DJQueueEntry } from '@club-mutant/types/RoomState'
import type { ClubMutant } from '../rooms/ClubMutant'
import { NpcDjManager, NPC_DJ_WANDER_BOUNDS } from '../rooms/NpcDjManager'
import { DJ_SLOT_SERVER_X, BEHIND_BOOTH_SERVER_Y } from '../rooms/commands/djHelpers'

// playTrackForCurrentDJ prefetches via the network — stub it out.
vi.mock('../youtubeService', () => ({
  prefetchVideo: vi.fn(),
}))

function makeRoom(): ClubMutant {
  const room = {
    roomId: 'testroom',
    state: new RoomState(),
    broadcast: vi.fn(),
    notifyNpcMusicStarted: vi.fn(),
    clearTrackWatchdog: vi.fn(),
    startWatchdogIfPlaying: vi.fn(),
    stopAmbientIfNeeded: vi.fn(),
  }
  return room as unknown as ClubMutant
}

function npcOf(room: ClubMutant, manager: NpcDjManager) {
  const npc = room.state.players.get(manager.sessionId)
  if (!npc) throw new Error('NPC player missing from state')
  return npc
}

// A queued human keeps the fallback watcher from re-joining the queue while
// we drive the NPC's floor behavior under fake timers.
function addHumanDj(room: ClubMutant, sessionId: string, slotIndex: number) {
  const player = new Player()
  player.name = sessionId
  room.state.players.set(sessionId, player)
  const entry = new DJQueueEntry()
  entry.sessionId = sessionId
  entry.name = sessionId
  entry.joinedAtMs = Date.now()
  entry.queuePosition = room.state.djQueue.length
  entry.slotIndex = slotIndex
  room.state.djQueue.push(entry)
}

const inWanderBounds = (x: number, y: number) =>
  x >= NPC_DJ_WANDER_BOUNDS.minX &&
  x <= NPC_DJ_WANDER_BOUNDS.maxX &&
  y >= NPC_DJ_WANDER_BOUNDS.minY &&
  y <= NPC_DJ_WANDER_BOUNDS.maxY

describe('NpcDjManager movement', () => {
  let room: ClubMutant
  let manager: NpcDjManager

  beforeEach(() => {
    vi.useFakeTimers()
    room = makeRoom()
  })

  afterEach(() => {
    manager?.dispose()
    vi.useRealTimers()
  })

  it('joins the queue instantly but walks to the booth slot instead of teleporting', () => {
    manager = new NpcDjManager(room, { mode: 'rotation' })
    expect(manager.spawn()).toBe(true)

    // Queue membership is instant (spawn ticks synchronously)…
    const entry = room.state.djQueue.find((e) => e.sessionId === manager.sessionId)
    expect(entry).toBeDefined()

    // …but the body is still at the spawn/standby point, not the slot.
    const npc = npcOf(room, manager)
    const slotX = DJ_SLOT_SERVER_X[entry!.slotIndex] ?? 0
    expect(npc.x).toBe(220)
    expect(npc.y).toBe(500)

    // Walk partway: after 1s it has moved toward the slot but not arrived.
    const startDist = Math.hypot(slotX - npc.x, BEHIND_BOOTH_SERVER_Y - npc.y)
    vi.advanceTimersByTime(1000)
    const midDist = Math.hypot(slotX - npc.x, BEHIND_BOOTH_SERVER_Y - npc.y)
    expect(midDist).toBeLessThan(startDist)
    expect(midDist).toBeGreaterThan(0)

    // After 10s total it has settled exactly on the slot.
    vi.advanceTimersByTime(9000)
    expect(npc.x).toBe(slotX)
    expect(npc.y).toBe(BEHIND_BOOTH_SERVER_Y)

    // Stationed: it does not drift afterwards (no jitter — the client's
    // auto-dance requires a stationary player).
    vi.advanceTimersByTime(5000)
    expect(npc.x).toBe(slotX)
    expect(npc.y).toBe(BEHIND_BOOTH_SERVER_Y)
  })

  it('leaveQueue removes it from the queue instantly and walks it into the wander bounds', () => {
    manager = new NpcDjManager(room, { mode: 'fallback' })
    expect(manager.spawn()).toBe(true)
    expect(room.state.djQueue.some((e) => e.sessionId === manager.sessionId)).toBe(true)

    // Let it reach the booth first.
    vi.advanceTimersByTime(10_000)

    // A queued human prevents the fallback watcher from re-joining while we
    // advance timers below.
    addHumanDj(room, 'human-1', 1)
    ;(manager as any).leaveQueue()

    // Queue exit is instant…
    expect(room.state.djQueue.some((e) => e.sessionId === manager.sessionId)).toBe(false)

    // …and the body is still at the booth, then walks to the floor.
    const npc = npcOf(room, manager)
    expect(npc.y).toBe(BEHIND_BOOTH_SERVER_Y)

    // Max walk: booth corner to far corner of bounds < 500px @ 60px/s < 9s.
    vi.advanceTimersByTime(9000)
    expect(inWanderBounds(npc.x, npc.y)).toBe(true)
  })

  it('wanders within bounds indefinitely once on the floor', () => {
    manager = new NpcDjManager(room, { mode: 'fallback' })
    expect(manager.spawn()).toBe(true)
    vi.advanceTimersByTime(10_000)
    addHumanDj(room, 'human-1', 1) // keep the fallback watcher from re-joining
    ;(manager as any).leaveQueue()
    vi.advanceTimersByTime(9000) // arrive on the floor

    const npc = npcOf(room, manager)
    const visited: Array<{ x: number; y: number }> = []
    // Bounds form a convex rectangle, so every point on a walk between two
    // in-bounds targets is also in bounds — safe to sample mid-walk.
    for (let i = 0; i < 24; i++) {
      vi.advanceTimersByTime(5000)
      visited.push({ x: npc.x, y: npc.y })
      expect(inWanderBounds(npc.x, npc.y)).toBe(true)
    }
    // It actually moves (idle windows are 3–8s, so 2 minutes must include walks).
    const distinct = new Set(visited.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`))
    expect(distinct.size).toBeGreaterThan(1)
  })

})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/donny/Projects/2026/club-mutant/server && pnpm vitest run src/__tests__/npcDjMovement.test.ts`
Expected: FAIL — `NPC_DJ_WANDER_BOUNDS` / `NPC_DJ_HANDOVER_TEMPLATES` are not exported (compile error). That is the correct failure for now.

- [ ] **Step 3: Implement the movement state machine**

In `server/src/rooms/NpcDjManager.ts`:

**(a)** Below the existing `NPC_DJ_STANDBY_X/Y` constants (lines ~40–41), add:

```ts
// ── Movement (cosmetic layer) ────────────────────────────────────────────────
// The NPC's body is server-driven: we mutate Player.x/y and the client lerps
// (REMOTE_LERP) and derives walk/dance/idle animation from visual velocity +
// music state. Movement NEVER gates queue or playback logic — state changes
// are instant and the body walks to catch up.
const NPC_DJ_MOVE_INTERVAL_MS = 200 // Lily parity (NPC_UPDATE_INTERVAL)
const NPC_DJ_SPEED = 60 // server px/s (Lily parity)
// Dancefloor rectangle in front of the booth (slots sit at y=430). Provisional —
// tuned during the runtime smoke test. Must stay within the client's ±550 clamp.
export const NPC_DJ_WANDER_BOUNDS = { minX: -250, maxX: 250, minY: 150, maxY: 380 }
const NPC_DJ_IDLE_MIN_MS = 3000
const NPC_DJ_IDLE_RANGE_MS = 5000 // idle window: 3–8s

// While walking the client shows 'walk'; while standing with music playing it
// shows 'dance' automatically. 'stationed' = parked at the booth slot (no
// jitter — jitter would flip the client's auto-dance into 'walk').
type NpcDjMoveState =
  | { kind: 'stationed' }
  | { kind: 'walking'; targetX: number; targetY: number; arrive: 'booth' | 'floor' }
  | { kind: 'hangingOut'; timerMs: number }
```

**(b)** Add fields to the class (next to `watchIntervalId`):

```ts
  private moveIntervalId: NodeJS.Timeout | null = null
  private moveState: NpcDjMoveState = { kind: 'hangingOut', timerMs: NPC_DJ_IDLE_MIN_MS }
```

**(c)** In `spawn()`, immediately BEFORE the existing `this.tick()` call, add:

```ts
    // Movement loop must exist before the first tick() — a successful
    // joinQueue() inside it sets the walk target to the claimed booth slot.
    this.moveIntervalId = setInterval(() => this.moveTick(), NPC_DJ_MOVE_INTERVAL_MS)
```

**(d)** In `dispose()`, next to the `watchIntervalId` cleanup, add:

```ts
    if (this.moveIntervalId !== null) {
      clearInterval(this.moveIntervalId)
      this.moveIntervalId = null
    }
```

**(e)** In `joinQueue()`, change the `joinDjQueue` call to pass `teleport=false` and start the walk. Replace:

```ts
    if (!joinDjQueue(this.room, this.sessionId, this.name, slot)) return false
```

with:

```ts
    if (!joinDjQueue(this.room, this.sessionId, this.name, slot, false)) return false

    // Body walks to the slot; queue membership above is already live.
    this.walkToBoothSlot()
```

**(f)** In `leaveQueue()`, replace the `this.moveToStandby()` call with:

```ts
    this.walkToFloor()
```

and DELETE the now-unused `moveToStandby()` method entirely (`NPC_DJ_STANDBY_X/Y` remain in use by `spawn()`).

**(g)** Add the movement methods (place after `findFreeSlot()`):

```ts
  // ── Movement (cosmetic layer — see NpcDjMoveState) ─────────────────────────

  private walkToBoothSlot() {
    const entry = this.room.state.djQueue.find((e) => e.sessionId === this.sessionId)
    if (!entry) return
    this.moveState = {
      kind: 'walking',
      targetX: DJ_SLOT_SERVER_X[entry.slotIndex] ?? 0,
      targetY: BEHIND_BOOTH_SERVER_Y,
      arrive: 'booth',
    }
  }

  private walkToFloor() {
    const { minX, maxX, minY, maxY } = NPC_DJ_WANDER_BOUNDS
    this.moveState = {
      kind: 'walking',
      targetX: minX + Math.random() * (maxX - minX),
      targetY: minY + Math.random() * (maxY - minY),
      arrive: 'floor',
    }
  }

  private randomIdleMs(): number {
    return NPC_DJ_IDLE_MIN_MS + Math.random() * NPC_DJ_IDLE_RANGE_MS
  }

  private moveTick() {
    if (this.disposed) return
    const npc = this.room.state.players.get(this.sessionId)
    if (!npc) return

    const state = this.moveState
    switch (state.kind) {
      case 'stationed':
        // Parked at the booth. Standing still is deliberate: the client plays
        // the dance animation for stationary players while music is playing.
        return

      case 'walking': {
        const dx = state.targetX - npc.x
        const dy = state.targetY - npc.y
        const dist = Math.hypot(dx, dy)
        const step = (NPC_DJ_SPEED * NPC_DJ_MOVE_INTERVAL_MS) / 1000
        if (dist <= step) {
          npc.x = state.targetX
          npc.y = state.targetY
          this.moveState =
            state.arrive === 'booth'
              ? { kind: 'stationed' }
              : { kind: 'hangingOut', timerMs: this.randomIdleMs() }
        } else {
          npc.x += (dx / dist) * step
          npc.y += (dy / dist) * step
        }
        return
      }

      case 'hangingOut': {
        state.timerMs -= NPC_DJ_MOVE_INTERVAL_MS
        if (state.timerMs <= 0) this.walkToFloor() // wander leg
        return
      }
    }
  }
```

`DJ_SLOT_SERVER_X` and `BEHIND_BOOTH_SERVER_Y` are already imported at the top of the file — extend that import if needed: `BEHIND_BOOTH_SERVER_Y` is NOT currently imported, add it to the existing `from './commands/djHelpers'` import list.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/donny/Projects/2026/club-mutant/server && pnpm vitest run src/__tests__/npcDjMovement.test.ts`
Expected: all three movement tests PASS.

Run the full suite to confirm nothing else broke: `cd /Users/donny/Projects/2026/club-mutant/server && pnpm test`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/donny/Projects/2026/club-mutant
git add server/src/rooms/NpcDjManager.ts server/src/__tests__/npcDjMovement.test.ts
git commit -m "feat(server): NPC DJ walks to booth, wanders dancefloor — server-driven movement state machine"
```

---

### Task 3: Chat reaction template pools

**Files:**
- Modify: `server/src/rooms/NpcDjManager.ts`
- Test: `server/src/__tests__/npcDjMovement.test.ts` (append)

- [ ] **Step 1: Write the failing test**

In `server/src/__tests__/npcDjMovement.test.ts`:

**(a)** Extend the `NpcDjManager` import to include the (not-yet-existing) template pool, and add the `Message` import:

```ts
import {
  NpcDjManager,
  NPC_DJ_WANDER_BOUNDS,
  NPC_DJ_HANDOVER_TEMPLATES,
} from '../rooms/NpcDjManager'
import { Message } from '@club-mutant/types/Messages'
```

**(b)** Append this test inside the existing `describe('NpcDjManager movement', ...)` block (it reuses `room`, `manager`, and the fake-timers `beforeEach`/`afterEach`):

```ts
  it('announces a handover line when leaving the queue', () => {
    manager = new NpcDjManager(room, { mode: 'fallback' })
    expect(manager.spawn()).toBe(true)
    vi.advanceTimersByTime(10_000)
    ;(room.broadcast as any).mockClear()

    ;(manager as any).leaveQueue()

    const chatCalls = (room.broadcast as any).mock.calls.filter(
      (c: any[]) => c[0] === Message.ADD_CHAT_MESSAGE
    )
    expect(chatCalls.length).toBe(1)
    expect(NPC_DJ_HANDOVER_TEMPLATES).toContain(chatCalls[0][1].content)
  })
```

Run: `cd /Users/donny/Projects/2026/club-mutant/server && pnpm vitest run src/__tests__/npcDjMovement.test.ts`
Expected: the whole file FAILS to run — `NPC_DJ_HANDOVER_TEMPLATES` is not exported yet. That is the expected failure.

- [ ] **Step 2: Implement the pools**

In `server/src/rooms/NpcDjManager.ts`:

**(a)** Replace the single-message constant:

```ts
const FALLBACK_JOIN_MESSAGE = "taking over while the booth's empty."
```

with two exported pools:

```ts
// Fired when the fallback NPC hands the booth to waiting humans.
export const NPC_DJ_HANDOVER_TEMPLATES = [
  "booth's yours 🎛️",
  'passing the decks — keep it moving',
  "warmed 'em up for you",
]

// Fired when the fallback NPC (re-)takes an empty booth.
export const NPC_DJ_FALLBACK_JOIN_TEMPLATES = [
  "taking over while the booth's empty.",
  'back to the decks 🎧',
  'no DJ? i got this.',
]
```

**(b)** Add a picker helper next to `announceTrack()`:

```ts
  private pickTemplate(pool: string[]): string {
    return pool[Math.floor(Math.random() * pool.length)]
  }
```

**(c)** In `joinQueue()`, replace:

```ts
    if (this.config.mode === 'fallback') {
      this.announce(FALLBACK_JOIN_MESSAGE)
    }
```

with:

```ts
    if (this.config.mode === 'fallback') {
      this.announce(this.pickTemplate(NPC_DJ_FALLBACK_JOIN_TEMPLATES))
    }
```

**(d)** In `leaveQueue()`, add the handover announcement as the FIRST line of the method (before `this.leaveAfterTrack = false`):

```ts
    // Only fallback mode ever leaves the queue (rotation leaves only via
    // dispose, which bypasses this method) — this is always a human handover.
    this.announce(this.pickTemplate(NPC_DJ_HANDOVER_TEMPLATES))
```

- [ ] **Step 3: Run tests to verify everything passes**

Run: `cd /Users/donny/Projects/2026/club-mutant/server && pnpm test`
Expected: ALL tests PASS (including the handover test and all pre-existing suites).

- [ ] **Step 4: Commit**

```bash
cd /Users/donny/Projects/2026/club-mutant
git add server/src/rooms/NpcDjManager.ts server/src/__tests__/npcDjMovement.test.ts
git commit -m "feat(server): NPC DJ handover/return chat reaction pools"
```

---

### Task 4: Sanitize client-supplied `npcDj` room-creation option

Custom-room creators opt in via `options.npcDj`, but options come from an untrusted client: accept ONLY `{ mode }`; the public lobby stays env-only.

**Files:**
- Modify: `server/src/rooms/NpcDjManager.ts` (new exported function next to `parseNpcDjLobbyEnv`)
- Modify: `server/src/rooms/ClubMutant.ts` (onCreate, lines ~833–844)
- Test: `server/src/__tests__/npcDjMovement.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `server/src/__tests__/npcDjMovement.test.ts` (add `sanitizeNpcDjOptions` to the import from `../rooms/NpcDjManager`):

```ts
describe('sanitizeNpcDjOptions — untrusted client input', () => {
  it('accepts valid modes and strips every other field', () => {
    expect(sanitizeNpcDjOptions({ mode: 'fallback' })).toEqual({ mode: 'fallback' })
    expect(
      sanitizeNpcDjOptions({
        mode: 'rotation',
        name: 'impersonator',
        playlistId: '../../etc/passwd',
        textureId: 99,
      })
    ).toEqual({ mode: 'rotation' })
  })

  it('rejects anything without a valid mode', () => {
    expect(sanitizeNpcDjOptions(undefined)).toBeNull()
    expect(sanitizeNpcDjOptions(null)).toBeNull()
    expect(sanitizeNpcDjOptions('rotation')).toBeNull()
    expect(sanitizeNpcDjOptions({})).toBeNull()
    expect(sanitizeNpcDjOptions({ mode: 'evil' })).toBeNull()
    expect(sanitizeNpcDjOptions({ mode: 42 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/donny/Projects/2026/club-mutant/server && pnpm vitest run src/__tests__/npcDjMovement.test.ts`
Expected: FAIL — `sanitizeNpcDjOptions` is not exported.

- [ ] **Step 3: Implement**

**(a)** In `server/src/rooms/NpcDjManager.ts`, directly below `parseNpcDjLobbyEnv`, add:

```ts
/**
 * Sanitize a client-supplied room-creation npcDj option. Only the mode is
 * accepted — playlist/name/texture stay server-controlled (random defaults)
 * so room creators can't impersonate players or reference arbitrary
 * playlists. Returns null when the shape is invalid (no NPC spawns).
 */
export function sanitizeNpcDjOptions(raw: unknown): INpcDjConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const mode = (raw as { mode?: unknown }).mode
  if (mode !== 'fallback' && mode !== 'rotation') return null
  return { mode }
}
```

**(b)** In `server/src/rooms/ClubMutant.ts`, replace (lines ~836–837):

```ts
      const npcDjConfig =
        options.npcDj ?? (this.isPublic ? parseNpcDjLobbyEnv(process.env.NPC_DJ_LOBBY) : null)
```

with:

```ts
      // Public lobby: env-only (clients can't inject an NPC via joinOrCreate
      // options). Custom rooms: creator's choice, sanitized to { mode } only.
      const npcDjConfig = this.isPublic
        ? parseNpcDjLobbyEnv(process.env.NPC_DJ_LOBBY)
        : sanitizeNpcDjOptions(options.npcDj)
```

and add `sanitizeNpcDjOptions` to the existing `NpcDjManager` import in that file.

- [ ] **Step 4: Run the full server suite**

Run: `cd /Users/donny/Projects/2026/club-mutant/server && pnpm test`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/donny/Projects/2026/club-mutant
git add server/src/rooms/NpcDjManager.ts server/src/rooms/ClubMutant.ts server/src/__tests__/npcDjMovement.test.ts
git commit -m "feat(server): sanitize client-supplied npcDj creation option; lobby stays env-only"
```

---

### Task 5: Client — `npcDj` through `createCustomRoom` + CreateRoomForm selector

**Files:**
- Modify: `client-3d/src/network/NetworkManager.ts` (`createCustomRoom`, lines ~329–364)
- Modify: `client-3d/src/ui/CreateRoomForm.tsx`

No unit-test infra exists for client-3d — verification is the TypeScript build plus the manual smoke test at the end.

- [ ] **Step 1: Pass `npcDj` through `createCustomRoom`**

In `client-3d/src/network/NetworkManager.ts`, change the `createCustomRoom` signature's `roomData` type:

```ts
  async createCustomRoom(
    roomData: {
      name: string
      description: string
      password: string | null
      musicMode?: string
      npcDj?: { mode: 'fallback' | 'rotation' }
    },
    playerName: string,
    textureId: number
  ): Promise<void> {
```

and add `npcDj: roomData.npcDj,` to the options object passed to `this.client.create<RoomState>(RoomType.CUSTOM, { ... })` (place it after `musicMode,`). `undefined` is dropped in serialization, so omitting the toggle sends nothing.

- [ ] **Step 2: Add the selector to CreateRoomForm**

In `client-3d/src/ui/CreateRoomForm.tsx`:

**(a)** Below the `MusicModeOption` type, add:

```ts
type NpcDjOption = 'off' | 'fallback' | 'rotation'

const NPC_DJ_CHOICES: Array<{ value: NpcDjOption; label: string; hint: string }> = [
  { value: 'off', label: 'off', hint: 'humans only' },
  { value: 'fallback', label: 'fill-in', hint: 'plays when booth is empty' },
  { value: 'rotation', label: 'resident', hint: 'always in the queue' },
]
```

**(b)** Add state next to `musicModeOption`:

```ts
  const [npcDjOption, setNpcDjOption] = useState<NpcDjOption>('off')
```

**(c)** In `handleCreate`, extend the `createCustomRoom` first argument:

```ts
        {
          name: roomName.trim(),
          description: description.trim(),
          password: password.trim() || null,
          musicMode: musicModeOption,
          npcDj:
            musicModeOption === 'djqueue' && npcDjOption !== 'off'
              ? { mode: npcDjOption }
              : undefined,
        },
```

**(d)** Directly below the existing "Music mode" `<div>` block (after its closing `</div>`), add a new block that renders only for DJ-queue rooms, styled to match the music-mode buttons:

```tsx
        {/* NPC DJ (djqueue rooms only) */}
        {musicModeOption === 'djqueue' && (
          <div>
            <label className="block text-white/50 text-xs mb-1.5">dj bot</label>
            <div className="flex gap-2">
              {NPC_DJ_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => setNpcDjOption(choice.value)}
                  disabled={creating}
                  className={`flex-1 py-2 rounded-lg text-sm font-mono transition-all border ${
                    npcDjOption === choice.value
                      ? 'bg-purple-500/20 border-purple-400 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                      : 'bg-black/30 border-white/15 text-white/50 hover:text-white/70 hover:border-white/25'
                  }`}
                >
                  <div className="text-[13px]">{choice.label}</div>
                  <div className="text-[10px] text-white/40 mt-0.5">{choice.hint}</div>
                </button>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 3: Verify the client typechecks and builds**

Run: `cd /Users/donny/Projects/2026/club-mutant/client-3d && pnpm build`
Expected: build succeeds with no TypeScript errors. (If `packages/konpyuuta` needs building first, run `pnpm --filter @club-mutant/konpyuuta build` from the repo root.)

- [ ] **Step 4: Commit**

```bash
cd /Users/donny/Projects/2026/club-mutant
git add client-3d/src/network/NetworkManager.ts client-3d/src/ui/CreateRoomForm.tsx
git commit -m "feat(client-3d): NPC DJ toggle in create-room form (off / fill-in / resident)"
```

---

### Task 6: Document `NPC_DJ_LOBBY`

**Files:**
- Modify: `CLAUDE.md` (repo root, "Dev Setup" section)
- Modify: `server/CLAUDE.md` ("Environment Variables" section)

- [ ] **Step 1: Root `CLAUDE.md`** — in the Dev Setup code block, add one line after the `export NAKAMA_ENCRYPTION_KEY=...` line:

```bash
export NPC_DJ_LOBBY=fallback:default   # optional: spawn the NPC DJ in the public lobby
```

- [ ] **Step 2: `server/CLAUDE.md`** — append to the "Environment Variables" list:

```markdown
- `NPC_DJ_LOBBY` — Spawn the NPC automaton DJ in the public lobby. Format `<mode>[:<playlistId>]`, e.g. `fallback:default` or `rotation:default`. Modes: `fallback` (DJs only while no humans are queued, hands over after its track), `rotation` (permanent queue member). Playlists live in `server/src/data/npc-playlists/`. Custom rooms use the create-form toggle instead.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/donny/Projects/2026/club-mutant
git add CLAUDE.md server/CLAUDE.md
git commit -m "docs: document NPC_DJ_LOBBY env var for dev/lobby enablement"
```

---

### Task 7: Full verification sweep

- [ ] **Step 1: Server tests**

Run: `cd /Users/donny/Projects/2026/club-mutant/server && pnpm test`
Expected: ALL PASS (24 pre-existing + new movement/sanitizer/teleport tests).

- [ ] **Step 2: Types tests**

Run: `cd /Users/donny/Projects/2026/club-mutant/types && pnpm test`
Expected: ALL PASS (22 tests).

- [ ] **Step 3: Workspace build**

Run: `cd /Users/donny/Projects/2026/club-mutant && pnpm -r build`
Expected: every package builds with no errors.

- [ ] **Step 4: Review `git log`** — confirm one commit per task on `npc-dj-presence`, nothing pushed.

---

## Manual runtime smoke test (post-execution — human/reviewer, NOT the headless agent)

1. `docker compose -f docker-compose.dev.yml up -d`
2. `cd server && NAKAMA_ENCRYPTION_KEY=clubmutant_dev_encryption_key_32ch NPC_DJ_LOBBY=rotation:default pnpm dev`
3. `cd client-3d && pnpm dev`, open the lobby.
4. Verify: NPC avatar appears at (220,500)-ish → **walks** to a booth slot (walk animation) → track starts with a chat announcement → NPC **dances in place** behind the booth.
5. Restart the server with `NPC_DJ_LOBBY=fallback:default`, join the DJ queue as a human: NPC finishes its track, posts a handover line, **walks** to the dancefloor, alternates idle/wander, dances between walks while your track plays.
6. Create a custom room with the "dj bot" toggle set to *resident* — NPC spawns and DJs there.
7. Tune `NPC_DJ_WANDER_BOUNDS` in `NpcDjManager.ts` if the wander area clips walls or props.
8. Confirm the avatar renders correctly for several `textureId`s (5 `TEXTURE_IDS` vs available `/characters/*` folders) — if any id renders as a fallback/missing character, fix `characterRegistry` mapping in a follow-up commit.
