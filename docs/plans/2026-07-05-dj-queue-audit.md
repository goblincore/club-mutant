# DJ Queue Subsystem Audit — 2026-07-05

Read-only audit of round-robin rotation correctness and jukebox/late-joiner sync.
No source files were modified.

**Files traced:**
- `server/src/rooms/commands/DJQueueCommand.ts` (advanceRotation, markTrackAsPlayed, removeDJFromQueue, all DJ commands)
- `server/src/rooms/commands/djHelpers.ts` (playTrackForCurrentDJ)
- `server/src/rooms/commands/RoomQueuePlaylistCommand.ts`
- `server/src/rooms/ClubMutant.ts` (watchdog, music stream tick, onJoin/onDrop/onLeave, message handler registration)
- `types/RoomState.ts` (MusicStream, DJQueueEntry, Player schemas)
- `client-3d/src/network/messages/musicHandlers.ts`, `djQueueHandlers.ts`
- `client-3d/src/network/TimeSync.ts`, `NetworkManager.ts`
- `client-3d/src/ui/NowPlaying.tsx`, `client-3d/src/stores/musicStore.ts`

Severity legend: **HIGH** = wrong rotation / audible breakage in normal use; **MED** = stall or wrong-track bookkeeping recoverable by user action; **LOW** = hygiene / rare.

---

## Part 1 — Round-robin rotation correctness

### F1. HIGH / CONFIRMED — `advanceRotation` assumes `djQueue[0]` is the current DJ, but three promotion paths set `currentDjSessionId` without moving that entry to the front

**Where:**
- `server/src/rooms/commands/DJQueueCommand.ts:52` — `const currentEntry = room.state.djQueue[0]` (rotation always shifts the *front* entry)
- Promotion paths that do NOT reorder the queue:
  - `DJQueueCommand.ts:252-256` — `DJQueueJoinCommand`: "No current DJ — set this one as current" (new joiner is pushed to the *end*)
  - `DJQueueCommand.ts:303-313` — `DJPlayCommand` auto-promote: any queued player becomes current when `currentDjSessionId` is null, regardless of position
  - `RoomQueuePlaylistCommand.ts:71-79` — `RoomQueuePlaylistAddCommand`: promotes the track-adder when there is no current DJ, regardless of position

`currentDjSessionId` can legitimately be null while the queue is non-empty (`DJQueueCommand.ts:99` — `advanceRotation` sets it null when no DJ has unplayed tracks), so these paths are reachable in normal play.

**Repro:**
1. DJs A and B join (queue = [A, B]). Both play through all their tracks; `advanceRotation` eventually finds no unplayed tracks → `currentDjSessionId = null`, queue still [A, B] (`DJQueueCommand.ts:97-109`).
2. B adds a new track → `RoomQueuePlaylistCommand.ts:71-73` promotes B (`currentDjSessionId = B`) while B sits at index 1.
3. B presses play; the track finishes; client sends `DJ_TURN_COMPLETE` → `advanceRotation`.
4. Line 52 takes `djQueue[0]` = **A** as "current", shifts A off the front and re-appends A — A is rotated to the back **without ever having a turn**.
5. `findNextDJWithTracks` scans [B, A]: if B added two tracks, B plays again immediately — **B gets consecutive turns, A is starved/skipped**. If A had unplayed tracks, they're now behind B.

**Fix direction:** make `advanceRotation` rotate the entry matching `state.currentDjSessionId` (findIndex by sessionId) instead of blindly using index 0 — or make every promotion path move the promoted entry to the front (`unshift`) so the invariant "current DJ == djQueue[0]" actually holds. Pick one invariant and enforce it in a single helper.

---

### F2. HIGH / CONFIRMED — `onLeave` dispatches `DJQueueLeaveCommand` without clearing/re-arming the track watchdog → stale watchdog cuts the next DJ's track short

**Where:**
- `server/src/rooms/ClubMutant.ts:1345-1349` — `onLeave` dispatches `DJQueueLeaveCommand` directly, with no `clearTrackWatchdog()` / `startWatchdogIfPlaying()` around it.
- Contrast with the explicit `DJ_QUEUE_LEAVE` message handler at `ClubMutant.ts:1022-1027`, which does clear + re-arm.
- `DJQueueCommand.ts:162-175` — `removeDJFromQueue` auto-starts the next DJ's track (`playTrackForCurrentDJ`) inside that dispatch.

