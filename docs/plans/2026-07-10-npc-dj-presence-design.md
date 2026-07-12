# NPC DJ Presence & Behaviors — Design

**Date:** 2026-07-10
**Status:** Approved (brainstorming session 2026-07-10)
**Builds on:** `2026-07-05-npc-dj-design.md` (Phase 1, merged in PR #64)
**Branch:** `npc-dj-presence`

## Summary

Phase 1 shipped the NPC automaton DJ server-side (`NpcDjManager`): queue membership,
playback, announcements, guards. This phase makes it feel alive in the world and makes
it reachable:

1. **Movement & behaviors** — Lily-style server-driven movement: walk to/from the booth
   instead of teleporting, wander the dancefloor when idle (fallback mode), dance
   automatically whenever music plays.
2. **Chat reactions** — small template pools on booth handover/return.
3. **Enablement** — document `NPC_DJ_LOBBY` for dev (A) and add an NPC DJ toggle to the
   custom-room creation form (B).

## Key insight (from exploration, 2026-07-10)

The client already renders everything we need — **zero client rendering work**:

- Every player in `state.players` renders through `GameScene.tsx → PlayerEntity.tsx`,
  including `isNpc` players. The NPC DJ already appears as a PaperDoll avatar via its
  `textureId` (`GameScene.tsx:73`, `characterRegistry.characterPathForTextureId`).
- PaperDoll animation is **not networked** — the client derives it locally from visual
  velocity + music state (`PlayerEntity.tsx:301-334`): moving → `walk`, stationary
  while music plays → `dance`, else `idle`. Moving `x/y` server-side is all it takes.
- Positions are lerped client-side (`REMOTE_LERP=8`, `PlayerEntity.tsx:136-139`), so
  server-side 200ms movement ticks look smooth.
- `npcAnimState` only drives ACS (`.acs`) characters — irrelevant for the PaperDoll DJ.
- No pathfinding exists in client-3d or server; Lily uses straight-line lerp within an
  axis-aligned bound (`ClubMutant.ts:390-422`). We do the same.

## Design principle

**Movement is a purely cosmetic layer.** Queue joins/leaves/track playback stay
instant, exactly as today — the body walks to catch up with what the state already
says. Movement never gates or delays rotation, timing, or fallback logic.

## Part 1 — Movement state machine (`NpcDjManager`)

A second interval at `NPC_DJ_MOVE_INTERVAL_MS = 200` (Lily parity), separate from the
existing 1s watcher tick. Speed `NPC_DJ_SPEED = 60` server px/s (Lily parity).

Conceptual states:

| State | Behavior | Exit |
|---|---|---|
| `walkingToBooth` | Straight-line walk toward `(DJ_SLOT_SERVER_X[slot], BEHIND_BOOTH_SERVER_Y)` | Arrive → `atBooth` |
| `atBooth` | Stand still at the slot while queued (both modes). Client auto-dances during tracks — **no jitter** (jitter risks triggering the `walk` anim) | `leaveQueue()` → `walkingToFloor` |
| `walkingToFloor` | Walk toward a random point in `NPC_DJ_WANDER_BOUNDS` | Arrive → `hangingOut` |
| `hangingOut` | Idle 3–8s (auto-dances if music playing) | Timer → `wandering` |
| `wandering` | Walk to a random point in bounds | Arrive → `hangingOut` |

Implementation note: the three walking states may collapse into one `walking` state
with a target + arrival disposition (`'booth' \| 'floor'`) — the table above is the
conceptual model.

Transitions are event-driven from the existing lifecycle:

- `joinQueue()` success → walk to the claimed slot (booth disposition).
- `leaveQueue()` (fallback handover) → walk to a random floor point.
- Mid-walk retargeting is safe: a rejoin while walking to the floor simply flips the
  target back to the booth.
- Rotation mode: the NPC never leaves the queue, so it stays `atBooth` permanently —
  matching how human DJs hold their slot positions.
- `NPC_DJ_STANDBY_X/Y (220, 500)` remains the **spawn point only**; the fixed-standby
  teleport (`moveToStandby`) is replaced by the walk-to-floor behavior.

**Wander bounds (provisional, tuned during runtime smoke test):** a dancefloor
rectangle in front of the booth, initial guess `x ∈ [-250, 250]`, `y ∈ [150, 380]`
(server px; booth slots sit at `y = 430`). Positions must stay within the client clamp
of ±550.

## Part 2 — Teleport suppression

`joinDjQueue()` (`djHelpers.ts`) teleports the joining player to the slot. Add an
optional trailing param `teleport = true`; the NPC passes `false` and walks instead.
Human code paths unchanged (default preserves behavior).

## Part 3 — Chat reactions

Two small template pools through the existing `announce()` path (same chat-schema +
`ADD_CHAT_MESSAGE` broadcast used for track announcements — bubble behavior identical
to Lily's):

- **Handover** — fired in the fallback `leaveQueue()` path when humans are waiting:
  e.g. "booth's yours 🎛️" / "passing the decks — keep it moving" / "warmed 'em up for
  you". Not fired on dispose.
- **Return to the decks** — the existing single `FALLBACK_JOIN_MESSAGE` becomes a pool:
  e.g. "taking over while the booth's empty." / "back to the decks 🎧" / "no DJ? i got
  this."

No random idle chatter (YAGNI). Events are naturally rare; no cooldown needed.

## Part 4 — Enablement

### A. Document `NPC_DJ_LOBBY` (dev/testing path — works today)

- Add to `server/CLAUDE.md` env-var list and the root `CLAUDE.md` dev-setup snippet:
  `NPC_DJ_LOBBY=fallback:default` (or `rotation:default`) spawns the NPC in the public
  lobby. Format: `<mode>[:<playlistId>]`.

### B. Custom-room creation toggle

- **`CreateRoomForm.tsx`**: new "dj bot" selector rendered only when
  `musicModeOption === 'djqueue'` — three buttons styled like the existing music-mode
  row: **off** (default) / **fill-in** ("plays when booth is empty" → `fallback`) /
  **resident** ("always in the queue" → `rotation`).
- **`NetworkManager.createCustomRoom`**: `roomData` gains
  `npcDj?: { mode: 'fallback' | 'rotation' }`, passed through into the Colyseus create
  options (field already typed on `IRoomData` in `types/Rooms.ts`).
- **Server-side sanitization** (`ClubMutant.onCreate`): `options.npcDj` comes from an
  untrusted client — accept **only** `{ mode: 'fallback' | 'rotation' }`; drop
  everything else (no client-supplied `name`/`playlistId`/`textureId`, preventing
  impersonation/abuse; playlist defaults to `default`, name/texture stay
  server-randomized). The lobby env path is unaffected.

## Explicitly not doing

- No client rendering/animation changes — all already works.
- No `npcAnimState` usage (ACS-only field).
- No pathfinding/navmesh — straight lines in an obstacle-free rectangle.
- No changes to Lily's code (shared-movement extraction deferred until a third NPC
  exists).
- No Phase 2 runtime spawn/despawn UI or owner gating (still deferred).

## Testing & verification

- **Server tests** (existing vitest setup, `server/src/__tests__/`):
  - Rotation spawn → movement state walks toward slot coords and settles `atBooth`
    (drive the movement tick directly or with fake timers).
  - Fallback handover → NPC leaves queue instantly (state), then walks; walk targets
    within wander bounds.
  - Queue/playback state changes are never delayed by movement.
  - `options.npcDj` sanitizer: garbage/extra fields rejected or stripped.
- **Build checks**: `cd server && pnpm test`, `cd types && pnpm test`, `pnpm -r build`.
- **Runtime smoke test** (also closes Phase 1's untested rendering assumption): run dev
  stack with `NPC_DJ_LOBBY=rotation:default`, join with the client, verify: avatar
  appears → walks to booth → dances during its track → (switch to `fallback`, join
  queue as human) NPC finishes track, announces handover, walks to floor, wanders,
  dances between wanders. Verify `textureId → characterPath` mapping renders correctly
  (5 `TEXTURE_IDS` vs available `/characters/*` folders); fix mapping if mismatched.
  Tune wander bounds visually.

## Files touched

| File | Change |
|---|---|
| `server/src/rooms/NpcDjManager.ts` | Movement state machine, reaction pools, drop teleports |
| `server/src/rooms/commands/djHelpers.ts` | `joinDjQueue` optional `teleport` param |
| `server/src/rooms/ClubMutant.ts` | Sanitize `options.npcDj` from clients |
| `client-3d/src/ui/CreateRoomForm.tsx` | DJ bot selector (djqueue mode only) |
| `client-3d/src/network/NetworkManager.ts` | Pass `npcDj` through `createCustomRoom` |
| `server/CLAUDE.md`, `CLAUDE.md` | Document `NPC_DJ_LOBBY` |
| `server/src/__tests__/` | Movement + sanitizer tests |
