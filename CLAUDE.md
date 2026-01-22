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
  - `ROOM_PLAYLIST_PREV`: moves cursor by -1 and starts playback (clamped at 0), DJ-only.
  - Auto-start: on `CONNECT_TO_MUSIC_BOOTH`, if the room playlist has items and stream is idle, it starts playback.

### Client-side playback + UI

- Playback surface:
  - `client/src/components/YoutubePlayer.tsx` renders a `ReactPlayer`.
  - `onEnded`:
    - If `isRoomPlaylist` and you are the current DJ, it calls `skipRoomPlaylist()`.

- Minimized DJ bar:
  - `YoutubePlayer.tsx` can be minimized into a small top-left bar.
  - Shows a marquee track title + minimal prev/play-pause/next controls.
  - The underlying `ReactPlayer` stays mounted while minimized (audio continues).

- Stream metadata flow:
  - Server broadcasts `Message.START_MUSIC_STREAM` with `musicStream`.
  - `client/src/services/Network.ts` forwards to Phaser via `Event.START_PLAYING_MEDIA`.
  - `client/src/scenes/Game.ts` handles it and dispatches to Redux:
    - `setMusicStream({ url, title, currentDj, startTime, isRoomPlaylist, roomPlaylistIndex, videoBackgroundEnabled })`

- UI rendering:
  - `YoutubePlayer.tsx` shows `Play` and `Skip` buttons.
  - The room playlist list highlights the active track when:
    - `musicStream.isRoomPlaylist === true` and `index === musicStream.roomPlaylistIndex`.

### DJ-synced fullscreen video background

The DJ can toggle the current YouTube stream as a fullscreen background for everyone:

- **Server state**: `musicStream.videoBackgroundEnabled` (Colyseus schema)
- **Message**: `Message.SET_VIDEO_BACKGROUND` (DJ-only; booth connected user)
- **Client rendering**:
  - `client/src/App.tsx` portals a muted `ReactPlayer` fullscreen behind Phaser when enabled.
  - Background video is forced to stretch/distort to cover the full viewport.

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
  - `client/public/assets/character/MutantBoomboxTest2.gif`

- Bootstrapping:
  - `client/src/scenes/Bootstrap.ts` preloads the spritesheet with frame size `72x105`.

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

### DJ “desk” / djmutant3 animation (public room)

- Asset:
  - `client/public/assets/character/djmutant3-solo-2.gif`
  - Dimensions: `376x704` (2 columns x 6 rows)
  - Frame size: `188x117`

- Desk (booth) asset:
  - `client/public/assets/items/thinkpaddesk.gif` (loaded under key `musicBooths`)

- Bootstrapping:
  - `client/src/scenes/Bootstrap.ts` preloads the spritesheet under key `adam_djwip`.

- Animation creation:
  - `client/src/anims/CharacterAnims.ts` creates `adam_djwip` (frames `0..4`), repeat `-1`.
  - Frame rate is intentionally slower than the base anim rate (`animsFrameRate * 0.25`).

- Local + network sync:
  - `MyPlayer` uses `adam_djwip` when entering the booth in public rooms and calls `network.updatePlayerAction(..., 'adam_djwip')`.

- Desk visibility:
  - The booth sprite is treated as a placeholder “desk”.
  - The desk stays visible even while a DJ is active.

### DJ transform transition (enter + exit)

- Asset:
  - `client/public/assets/character/dj-transform.png`
  - Frame size: `90x140` (3 columns x 2 rows)

- Animation keys:
  - `adam_transform` (frames `0..5`, repeat `0`, frameRate `animsFrameRate * 0.5`)
  - `adam_transform_reverse` (frames `5..0`, repeat `0`, frameRate `animsFrameRate * 0.5`)

- Entering the booth (press `R`):
  - `MyPlayer` snaps the player to a booth “stand spot” and forces facing down.
  - Plays `adam_transform` once, then switches to the booth anim (`adam_djwip` in public rooms, otherwise `adam_boombox`).
  - Sync is done by calling `network.updatePlayerAction(..., animKey)` for both the transform and the final booth anim.

- Leaving the booth (press `R` again):
  - Plays `adam_transform_reverse` once, then switches back to `${playerTexture}_idle_down` and restores movement.
  - Reverse transition is also synced via `network.updatePlayerAction`.

- Depth ordering:
  - DJ + transform animations render behind the desk:
    - `MyPlayer` uses `this.setDepth(musicBooth.depth - 1)` on booth entry.
    - `OtherPlayer` uses `this.setDepth(this.y - 1)` when `anim` is `adam_djwip` / `adam_transform` / `adam_transform_reverse`.

### Player collision + DJ hitbox gotchas

- Player-vs-player collision is Arcade physics (`this.physics.add.collider(this.myPlayer, this.otherPlayers)` in `Game`).
- Remote players are `OtherPlayer` instances, driven by server-synced positions.
- The DJ animation frames include the whole desk/table, so collision cannot be frame-wide.
  - `client/src/characters/Player.ts` implements a special DJ-only “feet” hitbox in `updatePhysicsBodyForAnim()`.
  - It uses a narrow, low hitbox and anchors it using a right-edge reference so it can be widened leftward.

