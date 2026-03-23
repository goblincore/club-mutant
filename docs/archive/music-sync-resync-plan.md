# Music Sync + Resync Plan (Implemented)

## Problem statement

Clients can drift out of sync over time, especially after:

- Tab backgrounding / throttling
- Buffering / transient network issues
- Autoplay / audio-policy interruptions

Current client sync logic relies on `Date.now()` with `musicStream.startTime` (set via server `Date.now()`), which is not a safe assumption when client/server clocks differ.

## Goals

- Keep all listeners reasonably aligned ("good enough" party sync)
- Automatically self-heal after backgrounding/buffering
- Avoid jittery over-correction (no constant seeking)
- Provide a user-visible "Resync" action

Non-goals (for now):

- Sub-50ms precision
- Persisting playback state across server restarts

## Current implementation (summary)

- Server stores `musicStream.startTime = Date.now()` when starting a track.
- Server increments `musicStream.streamId` on each new stream start.
- Server responds to `TIME_SYNC_REQUEST` with `TIME_SYNC_RESPONSE`.
- Server broadcasts `MUSIC_STREAM_TICK` every ~5 seconds while playing.
- Client maintains an NTP-style best-offset estimate (`TimeSync`) and computes expected playback time using server-time estimate.
- Client seeks on `ReactPlayer.onReady`, provides a manual **Resync** button, and runs a drift correction loop.
- Client resyncs on tab resume events (Safari-specific support included).

## Proposed refactor

### 1) Add client↔server time sync (NTP-style)

Add new messages:

- `Message.TIME_SYNC_REQUEST`
- `Message.TIME_SYNC_RESPONSE`

Protocol:

- Client sends `TIME_SYNC_REQUEST` with `{ clientSentAtMs }`.
- Server responds with `{ clientSentAtMs, serverNowMs }`.
- Client receives at `clientReceivedAtMs` and estimates:
  - `rttMs = clientReceivedAtMs - clientSentAtMs`
  - `oneWayMs = rttMs / 2`
  - `serverOffsetMs = (clientSentAtMs + oneWayMs) - serverNowMs`

Keep the best sample (lowest RTT) and refresh periodically (10–30s).

Implementation notes:

- Client refreshes time sync every ~15s.
- On Safari tab resume, the client also triggers an immediate time sync request before seeking.

### 2) Treat `musicStream.startTime` as _server time_

Interpret `musicStream.startTime` as `startedAtServerMs`.

Compute expected position using server time estimate:

- `serverNowEstimateMs = Date.now() - serverOffsetMs`
- `expectedSeconds = (serverNowEstimateMs - startedAtServerMs) / 1000`

### 3) Add periodic server beacons while playing

Add message:

- `Message.MUSIC_STREAM_TICK`

Server sends every ~2–5 seconds while `musicStream.status === 'playing'`:

- `streamId` (monotonic, increments each track start)
- `startedAtServerMs`
- `serverNowMs`
- (optional) `currentLink`

This lets clients self-heal even if they missed an earlier start event or drifted after backgrounding.

### 4) Implement client drift detection + correction loop

In `YoutubePlayer.tsx` (or a dedicated playback controller module), run a periodic check (~2s):

- Read `actualSeconds` from player (`ReactPlayer.getCurrentTime()` or YouTube internal player).
- Compute `expectedSeconds` using time sync.
- `driftSeconds = actualSeconds - expectedSeconds`.

Correction strategy:

- If `|driftSeconds| < 0.25`: do nothing.
- If `0.25 <= |driftSeconds| < 2`:
  - Prefer mild playback-rate correction if supported.
  - Otherwise do nothing (avoid choppiness).
- If `|driftSeconds| >= 2`:
  - `seekTo(expectedSeconds, true)`.

Safari note:

- Safari can suspend timers + iframe playback while backgrounded.
- On resume, the client attempts multiple resyncs and also resyncs again on the next `MUSIC_STREAM_TICK`.

Background video note:

- The fullscreen video background is best-effort and does not run the same periodic drift correction loop as the main audio player.
- Safari may require user interaction to start background video playback even when muted; the client provides a user-gesture fallback and does a light resync (seek + play) on resume.

### 5) Add a UI "Resync" button

Add a button near the existing playback controls that:

- Forces a time-sync sample request (optional)
- Immediately seeks to `expectedSeconds`

### 6) Consolidate the playback control plane

Avoid having both:

- message-driven starts (`START_MUSIC_STREAM`)
- state-driven starts (`syncMusicStreamFromState()` emitting `START_PLAYING_MEDIA`)

Pick one source of truth (recommended: state as truth) so the player doesn’t double-seek and accumulate weirdness.

## Implementation checklist (incremental)

- [x] Add message enums + types for time sync and stream ticks
- [x] Add server handlers for `TIME_SYNC_REQUEST`
- [x] Add server interval to broadcast `MUSIC_STREAM_TICK` while playing
- [x] Add `streamId` to `MusicStream` schema + client state
- [x] Add client `TimeSync` utility (stores best `serverOffsetMs`)
- [x] Update client offset computations to use server time estimate
- [x] Add drift detection loop + correction strategy
- [x] Add "Resync" button
- [ ] Add basic logging (dev-only) for drift samples + correction actions

## Test plan

- **Two browsers side-by-side**:
  - Start a stream; verify both report similar drift after 30–60s.
- **Background tab test**:
  - Background one tab for 30–120s; return; verify it resyncs within ~5–10s.
- **Safari background tab test**:
  - Background Safari for 30–120s; return; verify it resyncs (visibility/focus/pageshow) and then confirms sync on the next `MUSIC_STREAM_TICK`.
- **Network throttling** (DevTools):
  - Introduce transient throttling; verify drift corrections occur without constant seeking.

## Open questions

- Should non-DJ clients ever pause, or always try to stay playing?
- Do we want playback-rate correction, or only hard seek?
- For ambient mode, do we want “loop with sync” or “local loop only”?