**Repro:**
1. DJ A is mid-track (watchdog armed for A's track duration + 10 s, `ClubMutant.ts:138-139`).
2. A closes the tab / disconnects with a consented leave → `onLeave` fires → `removeDJFromQueue` stops A's stream and auto-plays DJ B's track (`DJQueueCommand.ts:145-175`).
3. The watchdog from **A's** track is still armed. When it fires (`ClubMutant.ts:141-162`), `ms.status === 'playing'` (B's track) → it dispatches `DJTurnCompleteCommand` for the *current* DJ (B) → **B's track is cut off at an arbitrary point** (wherever A's old timer landed) and rotation advances early.
4. Symmetrically, if the old watchdog had already fired or was never armed, B's auto-started track runs with **no watchdog at all** (see F3 for consequence).

Note: the involuntary-disconnect path is delayed by `allowReconnection(client, 60)` (`ClubMutant.ts:1279-1291`), but `onLeave` still eventually runs with the same missing watchdog handling; the consented-leave path hits it immediately.

**Fix direction:** wrap the `onLeave` dispatch in the same `clearTrackWatchdog()` / `startWatchdogIfPlaying()` pair used by the message handler — better, move watchdog arm/clear *into* `playTrackForCurrentDJ` / the stop paths so it can't be forgotten by any caller.

---

### F3. HIGH / CONFIRMED — watchdog callback never re-arms after auto-advancing → next track has no watchdog backstop

**Where:** `server/src/rooms/ClubMutant.ts:141-162`. The `setTimeout` callback dispatches `DJTurnCompleteCommand` (which runs `advanceRotation` → `playTrackForCurrentDJ`, starting a new track) but never calls `startWatchdogIfPlaying()` afterwards. All *message*-driven paths re-arm (`ClubMutant.ts:1045-1049`); the timer-driven path does not.

