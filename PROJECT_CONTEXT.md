# Club Mutant (SkyOffice fork) — Project Context

This file is a high-signal, “get back up to speed fast” reference for the `goblincore/club-mutant` codebase.

## What this project is

- A multiplayer 2D top-down Phaser game (client) with a Colyseus authoritative server.
- React/Redux overlays provide UI (playlist, YouTube player, chat UI, etc.).
- Real-time player state sync is done via Colyseus Schema (`OfficeState`) + `player.onChange` events.

## Repo layout

- `client/`
  - Phaser game code: `client/src/scenes`, `client/src/characters`, `client/src/items`
  - React UI: `client/src/components`
  - Redux stores: `client/src/stores`
  - Client networking: `client/src/services/Network.ts`
  - Assets: `client/public/assets`
- `server/`
  - Colyseus rooms: `server/rooms/*`
  - Main room: `server/rooms/SkyOffice.ts`
  - Schema state: `server/rooms/schema/OfficeState.ts`
  - Commands: `server/rooms/commands/*`
- `types/`
  - Shared message enums + schema interfaces consumed by both client/server

## How to run

- Server: `npm run start`
  - Runs `server/index.ts` via `ts-node-dev` (see root `package.json`).
- Client: run from `client/` (there is a separate `client/package.json`).

## Core runtime model

### Colyseus state

- The authoritative room state is `OfficeState` (`server/rooms/schema/OfficeState.ts`).
- Relevant collections:
  - `players`: `MapSchema<Player>`
  - `musicBooths`: `ArraySchema<MusicBooth>`
  - `roomPlaylist`: `ArraySchema<RoomPlaylistItem>`
  - `musicStream`: `MusicStream`

### Client receives state

- `client/src/services/Network.ts`
  - Joins room, wires listeners.
  - `this.room.state.players.onAdd` registers `player.onChange` and emits Phaser events.
  - The Phaser scene listens to those events and updates in-world entities.

### Player animation sync

- Server stores each player’s current animation string in `players[*].anim`.
- Client `MyPlayer` must call:
  - `network.updatePlayerAction(x, y, animKey)`
    so other clients receive it.
- Other clients render it via:
  - `client/src/characters/OtherPlayer.ts` → `updateOtherPlayer('anim', animKey)` → `this.anims.play(animKey, true)`.

## Public lobby: skip login + force Mutant identity

Public lobby differs from custom/private rooms:

- **Goal**
  - Skip avatar/name selection UI
  - Always use the Mutant character (`adam`)
  - Auto-assign a unique username that contains `mutant`

- **Server enforcement (authoritative)**
  - `server/index.ts` passes `isPublic: true` to the public room create options.
  - `types/Rooms.ts` includes `isPublic?: boolean` on `IRoomData`.
  - `server/rooms/SkyOffice.ts`:
    - Stores `this.isPublic`.
    - On `onJoin`, if public:
      - Sets `player.name = mutant-${client.sessionId}` (unique per connection)
      - Sets `player.anim = adam_idle_down`
    - Ignores `Message.UPDATE_PLAYER_NAME` when public.
    - Sanitizes `Message.UPDATE_PLAYER_ACTION` animation keys to `adam_*` when public.

- **Client behavior**
  - Tracks `roomType` in Redux:
    - `client/src/stores/RoomStore.ts` adds `roomType` + `setJoinedRoomType`.
    - `client/src/services/Network.ts` dispatches `setJoinedRoomType(RoomType.PUBLIC|CUSTOM)`.
  - Public auto-login is executed in Phaser (reliable timing):
    - `client/src/scenes/Game.ts` `create()` sets:
      - `myPlayer` texture to `adam`
      - `myPlayer` name to `mutant-${sessionId}`
      - calls `network.readyToConnect()`
      - dispatches `setLoggedIn(true)` so Chat/Playlist UI renders
  - `client/src/components/LoginDialog.tsx` returns empty for public rooms (no UI).

## Music + room playlist (current implementation)

### The concept

There are two parallel playback modes:

1. **Per-DJ / per-player short queue** (legacy)
   - Uses `MusicStreamNextCommand` and the player’s `nextTwoPlaylist`.
2. **Room playlist playback** (shared)
   - Uses `state.roomPlaylist` as a persistent list.
   - Uses `musicStream.isRoomPlaylist` + `musicStream.roomPlaylistIndex` to indicate the active item.

### Server-side room playlist behavior

