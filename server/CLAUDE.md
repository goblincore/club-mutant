# server

Colyseus 0.17 game server. Authoritative multiplayer state.

## Structure

- `src/index.ts` — Server entry point, Express + Colyseus setup
- `src/rooms/ClubMutant.ts` — Main room class. All message handlers and game logic live here
- State schema lives in `@club-mutant/types/RoomState` (shared with client — single source of truth, no interface mirror)
- `src/rooms/commands/` — Command pattern handlers dispatched from ClubMutant.ts:
  - `DJQueueCommand.ts` — DJ queue join/leave/play/stop/skip
  - `MusicBoothUpdateCommand.ts` — Booth connect/disconnect
  - `JukeboxCommand.ts` — Jukebox add/remove/play/skip
  - `RoomQueuePlaylistCommand.ts` — Room playlist management
  - `ChatMessageUpdateCommand.ts` — Chat messages
  - `PlayerUpdateActionCommand.ts` — Player actions/animations
  - `PlayerUpdateNameCommand.ts` — Name changes
  - `PunchPlayerCommand.ts` — Player interactions
- `src/lib/verifyNakamaToken.ts` — JWT verification against Nakama
- `src/youtubeService.ts` — YouTube API integration
- `src/Queue.js` — Queue utility

## Key Patterns

### Adding a new message handler
1. Define message enum in `types/Messages.ts`
2. In `ClubMutant.ts` `onCreate()`, add: `this.onMessage(Message.YOUR_MSG, (client, data) => { ... })`
3. For complex logic, create a Command class in `src/rooms/commands/` and dispatch via `this.dispatcher.dispatch(new YourCommand(), { ... })`

### Adding new server state
1. Define a new Schema class or field in `types/RoomState.ts` (shared package)
2. Server and client-3d both consume this file directly — no separate interface needed
3. State changes auto-sync to all clients via Colyseus

### NPC (Lily bartender)
NPC logic is in `ClubMutant.ts` — spawned as a synthetic player, wanders the bar area, proxies chat to the `dream-npc-go` service via HTTP.

## Build

```bash
pnpm dev    # tsup watch mode
pnpm build  # Production build
```

## Environment Variables
- `NAKAMA_ENCRYPTION_KEY` — Required for JWT verification
- `DREAM_NPC_SERVICE_URL` — NPC service endpoint (default: http://localhost:4000)