- The transform animations (`adam_transform`, `adam_transform_reverse`) are treated like DJ anims for collision sizing.

- Late-join collision mismatch:
  - When an `OtherPlayer` is spawned with `newPlayer.anim` already set (e.g. DJ), `Game.handlePlayerJoined()` must call:
    - `otherPlayer.updatePhysicsBodyForAnim(newPlayer.anim)`
      otherwise the initial hitbox stays in the default shape until the next `anim` change.

### DJ chat bubble scaling

- `Player.updateDialogBubble(content, scale)` supports scaling.
- The DJ bubble is rendered at `1.5x` scale (both for local and remote):
  - `client/src/scenes/Game.ts` determines whether a message sender is the DJ.
  - `client/src/components/ChatPanel.tsx` also scales the local immediate bubble (since it renders before the server echo).

## Recent learnings / gotchas (Jan 2026)

- **Booth occupancy must be replayed on join**
  - `Network.onItemUserAdded()` replays any already-occupied `musicBooths[*].connectedUser` when registering the listener.
  - This prevents late joiners from seeing the placeholder desk when the booth is already occupied.

- **Colyseus 0.16 state listeners: use the root callback proxy**
  - Colyseus `0.16.x` replaced the old `onChange` ergonomics with `getStateCallbacks(room)`.
  - To avoid “connected but not syncing” / missed events, prefer:
    - `const stateCallbacks = getStateCallbacks(room)(room.state)`
    - `stateCallbacks.players.onAdd(...)`, `stateCallbacks.chatMessages.onAdd(...)`, etc.
  - Avoid wiring listeners directly off `callbacks(room.state.players)` during `initialize()`. On first join, the initial patch can land after listeners are registered, and the underlying collection reference can be in an incomplete/transition state.

- **Colyseus 0.16 timing: don’t read nested schema fields during join**
  - Right after `joinOrCreate`, `room.state.musicStream` / `room.state.roomPlaylist` may be temporarily `undefined` before the first patch.
  - Fix pattern:
    - Default Redux/UI state to safe values
    - Listen via `stateCallbacks.musicStream.listen(...)` and resync once fields arrive

- **Avoid “toggle debug anim” drift**
  - Keeping a single authoritative DJ anim key (`adam_djwip`) avoids hitbox/asset confusion.

- **Fullscreen YouTube background styling lives in React (not Phaser)**
  - `client/src/App.tsx` uses a portal to render a fullscreen `ReactPlayer` behind Phaser.
  - The background is styled with:
    - `mix-blend-mode: hard-light` on the `iframe`
    - dark overlay + scanlines via `::before`/`::after`
    - zoom/crop by rendering the iframe at ~`200%` and centering it (overflow hidden)

- **Schema collections: mutate in-place (don’t replace) to preserve `$changes`**
  - Avoid assigning a new array to a Schema collection (e.g. `state.musicBoothQueue = state.musicBoothQueue.filter(...)`).
  - Use in-place ops instead (reverse loop + `splice`, `shift()` + `push()`) so Colyseus change tracking stays intact.
  - Replacing collections can lead to server crashes like `Cannot read properties of undefined (reading '$changes')`.

- **Vite + colyseus.js: force browser httpie implementation**
  - Without an alias, Vite may pull `@colyseus/httpie/node` which depends on Node-only `url.parse` and breaks the client build.
  - Fix in `client/vite.config.ts`:
    - `resolve.alias['@colyseus/httpie'] = '@colyseus/httpie/xhr'`

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

## Current tasks

- Fix dev duplication: prevent multiple Phaser/Network instances (multiple connects / duplicated chat) under Vite HMR/refresh
- Implement shared Room Playlist (server-authoritative, remove-own-only)
- Stabilize legacy music booth/music stream code to prevent server errors during transition
- Replace random-spawned pathfinding obstacles with Tiled-placed items (chairs/vending) + proper item classes/object layers
- Pathfinding improvements: diagonal movement + corner-cutting rules + waypoint smoothing
- Cache walkability grid (and expanded clearance grid) instead of rebuilding each click; recompute only when map/obstacles change
- Add path debug rendering (waypoints/polyline and optionally blocked tiles overlay) for easier tuning
- Get client TypeScript build (tsc) passing under Vite (fix nullable Phaser tilemap layer types, etc.)
- Investigate 'playlist videos not playing' (defer until new playback pipeline lands)

## Recent noteworthy commits (Jan 2026)

- Added DJ boombox spritesheet + animation + slowed playback.
- Room playlist changed to be non-destructive, index-based playback.
- Added Play button + auto-start on DJ connect + active-track highlight.
- Added room playlist previous-track control (`ROOM_PLAYLIST_PREV`).
- Added minimized DJ playlist bar with marquee + minimal controls.
- Added DJ-synced fullscreen YouTube video background toggle.
- Synced DJ boombox animation to other players via `updatePlayerAction`.
- Public lobby: skip login, server-enforced mutant identity, and reliable auto-login in `Game.create()`.