- `server/rooms/SkyOffice.ts`
  - `ROOM_PLAYLIST_ADD`: append a `RoomPlaylistItem`.
  - `ROOM_PLAYLIST_REMOVE`: remove only if `addedBySessionId === client.sessionId`.
    - Also adjusts `musicStream.roomPlaylistIndex` so the cursor stays stable.
  - `ROOM_PLAYLIST_PLAY`: starts playback at current cursor (`roomPlaylistIndex`), DJ-only.
  - `ROOM_PLAYLIST_SKIP`: advances cursor by +1 and starts playback, DJ-only.
    - **Non-destructive:** does _not_ remove tracks from `roomPlaylist`.
  - Auto-start: on `CONNECT_TO_MUSIC_BOOTH`, if the room playlist has items and stream is idle, it starts playback.

### Client-side playback + UI

- Playback surface:
  - `client/src/components/YoutubePlayer.tsx` renders a `ReactPlayer`.
  - `onEnded`:
    - If `isRoomPlaylist` and you are the current DJ, it calls `skipRoomPlaylist()`.

- Stream metadata flow:
  - Server broadcasts `Message.START_MUSIC_STREAM` with `musicStream`.
  - `client/src/services/Network.ts` forwards to Phaser via `Event.START_PLAYING_MEDIA`.
  - `client/src/scenes/Game.ts` handles it and dispatches to Redux:
    - `setMusicStream({ url, title, currentDj, startTime, isRoomPlaylist, roomPlaylistIndex })`

- UI rendering:
  - `YoutubePlayer.tsx` shows `Play` and `Skip` buttons.
  - The room playlist list highlights the active track when:
    - `musicStream.isRoomPlaylist === true` and `index === musicStream.roomPlaylistIndex`.

## DJ booth (music booth) behavior

### Entering/leaving

- Item: `client/src/items/MusicBooth.ts`
  - `openDialog()` opens the playlist UI and sends `CONNECT_TO_MUSIC_BOOTH`.
  - `closeDialog()` closes UI and sends `DISCONNECT_FROM_MUSIC_BOOTH`.

- Player interaction:
  - `client/src/characters/MyPlayer.ts`
  - Press `R` near booth:
    - Connects + opens playlist panel.
    - Switches player behavior to sitting.

### DJ “boombox” animation

- Asset:
  - `client/public/assets/character/MutantBoomboxTest.png`

- Bootstrapping:
  - `client/src/scenes/Bootstrap.ts` preloads the spritesheet with frame size `60x88`.

- Animation creation:
  - `client/src/anims/CharacterAnims.ts` creates `adam_boombox` (frames 0–11), repeat `-1`, frameRate `animsFrameRate * 0.5`.

- Local + network sync:
  - When entering booth:
    - `MyPlayer` plays `adam_boombox` and calls `network.updatePlayerAction(..., 'adam_boombox')`.
  - When leaving booth:
    - `MyPlayer` plays idle and calls `network.updatePlayerAction(..., idleAnimKey)`.

- Other players:
  - `OtherPlayer` plays the synced anim key.
  - If `currentAnimKey === 'adam_boombox'`, it forces high depth so the DJ renders above the booth.

## Important files (high touch)

- **Networking**: `client/src/services/Network.ts`
- **Main Phaser scene**: `client/src/scenes/Game.ts`
- **Player entities**:
  - `client/src/characters/MyPlayer.ts`
  - `client/src/characters/OtherPlayer.ts`
- **Music server logic**: `server/rooms/SkyOffice.ts`
- **Server state schema**: `server/rooms/schema/OfficeState.ts`
- **Client UI playback**: `client/src/components/YoutubePlayer.tsx`
- **Shared message enum**: `types/Messages.ts`

## Conventions / tips

- Animation keys are plain strings like `adam_idle_down`, `adam_boombox`.
- If you change a player animation locally and want others to see it, you must update `player.anim` via `Network.updatePlayerAction(...)`.
- For shared state, prefer adding explicit fields to the server schema + shared interfaces in `types/` and use those on the client.

## Recent noteworthy commits (Jan 2026)

- Added DJ boombox spritesheet + animation + slowed playback.
- Room playlist changed to be non-destructive, index-based playback.
- Added Play button + auto-start on DJ connect + active-track highlight.
- Synced DJ boombox animation to other players via `updatePlayerAction`.
- Public lobby: skip login, server-enforced mutant identity, and reliable auto-login in `Game.create()`.
