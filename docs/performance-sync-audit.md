# Performance & Sync Audit (Feb 2026)

Audit of the 3D client stack covering network schema, music playback sync, and client-side rendering.

---

## A. Network Schema — Dead Weight & Bandwidth

### A1. Remove legacy schema fields ✅

**Status**: Implemented

These fields were synced to every client but unused by the DJ Queue system:

- `Player.currentPlaylistItem` / `Player.nextPlaylistItem` / `Player.nextTwoPlaylist` — legacy pre-DJ-queue playlist fields (each `PlaylistItem` has 7 string/number fields; for N players that's 3×7×N fields serialized)
- `Player.videoConnected` — not read by client-3d
- `OfficeState.musicBoothQueue` (`ArraySchema<number>`) — legacy booth queue, replaced by `djQueue`
- `OfficeState.nextStream` — entire duplicate `MusicStream` instance, never used
- `OfficeState.roomPlaylist` (`ArraySchema<RoomPlaylistItem>`) — legacy shared room playlist, replaced by per-player `roomQueuePlaylist`
- `MusicStream.isRoomPlaylist` / `MusicStream.roomPlaylistIndex` — legacy cursor fields
- `MusicStream.videoBackgroundEnabled` — legacy (2D only); 3D client uses local-only `boothStore.videoBackgroundEnabled`

**Impact**: ~60-70% reduction in per-player schema payload size.

### A2. Per-player `roomQueuePlaylist` syncs to ALL clients

**Status**: Pending

`Player.roomQueuePlaylist` is on the `Player` schema, meaning every player's DJ queue playlist is serialized and sent to every connected client. Only the owning client needs it.

**Fix**: Remove `@type` decorator from `roomQueuePlaylist`. Keep it as a server-side-only plain array. Continue using `ROOM_QUEUE_PLAYLIST_UPDATED` targeted messages (already sent via `client.send()`, not broadcast).

### A3. `IOfficeState` interface drift

**Status**: Fixed alongside A1

`types/IOfficeState.ts` was missing: `djQueue`, `currentDjSessionId` on `IOfficeState`; `roomQueuePlaylist` on `IPlayer`. Had stale fields: `thumb`, `type` on `IPlaylistItem`.

### A4. Batch x/y position updates

**Status**: Pending

Each `playerProxy.listen('x')` and `listen('y')` fires independently → 2 separate `updatePlayer()` calls → 2 `new Map()` clones per remote player per server tick. Batch with a microtask to flush once.

### A5. Duplicated `playTrackForCurrentDJ`

**Status**: Pending

Identical function copy-pasted in `DJQueueCommand.ts` and `RoomQueuePlaylistCommand.ts`. Extract to a shared helper.

### A6. Chat messages grow unbounded on server

**Status**: Pending

`OfficeState.chatMessages` (`ArraySchema`) is never trimmed server-side. Client trims to 100 locally. Server should trim to a cap.

---

## B. Music Playback Sync

### B1. No clock sync in 3D client

**Status**: Pending

Server sets `musicStream.startTime = Date.now()`. Client computes seek offset as `(Date.now() - startTime) / 1000`, assuming clocks agree. They don't.

The server already has `TIME_SYNC_REQUEST/RESPONSE` and `MUSIC_STREAM_TICK` (5s interval) — **3D client ignores both**.

**Fix**:
1. On connect, run a few `TIME_SYNC_REQUEST` round-trips to estimate `serverTimeOffset`
2. Use offset when computing seek positions
3. Listen to `MUSIC_STREAM_TICK` for periodic drift correction

### B2. No server-side track duration watchdog

**Status**: Pending

If the current DJ's client crashes mid-track, no one sends `DJ_TURN_COMPLETE`. Stream state stays "playing" forever.

**Fix**: Start a `setTimeout` of `track.duration + 5s` when a track starts. Auto-advance rotation if no completion message arrives. Clear on turn complete/skip/stop/leave.

### B3. `streamId` ignored by client

**Status**: Pending

Server increments `musicStream.streamId` per track. Client should use it to discard stale messages and verify tick messages match current stream.

### B4. Late-join race condition

**Status**: Pending

`NetworkManager.wireRoomListeners()` reads `roomState.musicStream` immediately after wiring listeners. Colyseus state may not be fully patched yet. Use `listen()` pattern or a small delay.

### B5. `handleEnded` can fire multiple times

**Status**: Pending

`ReactPlayer`'s `onEnded` can fire more than once (especially mobile/Safari). Guard `djTurnComplete()` to only fire once per `streamId`.

---

## C. Client-Side Rendering

### C1. `gameStore.updatePlayer` clones entire Map on every call

**Status**: Pending

Every position update does `new Map(s.players)` + spread merge. With 10 players at 20Hz, that's 200 Map clones/sec.

**Fix**: Use refs for positions — store target positions in a `Map<string, {x,y}>` ref that `useFrame` reads directly, bypassing React state. Only use Zustand for metadata (name, textureId, scale).

### C2. `Players` component re-renders all entities on any player change

**Status**: Pending

`useGameStore((s) => s.players)` returns a new Map ref on every update → all PlayerEntity components re-render.

**Fix**: Derive stable `playerIds` array, render per-ID wrapper that selects only its own data.

### C3. `<Html>` nametags are expensive DOM overlays

**Status**: Pending

Every player has a drei `<Html>` creating a DOM node repositioned via CSS transform each frame. Expensive for many players.

**Fix**: Replace with troika `<Text>` on layer 1 (already used for chat bubbles).

### C4. VHS bloom does 64 texture samples per pixel

**Status**: Pending (low priority)

8 directions × 8 scales = 64 taps per pixel. At ¾-res manageable, but options exist: reduce to 16 taps, separable blur, or ½-res bloom target.

### C5. Wall occlusion allocates per frame

**Status**: Pending

`playerWorldPos.clone().sub(camera.position)` allocates a new `Vector3` every frame. Use pre-allocated scratch vector.

### C6. `SingleBubble` layer setup useEffect runs every render

**Status**: Pending

```tsx
useEffect(() => {
  bgRef.current?.layers.set(1)
  tailRef.current?.layers.set(1)
}) // no deps = every render
```

Should use deps or ref callback.

### C7. `App.tsx` subscribes to entire `stream` object

**Status**: Pending

`useMusicStore((s) => s.stream)` returns new object ref on any property change → re-renders entire App tree. Use granular selectors.

---

## Priority Table

| Priority | Item | Impact | Effort |
|----------|------|--------|--------|
| 🔴 | A1 — Remove legacy schema fields | High bandwidth savings | Low |
| 🔴 | B1 — Add clock sync to 3D client | Correct music playback | Medium |
| 🔴 | C1 — Refs for player positions | Eliminates hot-path re-renders | Medium |
| 🟡 | A2 — Remove roomQueuePlaylist from schema | Bandwidth reduction | Low |
| 🟡 | B2 — Server-side track duration watchdog | Prevents stuck streams | Low |
| 🟡 | C2 — Per-player selectors | Fewer re-renders | Low |
| 🟡 | C7 — Granular music store selectors | Fewer App re-renders | Low |
| 🟢 | A4 — Batch x/y position updates | Halves Map clones | Low |
| 🟢 | C3 — Replace Html nametags with Text | DOM overhead reduction | Low |
| 🟢 | B3 — Use streamId for dedup | Correctness | Low |
| 🟢 | B5 — Guard handleEnded | Prevents double advance | Low |
| 🟢 | C4 — Optimize bloom taps | GPU perf | Medium |
| 🟢 | A3 — Fix IOfficeState drift | Type safety | Low |
| 🟢 | A5 — DRY playTrackForCurrentDJ | Code quality | Low |
| 🟢 | A6 — Trim chatMessages on server | Memory | Low |
| 🟢 | C5 — Pre-alloc wall occlusion vec | Micro-opt | Low |
| 🟢 | C6 — Fix bubble useEffect deps | Micro-opt | Low |
