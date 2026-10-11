# DJ Queue Rotation System

The server owns DJ membership, turn selection, private playlists, and playback transitions. The 3D client plays the authoritative stream through a YouTube ReactPlayer. The analysis proxy is separate from audible playback.

## Turns and playlist looping

Up to three DJs occupy booth slots. Queue position controls turn order; slot index controls physical position. The current DJ can be different from the queue head during join or explicit play promotion, so rotation always locates the entry matching `currentDjSessionId`.

Each turn plays one track. Completion or an explicit skip moves the current DJ to the back and selects the next player still in the room with a nonempty playlist. Empty playlists are skipped without removing their owners from the queue.

A selected DJ whose entire playlist has been played has its played flags reset before playback starts. This looping happens independently for each DJ, preserving one-track turns when playlists have different lengths or an NPC continually replenishes its own playlist. A one-song DJ therefore plays that song on each turn, rather than waiting for every other playlist to exhaust. There is currently no per-playlist non-looping option.

The first unplayed track in playlist order starts. When it completes, that exact track ID is marked played and moved to the bottom. Unplayed tracks continue in their own order until the next loop. Reordering and removal protect the actual playing track by ID, regardless of its index.

When the current DJ leaves, the same selection and reset policy promotes the next DJ. An empty queue stops playback. If all remaining playlists are empty, leaving retains a waiting current DJ who can add tracks; completion leaves no current DJ until a queued player adds a track or requests play.

The first human starts playback explicitly. Subsequent turn transitions autoplay. The NPC DJ manager retains its fallback/rotation modes, playlist replenishment, movement, and separate completion timer. Movement does not gate queue transitions.

## Playback identity and controls

`musicStream.streamId` is a monotonic transition ID. Starts and stops both increment it. Starts record `currentTrackId`, link, title, DJ, server start timestamp, and duration. Stops clear playback fields and publish their transition ID.

Natural completion (`DJ_TURN_COMPLETE`) requires a matching transition ID, a playing stream, a current track ID, and the current DJ's session. Completion after Stop and duplicate callbacks from an earlier playback are ignored. The server watchdog includes the ID of the stream it is completing.

Explicit skip (`DJ_SKIP_TURN`) has separate behavior. While playing, it must match the current transition and marks the playing track before rotating. While stopped, it gives up the turn without marking an unheard track. Repeating a skip for an earlier stream cannot consume its successor. Stop leaves playlist played flags intact; explicit play resets the current DJ's flags only if all tracks are exhausted.

Both 3D and legacy 2D clients send playback IDs for natural completion. The 3D skip control sends the ID captured for its displayed stream.

## Public state and private playlists

Colyseus synchronizes `djQueue`, `currentDjSessionId`, and `musicStream` as public schema state. Personal `roomQueuePlaylist` arrays remain server-only; other players do not receive their contents.

`sendPlaylistSnapshot` targets the owner by session ID in the room's live client collection. It publishes `ROOM_QUEUE_PLAYLIST_UPDATED` after add, remove, reorder, completion, skip marking, and loop reset, plus join/reconnection recovery. Watchdog completion does not depend on a synthetic client's `send` method. Disconnected players recover their latest private playlist when reconnecting.

The 3D client mirrors public queue schemas into `boothStore` and receives private snapshots into its own queue playlist. The current-track highlight compares track IDs rather than assuming playlist index zero. The legacy client still consumes `DJ_QUEUE_UPDATED` notifications.

## Playback synchronization and reconnect

START and STOP messages provide prompt playback updates. Full `MUSIC_STREAM_TICK` snapshots every five seconds carry playing or waiting state, transition ID, server start time, and server-now time. Reconnection sends the same full snapshot immediately, including a stopped room.

The client also reconciles schema patches. It retains the stopped transition ID and rejects older START messages, STOP messages, ticks, and schema states, so a lagging patch cannot resurrect or replace newer playback. Unrelated room patches do not cause music-store updates when playback fields and timing are unchanged.

Before clock synchronization is ready, the client derives elapsed time from the server's START offset or tick timestamps. It never interprets a raw server timestamp as a client timestamp. Once synchronized, timestamps can be converted using the estimated clock offset.

`TimeSync.start` is idempotent. Drop and permanent leave stop periodic probes, burst timeouts, and response listeners; reconnect starts a fresh synchronization session. Probe RTT and sample expiration use the monotonic performance clock. Historical low-RTT samples expire after one minute, and reconnect/browser resume clear previous samples. A wall-clock change during a probe invalidates that sample.

The YouTube player is keyed by transition ID so a new stream of the same URL gets a fresh player. Its completion callback captures that stream's ID and checks that it still owns active playback before reporting. Initial and ready-time seeking plus periodic position checks repair late joins and buffering drift.

## Watchdog and remaining limits

Human streams use the room watchdog. NPC streams transfer timing ownership to `NpcDjManager`; queue helpers clear and rearm the room watchdog consistently across starts and stops.

Durations are still client supplied and bounded to five seconds through four hours; unknown duration uses the existing ten-minute watchdog fallback. These bounds do not establish actual YouTube duration. Authoritative metadata, unavailable-embed recovery, and finite-track versus live-stream behavior remain separate follow-up work.

Private snapshots rely on ordered room transport and full reconnect recovery. Playlist edit revisions/acknowledgments are not implemented. Browser playback of real YouTube embeds still depends on autoplay, buffering, and provider availability.

## File map and verification

- `types/RoomState.ts`: public schemas and server-only player playlist.
- `server/src/rooms/commands/djHelpers.ts`: selection, looping, playback transitions, private snapshot delivery.
- `server/src/rooms/commands/DJQueueCommand.ts`: player commands and completion guards.
- `server/src/rooms/commands/RoomQueuePlaylistCommand.ts`: private playlist edits.
- `server/src/rooms/ClubMutant.ts`: watchdog, clock replies, periodic snapshots, reconnect recovery.
- `server/src/rooms/NpcDjManager.ts`: NPC queue participation, movement, and track timer.
- `client-3d/src/network/messages/musicHandlers.ts`: playback notification/schema/snapshot reconciliation.
- `client-3d/src/network/TimeSync.ts`: clock estimate and lifecycle.
- `client-3d/src/ui/NowPlaying.tsx`: audio player and immutable completion ownership.
- `client-3d/src/ui/DjQueuePanel.tsx`: playlist and current-track highlighting.

Server regressions cover mixed playlist lengths/NPC replenishment, empty-head leave, stopped completion, duplicate completion/skip, private watchdog updates, and explicit reset/reordered selection. Integration coverage drops and reconnects an actual WebSocket while playback is stopped and a private playlist changes. Client regressions cover stale notifications and schema ordering, stopped-state recovery, clock skew/sample aging, timer cleanup, and old same-URL completion callbacks.