**Repro (rotation stall):**
1. Single DJ A with tracks [T1, T2]. A's tab is closed mid-T1 (within the 60 s reconnection window, A is still in `players` and still current).
2. Nobody sends `DJ_TURN_COMPLETE` (only the current DJ's client reports in DJ mode — `client-3d/src/ui/NowPlaying.tsx:56-60`). Watchdog fires at T1-duration + 10 s → advances → T2 starts playing.
3. T2 now has **no watchdog** and no client to report its end → `musicStream.status` stays `'playing'` indefinitely (until A's reconnection window expires and `onLeave` cleans up, or some unrelated DJ message handler incidentally calls `startWatchdogIfPlaying()`).
4. With two DJs where the current DJ's client silently fails (backgrounded tab whose `onEnded` never fires, autoplay-blocked player), the same one-shot degradation applies: watchdog saves the first track, then the safety net is gone.

**Fix direction:** call `startWatchdogIfPlaying()` at the end of the watchdog callback (after the dispatch) — or, per F2, arm the watchdog inside `playTrackForCurrentDJ` itself so every started track is covered regardless of trigger path.

---

### F4. MED-HIGH / CONFIRMED — no streamId dedupe on `DJ_TURN_COMPLETE` → double-advance when the rotation wraps to the same DJ

**Where:**
- `DJQueueCommand.ts:370-399` — `DJTurnCompleteCommand`'s only dedupe is the `currentDjSessionId === client.sessionId` guard, which is useless when `advanceRotation` wraps back to the *same* session (single DJ, or others have no unplayed tracks).
- Contrast: jukebox mode deduplicates via `streamId` (`ClubMutant.ts:1136-1144`), DJ mode does not.
- Client-side dedupe (`NowPlaying.tsx:43-51`, `lastEndedStreamIdRef`) only covers duplicate `onEnded` events on one client; it does not cover the watchdog racing the client, nor the manual "▶▶" button (`NowPlaying.tsx:188`) which sends `DJ_TURN_COMPLETE` directly with no streamId.

**Repro:**
1. Single DJ A, tracks [T1, T2]. T1 plays. A's playback lags/buffers so the client `onEnded` fires > 10 s after the server-side duration elapses.
2. Watchdog fires first: marks T1 played, `advanceRotation` wraps to A, starts T2 (streamId++).
3. A's late `DJ_TURN_COMPLETE` (for T1) now arrives. Guard passes — A is still the current DJ. `markTrackAsPlayed` marks **T2** (currently playing, at index 0) as played, `advanceRotation` runs again → no unplayed tracks left → **T2 is killed seconds after starting and the room goes silent**.
4. Same outcome if the user clicks "▶▶" right as the track naturally ends (two `DJ_TURN_COMPLETE`s in flight).

**Fix direction:** include `streamId` in the `DJ_TURN_COMPLETE` payload (client already has it) and have `DJTurnCompleteCommand` ignore completions whose streamId ≠ `state.musicStream.streamId`, mirroring the jukebox pattern.

---

### F5. MED / CONFIRMED — `removeDJFromQueue` promotes the next DJ "regardless of tracks" and `playTrackForCurrentDJ` silently no-ops → silent stall after the current DJ leaves

**Where:**
- `DJQueueCommand.ts:162-175` — promotes `djQueue[0]` unconditionally; auto-plays only if `roomQueuePlaylist.length > 0` (a *length* check, not an unplayed check).
- `djHelpers.ts:17-25` — `playTrackForCurrentDJ` returns silently when the DJ has no **unplayed** track.
- Asymmetry: `advanceRotation` skips DJs without unplayed tracks (`findNextDJWithTracks`, `DJQueueCommand.ts:21-33`); `removeDJFromQueue` does not.

**Repro:**
1. DJ A is playing; DJ B waits in queue having already played all their tracks in a previous cycle (played flags still true — only `DJPlayCommand` resets them, `DJQueueCommand.ts:327-336`).
2. A leaves. `removeDJFromQueue` stops the music, promotes B, calls `playTrackForCurrentDJ` (B's playlist length > 0) → finds no unplayed track → returns.
3. Room is silent, `status = 'waiting'`, B is current. Nothing recovers automatically; B must notice and press ▶ (which triggers the loop-reset in `DJPlayCommand`).

**Fix direction:** on leave-promotion, reuse the `advanceRotation` selection logic (skip-to-next-with-unplayed) or apply the same "all played → reset flags" loop-reset that `DJPlayCommand` does before auto-playing.

---

### F6. MED / CONFIRMED — a current DJ with no tracks blocks the rotation; other queued DJs cannot start playback

**Where:**
- `DJQueueCommand.ts:249-256` — first joiner becomes current even with an empty playlist.
- `DJQueueCommand.ts:303-313` — `DJPlayCommand` rejects any non-current player whenever `currentDjSessionId` is non-null (auto-promote only fires when it's null).
- No watchdog runs while nothing is playing, so there is no timer to break the deadlock.

**Repro:**
1. A joins the DJ queue with no tracks → set as current.
2. B joins with a full playlist. B's UI shows the play button (`NowPlaying.tsx:139` — `isInQueue && !isPlaying`), B presses ▶ → server rejects: "Play rejected - not current DJ" (`DJQueueCommand.ts:310-312`).
3. Nothing plays until A adds tracks and plays, presses skip (`DJSkipTurnCommand`), or leaves. A idle/AFK A stalls the booth indefinitely. Same state is reachable via F5's promotion of a trackless DJ.

**Fix direction:** when the current DJ has no unplayed tracks and another queued DJ requests play, pass the turn (or run `findNextDJWithTracks` on a timer / on `DJ_PLAY`). Alternatively require ≥1 track to occupy "current" status.

---

### F7. MED / CONFIRMED — `markTrackAsPlayed` marks `roomQueuePlaylist[0]`, not the track that actually played

**Where:**
- `DJQueueCommand.ts:118-132` — always takes index 0.
- `djHelpers.ts:17-25` — `playTrackForCurrentDJ` plays the *first unplayed* track, which can be at index > 0.
- The guards protecting "the currently playing track" also hardcode index 0: remove guard `RoomQueuePlaylistCommand.ts:98-105`, reorder guard `RoomQueuePlaylistCommand.ts:129-137`.

**Repro:**
1. While stopped (`status = 'waiting'`), DJ A reorders their playlist so a *played* track sits at index 0 and an unplayed track at index 1 (reorder guard only applies while playing).
2. A presses ▶. `playTrackForCurrentDJ` plays index 1 (first unplayed).
3. Track ends → `markTrackAsPlayed` marks **index 0** (already played) and rotates it to the bottom; the track that actually played remains `played = false` → it plays again next turn. Meanwhile the remove/reorder guards were protecting the wrong item, so the actually-playing track could also be removed mid-play.

**Fix direction:** record the playing track's id on the musicStream (or room) when `playTrackForCurrentDJ` starts it, and have `markTrackAsPlayed` + the remove/reorder guards target that id instead of index 0.

---

### F8. LOW / CONFIRMED — played-flag reset only happens on explicit `DJ_PLAY`; a full cycle ends in silence with DJs still at the booth

**Where:** `DJQueueCommand.ts:97-109` (advanceRotation stops when no DJ has unplayed tracks) and `DJQueueCommand.ts:327-336` (reset lives only in `DJPlayCommand`).

**Scenario:** queue [A, B]; both playlists fully played once → music stops, `currentDjSessionId = null`, DJs remain in queue. Recovery requires a human to press ▶ (which promotes + resets). May be intentional ("no infinite loop without consent"), but combined with F1 the null-current state it creates is what corrupts rotation order. If auto-looping is desired, reset flags in `advanceRotation` when *every* queued DJ is exhausted.

---

### F9. LOW / CONFIRMED — `DJ_QUEUE_UPDATED` broadcasts are dead traffic to the 3D client

**Where:** server broadcasts on every mutation (`DJQueueCommand.ts:111-114, 183-186, 258-261`; `RoomQueuePlaylistCommand.ts:75-79`), but the client syncs the DJ queue exclusively via schema callbacks (`client-3d/src/network/messages/djQueueHandlers.ts:32-42`) and registers no `onMessage(DJ_QUEUE_UPDATED)`. Colyseus client logs "onMessage … not registered" warnings; bandwidth is wasted (full queue array per event). Fix direction: drop the broadcast or register a no-op handler; schema is already the source of truth (and correctly covers late joiners).

---

## Part 2 — Jukebox / late-joiner sync

**How it works today (traced):**
- On join, the server sends `START_MUSIC_STREAM` with a server-computed `offset` (`ClubMutant.ts:1264-1270`). Broadcast starts always send `offset: 0` (`djHelpers.ts:43`, `JukeboxCommand.ts:58`).
- The client **ignores `data.offset` entirely** (`musicHandlers.ts:9-33` never reads it) and instead derives the seek from `ms.startTime`, converted to client clock via `TimeSync` when ready.
- `NowPlaying.tsx:63-72` seeks to `(Date.now() - stream.startTime) / 1000` when > 1 s.
- Drift correction: `MUSIC_STREAM_TICK` every 5 s (`ClubMutant.ts:221-235`) → client resyncs `startTime` if timestamp drift > 2 s (`musicHandlers.ts:40-63`), which re-triggers the seek effect.
- A one-shot `timeSync.onReady` fallback re-reads `room.state.musicStream` for late joiners (`musicHandlers.ts:65-88`).
- Between-tracks join (`status = 'waiting'`) correctly sends/plays nothing — verified OK.

### F10. HIGH / PLAUSIBLE (mechanism confirmed in code; needs runtime verification of react-player behavior) — late joiners can start at 0:00 when the seek lands before the YouTube player is ready, and nothing ever re-seeks

**Where:** `client-3d/src/ui/NowPlaying.tsx:63-72` and the conditional mount at `NowPlaying.tsx:112-133 / 144-161` (ReactPlayer only mounts once `isPlaying` flips true).

**Chain:**
1. Late joiner receives `START_MUSIC_STREAM` → store updates → ReactPlayer mounts → the seek effect runs immediately, while the underlying YouTube iframe is still loading.
2. `react-player`'s `seekTo` before ready stores a `seekOnPlay` value with a ~5 s expiry. If the YT player takes > 5 s to become ready — slow network, or **autoplay blocked pending a user gesture** (common for a fresh page load joining a room with music already playing) — the pending seek expires and playback begins at **0:00**.
3. Nothing corrects it: the tick drift correction (`musicHandlers.ts:53-61`) compares *store timestamps*, not the actual player position — store `startTime` is already correct, so drift ≈ 0 and no re-seek fires. The listener hears the track from the beginning, out of sync with the room, forever (until the next track).

**Repro:** join a room mid-track on a throttled connection (or before any page interaction so autoplay is deferred); observe playback from 0:00 while `elapsed` in the UI (computed from `startTime`) shows the correct mid-track time — the UI/audio disagreement is the tell.

**Fix direction:** wire `onReady`/`onStart` on ReactPlayer and (re)apply the seek there from `startTime`; optionally add a periodic check comparing `playerRef.getCurrentTime()` against expected elapsed and re-seek when they diverge > N seconds (that would also catch YouTube buffering stalls, which timestamp-only drift correction can never see).

### F11. MED / CONFIRMED — initial offset uses raw server `startTime` before TimeSync is ready, and the onReady fallback deliberately skips the correction

**Where:** `musicHandlers.ts:19-21` (falls back to raw `ms.startTime` when `!timeSync.ready`), `musicHandlers.ts:72-74` (onReady fallback returns early if "START_MUSIC_STREAM message already set this stream" — exactly the case where the skewed value was stored).

**Chain:** the onJoin `START_MUSIC_STREAM` arrives before the first TimeSync sample (probes start at join, first response ≥ 1 RTT later — `TimeSync.ts:19-21`, wiring order `NetworkManager.ts:228-231`). So the stored `startTime` is server-clock, and the seek/elapsed math uses client `Date.now()` (`NowPlaying.tsx:67, 83`) → the initial seek is off by the full client-server clock skew. Skew > 2 s is repaired within ≤ 5 s by the tick handler; **skew ≤ 2 s persists for the whole track** (audible desync between listeners, though bounded). The onReady fallback was built for this moment but its skip-guard excludes the skewed-store case.

**Fix direction:** in the onReady callback, *recompute* `startTime` via `toClientTime` even when the streamId matches (replace the early-return with a startTime refresh), and/or actually use the server-computed `offset` field for the initial seek instead of discarding it. Also worth lowering the 2 s drift threshold once TimeSync is ready.

### F12. LOW / CONFIRMED — server-computed `offset` field is dead code on the wire

`ClubMutant.ts:1266-1269` computes `(now - startTime) / 1000` for late joiners; `djHelpers.ts:43` / `JukeboxCommand.ts:58` / `ClubMutant.ts:218` send `offset: 0`. No client code reads it (`musicHandlers.ts` destructures only `musicStream`). Either consume it (it's skew-free and would fix F11's initial seek) or remove it to avoid the false impression that offset sync is message-driven.

### F13. LOW / PLAUSIBLE — a client that misses `START_MUSIC_STREAM` mid-session stays silent until the next track

`musicHandlers.ts:46` ignores `MUSIC_STREAM_TICK` when `!store.stream.isPlaying || streamId mismatch`, and the schema fallback runs only once at `timeSync.onReady`. Any missed START broadcast after that (transient handler error, message dropped during a reconnect that resumes the same room instance) leaves the client with no recovery path even though ticks carrying `streamId`/`startTime` arrive every 5 s. Fix direction: on a tick whose `streamId` is *ahead* of the store's, re-hydrate the stream from `room.state.musicStream` instead of returning.

### F14. MED / PLAUSIBLE — client-supplied `duration` drives the watchdog; wrong/zero duration breaks the backstop or cuts tracks early

`RoomQueuePlaylistCommand.ts:47` stores whatever `duration` the client sent; `djHelpers.ts:40` copies it to `musicStream.duration`; `startWatchdogIfPlaying` (`ClubMutant.ts:173-179`) arms only when `duration > 0` and fires at `duration + 10 s`. Consequences: duration `0` (client failed to resolve it) → **no watchdog** for that track (combines with F3's stall); duration shorter than the real video → watchdog fires mid-track and force-advances (`ClubMutant.ts:157-160`) — indistinguishable from F2's symptom. Also a trivially spoofable input. Fix direction: validate/clamp duration server-side (e.g., via the youtube-api service metadata already used for prefetch) or treat watchdog expiry more conservatively (verify against `startTime + duration` recomputed at fire time — currently correct only if duration was honest).

---

## Verified OK (explicitly checked, no issue found)

- Single-DJ self-rotation in `advanceRotation` (shift + push + `index > 0` guard) is consistent — no lost entry (`DJQueueCommand.ts:52-96`).
- `markTrackAsPlayed` on a 1-item playlist (push then shift) is safe (`DJQueueCommand.ts:127-129`).
- Empty-queue mid-track: last DJ leaving stops the stream and nulls `currentDjSessionId` (`DJQueueCommand.ts:145-152, 176-180`).
- Late joiners get the DJ queue via schema callbacks, including initial state delivery (`djQueueHandlers.ts:32-42`).
- Joining between tracks (`status='waiting'`): server sends nothing, client store stays cleared — correct silence, next START covers them.
- `DJ_TURN_COMPLETE` from non-DJ clients is guarded server-side, and non-DJ clients don't send it anyway (`NowPlaying.tsx:57`).
- Jukebox-mode track completion has proper streamId dedupe (`ClubMutant.ts:1136-1144`) — the DJ path just never got the same treatment (F4).

## Suggested priority order

1. F1 (rotation invariant) + F4 (streamId on DJ_TURN_COMPLETE) — correctness of turn order.
2. F2 + F3 — centralize watchdog arm/clear in `playTrackForCurrentDJ`/stop paths; fixes both at once.
3. F10 + F11/F12 — late-join seek reliability (onReady re-seek + consume server offset).
4. F5/F6/F7 — stall & bookkeeping fixes (shared root: no single "currently playing track" identity → F7's fix helps F4 too).
5. F8/F9/F13/F14 — hygiene and hardening.

## Resolutions (2026-07-06)

All 14 findings addressed on the audit's suggested order, one commit per cluster. Line references below are to the post-refactor layout (`djHelpers.ts` holds the rotation helpers, not `DJQueueCommand.ts`).

| # | Status | How |
|---|--------|-----|
| F1 | Fixed | `advanceRotation` rotates the entry matching `state.currentDjSessionId` (`findIndex`), never blindly `djQueue[0]`; `queuePosition` re-numbered contiguously. Vitest coverage. |
| F2 | Fixed | Watchdog clear/re-arm centralized inside `playTrackForCurrentDJ` and every stop/advance path. `ClubMutant.clearTrackWatchdog`/`startWatchdogIfPlaying` remain public. `NpcDjManager.armTrackTimer` still clears the watchdog immediately after playback starts, so its own timer stays the sole timing authority for NPC tracks. |
| F3 | Fixed | `onLeave` and watchdog-driven advances funnel through the same centralized clear→advance→re-arm path — the double-advance race is gone. |
| F4 | Fixed | `DJ_TURN_COMPLETE` now carries `streamId` from both client senders (`NowPlaying.tsx` onEnded reporter and ▶▶ skip); server rejects stale/duplicate completions exactly like the jukebox dedupe. Vitest coverage. |
| F5 | Fixed | Leave-promotion uses the same `findNextDJWithTracks` selection as `advanceRotation` — played flags respected, exhausted DJs skipped. Vitest coverage. |
| F6 | Fixed | A trackless current DJ no longer blocks the rotation; the turn passes to the next DJ with unplayed tracks. |
| F7 | Fixed | The currently playing item is recorded by track id; `markTrackAsPlayed` marks that id, not whatever sits at index 0. Vitest coverage. |
| F8 | Fixed | When every queued DJ is exhausted, `advanceRotation` resets `played` flags and loops the rotation instead of stopping; it still stops when queued DJs have no tracks at all. Vitest coverage. |
| F9 | Fixed | `client-3d` registers a no-op `DJ_QUEUE_UPDATED` handler (schema callbacks remain the source of truth). Broadcast kept server-side for the legacy 2D client, which is outside the pnpm workspace. |
| F10 | Fixed — needs runtime verification | Re-seek on ReactPlayer `onReady`/`onStart`; periodic drift check resyncs whenever `getCurrentTime()` deviates from expected elapsed by more than ~2s. |
| F11 | Fixed | `onReady` fallback refreshes `startTime` even when the `streamId` already matches. |
| F12 | Fixed | Server computes and sends the seek `offset` consistently on every `START_MUSIC_STREAM` path; client consumes it for the initial seek instead of deriving from raw `startTime`. |
| F13 | Fixed — needs runtime verification | A `MUSIC_STREAM_TICK` carrying a newer `streamId` rehydrates client stream state from `room.state.musicStream` (recovers a missed `START_MUSIC_STREAM`). |
| F14 | Fixed — needs runtime verification | `clampTrackDuration` (5 s – 4 h, non-finite/≤0 → 0 "unknown") applied at both ingestion points (room-queue add, jukebox add). Unknown duration now arms a 10-minute fallback watchdog instead of no watchdog. `youtubeService` has no metadata plumbing (prefetch only), so clamp-to-sane-bounds was used per the audit's fallback direction. |
