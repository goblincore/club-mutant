# Multiplayer Connection Strategy and Optimization

## Overview

The Club Mutant 3D environment utilizes Colyseus for real-time multiplayer synchronization. Based on recent performance optimizations, the connection logic has been refined to minimize loading times, prevent UI thread locking during joins, and limit the size of the initial sync payload.

## Lazy-Loaded Room Discovery

To prevent unnecessary WebSocket handshake overhead and avoid making concurrent connections when the app first loads, the Colyseus `LobbyRoom` is **lazy-loaded**.

- **Previous Flow:** `NetworkManager` automatically instantiated a WebSocket connection to the built-in `LobbyRoom` inside its constructor immediately upon launching the client. If a user was joining the global room or connecting via a direct URL link, this resulted in two sockets opened at once.
- **Current Flow:** The `LobbyRoom` connection is deferred until explicitly requested via `NetworkManager.ensureLobbyJoined()`. This is triggered via the Lobby UI only when the user selects "Custom Rooms" to view the Room Server Browser.

## State Payload Limits

Colyseus syncs state automatically. `ArraySchema` and `MapSchema` payloads can balloon quickly if large collections are synchronized to late-joining clients, causing long "Connecting..." hangs or frame drops.

### Implemented Safeguards:
1. **Chat History (`chatMessages`):** The server explicitly limits the `chatMessages` ArraySchema to a maximum of **25 messages**. Older messages are shifted out.
2. **Jukebox Playlist (`jukeboxPlaylist`):** The shared Jukebox queue (`musicMode: jukebox | personal`) is capped at a maximum of **50 tracks**. Further `JUKEBOX_ADD` commands are rejected until tracks are completed or removed.

## Instant 3D Spawning

The legacy 2D room implementation relied on a default starting coordinate of `(705, 500)`. When migrating to 3D, this default caused new joiners to rapidly flash at these legacy coordinates before the client could send a `(0,0)` position update via `Message.UPDATE_PLAYER_ACTION`.

- **Client Implementation:** The client now dictates the starting coordinate explicitly within the `joinOrCreate` or `joinById` options using the `spawnX` and `spawnY` fields. (Usually set to `0, 0`).
- **Server Implementation:** `ClubMutant.ts` reads `spawnX` and `spawnY` directly inside the `onJoin` lifecycle hook. If present, it bypasses the legacy `705, 500` fallback completely.
- **Result:** Complete removal of the client-side `setTimeout` (`freshRemotes`) hacks that previously attempted to suppress listen updates for the first 300ms of a connection. Players appear exactly where they should be instantaneously upon schema synchronization.
