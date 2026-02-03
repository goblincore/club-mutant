# Club Mutant (SkyOffice fork) — Project Context

This file is a high-signal, “get back up to speed fast” reference for the `goblincore/club-mutant` codebase.

## What this project is

-
- A multiplayer 2D top-down Phaser game (client) with a Colyseus authoritative server that is about playing and listening to music together in the form of playlists and 'dj' sessions. Kind of like turntable.fm (now defunct).
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
  - Main room: `server/rooms/ClubMutant.ts`
  - Schema state: `server/rooms/schema/OfficeState.ts`
  - Commands: `server/rooms/commands/*`
- `types/`
  - Shared message enums + schema interfaces consumed by both client/server
  - Shared DTOs (plain JSON payload contracts): `types/Dtos.ts`

## How to run

- Server: `npm run start`
  - Runs `server/index.ts` via `ts-node-dev` (see root `package.json`).
- Client: run from `client/` (there is a separate `client/package.json`).

### Tooling note (TypeScript)

- Some transitive deps (notably `ioredis@5` via Colyseus redis packages) ship TypeScript declaration syntax that is not parseable by older `typescript` versions.
- If `tsc` outputs huge numbers of parse errors originating from `node_modules/ioredis/*`, upgrade the root toolchain (`typescript`, `ts-node`, `ts-node-dev`).

## Core runtime model

## Type model (Schema vs Interfaces vs DTOs)

This repo uses a **hybrid type model** to keep Colyseus runtime state (Schema) separate from the network payload contracts.

### 1) Server runtime state (Colyseus Schema classes)

- File: `server/rooms/schema/OfficeState.ts`
- These are the authoritative state containers.
- **Do not** make Schema classes `implement` shared `I*` interfaces (TypeScript structural mismatches with Colyseus internal Schema fields).

### 2) Client room state typing (Schema-shaped interfaces)

- File: `types/IOfficeState.ts`
- These interfaces extend `Schema` and are intended for typing `Room<IOfficeState>` on the client.
- Treat these as “Schema-shaped types”, not as network payload DTOs.

### 3) Wire payload contracts (DTOs)

- File: `types/Dtos.ts`
- DTOs are **plain JSON** (no Schema inheritance) and are used for:
  - `Room.send(...)` payloads
  - server `onMessage(...)` payload typing
  - dispatcher/command payload typing

Rule of thumb:

- Use **Schema** for authoritative room state.
- Use **`IOfficeState` interfaces** for client-side typing of `room.state`.
- Use **DTOs** for anything that crosses the network boundary.

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

#### Chat bubbles (in-world)

- Chat history is stored in `state.chatMessages` (Colyseus schema) and is used for the chat log UI.
- In-world bubbles are driven by a Phaser event:
  - `Event.UPDATE_DIALOG_BUBBLE`
- Server broadcasts `Message.ADD_CHAT_MESSAGE` with `{ clientId, content }` to other clients.
- Client `Network.ts` listens for that broadcast and emits `Event.UPDATE_DIALOG_BUBBLE` so `Game.ts` can call `Player.updateDialogBubble(...)` on the correct entity.

### Player animation sync

- Server stores each player’s current animation state as compact numeric IDs:
  - `players[*].textureId` (`uint8`)
  - `players[*].animId` (`uint8`, packed kind+direction or special ids)
- The shared codec lives in:
  - `types/AnimationCodec.ts`
- Client `MyPlayer` still calls:
  - `network.updatePlayerAction(x, y, animKey)`
    but `Network.ts` encodes the string key into `{ textureId, animId }` before sending.
- Other clients render it by decoding ids back into an anim key:
  - `Network.ts` decodes `{ textureId, animId }` → `animKey` and emits `Event.PLAYER_UPDATED` with field `anim`.
  - `client/src/characters/OtherPlayer.ts` consumes that and plays `this.anims.play(animKey, true)`.

## Public lobby: skip login + force Mutant identity

Public lobby differs from custom/private rooms:

- **Goal**
  - Skip avatar/name selection UI
  - Always use the Mutant character
  - Auto-assign a unique username that contains `mutant`

- **Server enforcement (authoritative)**
  - Room id: `RoomType.PUBLIC = 'clubmutant'` (`types/Rooms.ts`).
  - `server/index.ts` passes `isPublic: true` to the public room create options.
  - `types/Rooms.ts` includes `isPublic?: boolean` on `IRoomData`.
  - `server/rooms/ClubMutant.ts`:
    - Stores `this.isPublic`.
    - On `onJoin`, if public:
      - Sets `player.name = mutant-${client.sessionId}` (unique per connection)
      - Sets `player.textureId = TEXTURE_IDS.mutant` + `player.animId = packDirectionalAnimId('idle', 'down')`
    - Ignores `Message.UPDATE_PLAYER_NAME` when public.
    - Forces `Message.UPDATE_PLAYER_ACTION` to `mutant` IDs when public.

- **Client behavior**
- Tracks `roomType` in Redux:
  - `client/src/stores/RoomStore.ts` adds `roomType` + `setJoinedRoomType`.
  - `client/src/services/Network.ts` dispatches `setJoinedRoomType(RoomType.PUBLIC|CUSTOM)`.
- Public auto-login is executed in Phaser (reliable timing):
  - `client/src/scenes/Game.ts` `create()` sets:
    - `myPlayer` texture to `mutant`
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

### My playlists (client-side, local)

- The player also has a local playlist UI, stored in Redux and persisted to localStorage.
- Store: `client/src/stores/MyPlaylistStore.ts`
  - State uses a multi-playlist model:
    - `playlists: { id, name, items: PlaylistItem[] }[]`
    - `activePlaylistId: string | null`
  - Persistence key: `club-mutant:my-playlist:v1` (see `client/src/stores/index.ts`).
  - Migration: legacy persisted `PlaylistItem[]` arrays are migrated into a single playlist (`id: legacy`).

- UI: `client/src/components/MyPlaylistPanel.tsx`
  - Home view lists playlists and supports creating a new playlist.
  - Detail view has tabs:
    - `Tracks`: show tracks with remove + drag-and-drop reorder.
    - `Search`: search YouTube and add results to the active playlist.
    - `Link`: paste a YouTube URL, extract a video id client-side, and add a placeholder track (metadata resolution is pending).
  - Empty state: when a playlist has no tracks, `Tracks` shows a prompt to add via Search or Link.
  - Input safety: while the playlist panel is open, Phaser scene input is disabled to prevent movement/hotkeys while typing.

### Server-side room playlist behavior

- `server/rooms/ClubMutant.ts`
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
  - Background video is rendered by Phaser using `phaser3-rex-plugins` YouTube player (`DOMElement`)
    - `client/src/scenes/Game.ts` creates `MyYoutubePlayer` and controls it on stream start/stop.
    - **Do not call** `setElement(...)` on the rex player (it interferes with internal DOM/iframe creation).
    - Autoplay reliability: call `setMute(true)` before `play()`.

- **Input safety**:
  - `pointer-events: none` is applied so the iframe never blocks gameplay input.

- **Event wiring / race condition fixes**:
  - `Event.VIDEO_BACKGROUND_ENABLED_CHANGED` was added so Phaser can react when the background toggle changes
    while a stream is already playing (no need to wait for the next `START_MUSIC_STREAM`).
  - `Game.create()` includes a late-join resync (delayed) to load the background for players who join
    after playback has already started.

- **Layering: video behind the game**
  - Phaser DOM Elements live in a DOM container overlay (not inside WebGL). To place the YouTube video
    behind game sprites, CSS sets the Phaser DOM container below the canvas:
    - `client/src/index.scss`: `canvas { z-index: 1 }` and `#phaser-container > div { z-index: 0 }`.
  - To avoid washed-out VHS visuals when the canvas is transparent, the VHS final pass uses a hard alpha
    mask (opaque where the game draws, fully transparent elsewhere).

Safari notes:

- Autoplay is not guaranteed even when muted; the background renderer provides a user-gesture fallback ("Enable background video").
- Background video does a light resync (seek + play) on enable and tab resume (visibility/focus/pageshow); it does not run the heavier drift-correction loop used for the main audio player.

## DJ booth (music booth) behavior

### Entering/leaving

- Item: `client/src/items/MusicBooth.ts`
  - `openDialog()` opens the playlist UI and sends `CONNECT_TO_MUSIC_BOOTH`.
  - `closeDialog()` closes UI and sends `DISCONNECT_FROM_MUSIC_BOOTH`.

- **Gotcha (server-side booth occupancy)**:
  - `MusicBooth.connectedUser` is a `@type('string')` schema field.
  - Treat both `null` and `''` as "empty".
  - Otherwise a booth can get stuck "occupied" after a disconnect and prevent anyone else from becoming DJ.

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
  - `client/src/anims/CharacterAnims.ts` creates `mutant_boombox` (frames 0–11), repeat `-1`, frameRate `animsFrameRate * 0.5`.

- Local + network sync:
  - When entering booth:
    - `MyPlayer` plays `mutant_boombox` and calls `network.updatePlayerAction(..., 'mutant_boombox')`.
  - When leaving booth:
    - `MyPlayer` plays idle and calls `network.updatePlayerAction(..., idleAnimKey)`.

- Other players:
  - `OtherPlayer` plays the synced anim key.
  - If `currentAnimKey === 'mutant_boombox'`, it forces high depth so the DJ renders above the booth.

### DJ “desk” / djmutant3 animation (public room)

- Asset:
  - `client/public/assets/character/djmutant3-solo-2.gif`
  - Dimensions: `376x704` (2 columns x 6 rows)
  - Frame size: `188x117`

- Desk (booth) asset:
  - `client/public/assets/items/thinkpaddesk.gif` (loaded under key `musicBooths`)

- Bootstrapping:
  - `client/src/scenes/Bootstrap.ts` preloads the spritesheet under key `mutant_djwip`.

- Animation creation:
  - `client/src/anims/CharacterAnims.ts` creates `mutant_djwip` (frames `0..4`), repeat `-1`.
  - Frame rate is intentionally slower than the base anim rate (`animsFrameRate * 0.25`).

- Local + network sync:
  - `MyPlayer` uses `mutant_djwip` when entering the booth in public rooms and calls `network.updatePlayerAction(..., 'mutant_djwip')`.

- Desk visibility:
  - The booth sprite is treated as a placeholder “desk”.
  - The desk stays visible even while a DJ is active.

### DJ transform transition (enter + exit)

- Asset:
  - `client/public/assets/character/dj-transform.png`
  - Frame size: `90x140` (3 columns x 2 rows)

- Animation keys:
  - `mutant_transform` (frames `0..5`, repeat `0`, frameRate `animsFrameRate * 0.5`)
  - `mutant_transform_reverse` (frames `5..0`, repeat `0`, frameRate `animsFrameRate * 0.5`)

- Entering the booth (press `R`):
  - `MyPlayer` snaps the player to a booth “stand spot” and forces facing down.
  - Plays `mutant_transform` once, then switches to the booth anim (`mutant_djwip` in public rooms, otherwise `mutant_boombox`).
  - Sync is done by calling `network.updatePlayerAction(..., animKey)` for both the transform and the final booth anim.

- Leaving the booth (press `R` again):
  - Plays `mutant_transform_reverse` once, then switches back to `${playerTexture}_idle_down` and restores movement.
  - Reverse transition is also synced via `network.updatePlayerAction`.

- Depth ordering:
  - DJ + transform animations render behind the desk:
    - `MyPlayer` uses `this.setDepth(musicBooth.depth - 1)` on booth entry.
    - `OtherPlayer` uses `this.setDepth(this.y - 1)` when `anim` is `mutant_djwip` / `mutant_transform` / `mutant_transform_reverse`.

### Player collision + DJ hitbox gotchas

- Player-vs-player collision is Arcade physics (`this.physics.add.collider(this.myPlayer, this.otherPlayers)` in `Game`).
- Remote players are `OtherPlayer` instances, driven by server-synced positions.
- The DJ animation frames include the whole desk/table, so collision cannot be frame-wide.
  - `client/src/characters/Player.ts` implements a special DJ-only “feet” hitbox in `updatePhysicsBodyForAnim()`.
  - It uses a narrow, low hitbox and anchors it using a right-edge reference so it can be widened leftward.

- The transform animations (`mutant_transform`, `mutant_transform_reverse`) are treated like DJ anims for collision sizing.

- Late-join collision mismatch:
  - When an `OtherPlayer` is spawned while already in a DJ/transform anim, `Game.handlePlayerJoined()` must ensure it applies the correct hitbox sizing immediately.
  - Current pattern: `Game.handlePlayerJoined()` decodes `textureId/animId` to an anim key and calls `otherPlayer.updateOtherPlayer('anim', animKey)`.

### DJ chat bubble scaling

- `Player.updateDialogBubble(content, scale)` supports scaling.
- The DJ bubble is rendered at `1.5x` scale (both for local and remote):
  - `client/src/scenes/Game.ts` determines whether a message sender is the DJ.
  - `client/src/components/ChatPanel.tsx` also scales the local immediate bubble (since it renders before the server echo).

## Recent learnings / gotchas (Jan 2026)

### Bandwidth + server correctness refactors

- **Compact player animation replication**
  - Migrated from string `players[*].anim` to `{ textureId:uint8, animId:uint8 }` using `types/AnimationCodec.ts`.
  - Server: `server/rooms/schema/OfficeState.ts` (`Player.textureId/animId`).
  - Client: `Network.ts` encodes outgoing anim keys and decodes incoming ids back to anim keys for `OtherPlayer`.

- **Movement validation + throttling**
  - `Message.UPDATE_PLAYER_ACTION` is throttled (min interval) and validates max travel distance based on dt.

- **Graceful leave / reconnection**
  - `ClubMutant.onLeave` uses `allowReconnection(...)` with a grace window so transient disconnects can recover.

- **MyPlayer movement/animation stability**
  - Mutant uses isometric `up_left/up_right` (no `*_run_up`).
  - Added snapping/advance for close waypoints and a small vx deadzone to prevent micro-jitter between `up_left` and `up_right`.

### VHS PostFX (Shadertoy port)

- **Implementation**
  - Post-process shader is implemented as a Phaser WebGL `PostFXPipeline`:
    - `client/src/pipelines/VhsPostFxPipeline.ts`
  - Pipeline registration happens once in:
    - `client/src/scenes/Bootstrap.ts`
  - Toggle hotkey lives in:
    - `client/src/scenes/Game.ts` (key: `V`)

- **Key WebGL gotchas encountered**
  - **Render targets do not have mipmaps**
    - The Shadertoy source uses `texture(iChannelX, uv, bias)` (LOD bias).
    - Sampling Phaser render targets with LOD bias can return black.
    - Fix: in the port, `tex2DBias(...)` always samples LOD0 via `texture2D(...)`.
  - **Framebuffer / texture feedback loops**
    - Symptom: black output and console spam like:
      - `GL_INVALID_OPERATION: glDrawArrays: Feedback loop formed between Framebuffer and active Texture.`
    - Cause: rendering into a framebuffer whose attached texture is also bound as the active sampler.
    - Fix: copy the incoming `renderTarget` into `fullFrame1` at the start of `onDraw` and use that copy (`inputFrame`) as the pipeline input (and as the “original” reference texture in the final pass).

### VHS Optimization (completed Jan 2026)

The VHS pipeline has been optimized for performance:

- **Pass combining**: Merged Pass A (luma/chroma shrink) + Pass B (levels/tint/saturation) into single Pass AB
  - Reduced from 5 shader passes to 4
  - Reduced from 4 render targets to 3
  - Removed UnsharpMask (required separate texture sample)

- **Half-resolution rendering**: Pass AB runs at 0.5x resolution using Phaser's built-in `halfFrame1`
  - Toggle: `Shift+V`
  - Passes C, D, and Image run at full resolution

- **Frame skipping**: Can skip 1-3 frames, reusing cached result
  - Toggle: `Ctrl/Cmd+V` (cycles 1→2→3)
  - Fixed ping-pong buffer and interlacing to work correctly with frame skipping
  - Fixed alpha transparency issue by forcing `fragColor.a = 1.0` in all shader outputs

- **FPS logging**: Console logs FPS when toggling VHS settings
  - Format: `[VHS] <setting> | FPS: <value>`

- **Pipeline flow**: `input → AB → C → D → Image`
  - AB: luma/chroma shrink + levels + tint + saturation (half-res optional)
  - C: interlacing + noise (uses ping-pong buffer for temporal effect)
  - D: tracking + wave + warp + white noise
  - Image: vignette + final output

### Follow-up tasks (per-track metadata)

- **Broadcast track metadata**: when a track starts playing, broadcast `visualUrl` and `trackMessage` so all clients see the same background/message.
  - Likely requires:
    - Extending the server stream payload (schema/message) to include these fields.
    - Client: `App.tsx` background renderer uses `visualUrl` when present; UI uses `trackMessage` as an on-screen overlay.

### Mutant character animations (atlas)

- **Assets**
  - Texture atlas: `client/public/assets/character/mutant.png`
  - Atlas JSON: `client/public/assets/character/mutant.json`
  - Animation definitions: `client/src/anims/CharacterAnims.ts`

- **Animation key convention**
  - Local player drives animation via `network.updatePlayerAction(x, y, animKey)`.
  - Keys are strings like:
    - `mutant_idle_<dir>`
    - `mutant_run_<dir>`
    - `mutant_burn_<dir>`
    - `mutant_flamethrower_<dir>`
    - `mutant_punch_<dir>`

- **Walk direction order is sprite-dependent**
  - The mutant walk sheet is ordered:
    - `NE(0-9)`, `E(10-19)`, `SE(20-29)`, `SW(30-39)`, `W(40-49)`, `NW(50-59)`
  - This does not include a true `S`/`N` direction; code maps gameplay directions onto the closest available sprite-facing.

- **Movement directions added (NW/NE)**
  - `MyPlayer` now supports diagonal-up facings:
    - `up_right` (NE)
    - `up_left` (NW)
  - These drive `mutant_run_up_right` / `mutant_run_up_left` animations.

- **Debug animation interruption fix**
  - Debug keys `1/2/3` (burn/flamethrower/punch) were getting interrupted by the idle transition logic.
  - Fix: guard the idle transition while a debug anim is playing via `playingDebugAnim` in `client/src/characters/MyPlayer.ts`.
  - Additional hardening:
    - Only lock debug mode if `scene.anims.exists(animKey)`.
    - Track the active debug anim key in `debugAnimKey` and clear the lock if the current anim changes (e.g. movement interrupts the debug anim).

- **Punch direction keys**
- Added explicit keys for diagonal-up punch:
  - `mutant_punch_up_right` (frames `0..10`)
  - `mutant_punch_up_left` (frames `55..65`)

### Punching (click-to-punch + server-authoritative hit)

- **UX / control**
  - **Double-click** another player to auto-walk toward them and punch when in range.
  - Single-click on a player delays action (waits for potential double-click).
  - Cursor changes to `pointer` when hovering over clickable players.
  - Client tracks a pending target via `pendingPunchTargetId`.

- **Client implementation**
  - Target acquisition + approach + range check lives in:
    - `client/src/scenes/Game.ts`
  - When in range, the attacker plays a local action anim:
    - `MyPlayer.playActionAnim('mutant_punch_<dir>')`
  - Then the request is sent to the server:
    - `Network.punchPlayer(targetId)` → `Message.PUNCH_PLAYER`

- **Server authority (validation + effect)**
  - `server/rooms/ClubMutant.ts` dispatches `Message.PUNCH_PLAYER` into a command:
    - `server/rooms/commands/PunchPlayerCommand.ts`
    - Rejects invalid targets / self-target.
    - Re-checks range server-side:
      - `punchRange = 50` (circular, slightly larger than client for latency forgiveness)
    - Applies a small knockback after an impact delay:
      - `punchImpactDelayMs = 370`
      - `punchKnockbackDelayMs = 150`
      - `punchKnockbackPx = 6`
    - Victim hit animation is randomly selected:
      - `mutant_hit1_<dir>` or `mutant_hit2_<dir>`
    - Currently only applies to victims whose `textureId` is `mutant`.

- **How the victim sees the hit**
  - Server sets `victim.textureId/animId` to the hit animation (so late joiners see it), and also:
    - Broadcasts `Message.UPDATE_PLAYER_ACTION` to everyone except the victim.
    - Sends `Message.PUNCH_PLAYER` _to the victim only_ with `{ anim, x, y }`.
  - Client receives the victim-only `Message.PUNCH_PLAYER` in:
    - `client/src/services/Network.ts`
    - Emits `Event.MY_PLAYER_FORCED_ANIM`
  - `client/src/scenes/Game.ts` handles that event by:
    - Canceling movement
    - Resetting Arcade body position (if `x/y` included)
    - Playing the hit animation via `MyPlayer.playHitAnim(...)`

- **Animation defs**
  - Punch anims: `mutant_punch_*`
  - Hit anims: `mutant_hit1_*`, `mutant_hit2_*`
  - Defined/overridden in `client/src/anims/CharacterAnims.ts`.

### Punch system debugging learnings (Feb 2026)

- **Camera zoom affects distance calculations**
  - Camera zoom is `1.5x` (`this.cameras.main.zoom = 1.5`).
  - World distance of 50px appears as ~75px on screen.
  - Punch range values must account for this: use smaller world-space values so visual distance looks correct.

- **Double-click to punch (avoiding accidental movement)**
  - Problem: Single-click to punch caused accidental movement when trying to attack.
  - Solution: Require double-click (300ms threshold) to initiate punch.
  - Single-click on a player is delayed; if no second click comes, character walks toward player without attacking.
  - Properties used: `lastOtherPlayerClickTime`, `lastOtherPlayerClickId`, `pendingSingleClickTimer`.

- **Click detection on overlapping sprites**
  - Problem: When your sprite overlaps the target's sprite, clicking the target was unreliable.
  - Solution: Use **elliptical proximity detection** instead of sprite bounds.
  - Detection radii: `clickRadiusX = 40`, `clickRadiusY = 70` (taller to match sprite height).
  - Normalized distance formula: `(dx²/rx²) + (dy²/ry²) <= 1`.
  - Falls back to sprite bounds check if elliptical detection misses.

- **Hover cursor for UX feedback**
  - `handlePointerMove()` checks `getHoveredOtherPlayer()` using same elliptical detection.
  - Sets `this.game.canvas.style.cursor = 'pointer'` when hovering over a player.

- **Sprite overlap for visual punch connection (Feb 2026)**
  - Problem: Physics collision prevented characters from getting close enough for punches to look visually connected.
  - Solution: **Dynamically disable player-to-player collision during punch approach**:
    - Store reference to `playerCollider` (the collider between `myPlayer` and `otherPlayers`).
    - When within 80px of punch target: `this.playerCollider.active = false`.
    - Re-enable collision when punch completes or is cancelled.
  - This allows sprites to overlap for visual punch connection while maintaining collision for general movement.
  - **Punch range tuning**:
    - Client: `punchRange = 48px` (circular distance check).
    - Server: `punchRange = 50px` (slightly larger to account for position sync latency).
    - Character approaches target feet directly (no offset) since collision is disabled.
  - **South approach issue**: When approaching from below, physics bodies prevent getting closer than ~44-47px even with collision disabled. Solution: Set punch range to 48px to fire reliably from this distance.

- **Player hitbox positioning (Feb 2026)**
  - Hitboxes moved up 15px from feet for better body centering.
  - Applied in both `Player.ts` and `OtherPlayer.ts`.
  - Improves visual alignment of collision boxes with sprite bodies.

- **Auto-approach when not in range**
  - Problem: Character stops at pathfinding destination but may still be outside punch range.
  - Solution: In the update loop, if `pendingPunchTargetId` is set and character is stopped but not in range:
    - Walk directly to target feet position (collision is disabled when close).
    - Call `setMoveTarget()` to continue moving closer.
  - This ensures the character keeps approaching until punch can execute.

- **Debugging tips**
  - Add `console.log` for: `canMove`, `normDist`, `isDoubleClick`, `timeSinceLastClick`, `inRange`, `distToTarget`, `colliderActive`.
  - Check if click handler even runs (`canMove=true`).
  - Check if player is detected (`normDist < 1`).
  - Check if double-click registers (`isDoubleClick=true`).
  - Check if in punch range (`inRange=true`, compare distance vs `punchRange`).
  - Check if collision is being disabled (`colliderActive=false` when close).

### Click-to-move pathfinding

- **Camera zoom breaks `pointer.worldX/Y`**
  - With camera zoom (e.g. `this.cameras.main.zoom = 1.5`), `pointer.worldX` and `pointer.worldY` give WRONG coordinates.
  - **Always use `this.cameras.main.getWorldPoint(pointer.x, pointer.y)`** to convert screen coords to world coords.
  - This affects both click-to-move and hover detection.

- **UI click-through prevention**
  - React UI overlays on top of the Phaser canvas can receive clicks that also propagate to Phaser.
  - Fix: In `isPointerOverCanvas()`, check that `event.target === canvas` before allowing movement.
  - This prevents clicking playlist icons, chat, etc. from moving the character.

- **Pathfinding coordinate flow**
  - Click screen position → `camera.getWorldPoint()` → world coords
  - World coords → `map.worldToTileX/Y()` → tile coords
  - A\* pathfinding on tile grid → tile path
  - Tile path → `map.tileToWorldX/Y() + tileWidth/2` → world waypoints
  - Player follows waypoints via `setMovePath()`

- **Arrival threshold matters**
  - Original 10px threshold caused noticeable "stopping short" of destination.
  - Reduced to 4px and added snap-to-target on final arrival for precise positioning.

- **Blocked tile expansion**
  - `buildBlockedGrid()` expands blocked tiles by 1 in all directions to prevent player from hugging walls.
  - If clicked tile is in the expanded zone, `findNearestOpenTile()` finds the closest walkable tile.

### DJ booth interaction

- **Single-click activation when highlighted**
  - When a MusicBooth is the `highlightedInteractable` (via hover or keyboard selector), single-click triggers auto-walk + enter.
  - No double-click needed for highlighted items.

- **Booth approach point**
  - When auto-entering booth, character paths to `boothBounds.bottom + 8` (just below the desk).
  - Uses `queueAutoEnterMusicBooth()` to enter DJ mode upon arrival.

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
  - Keeping a single authoritative DJ anim key (`mutant_djwip`) avoids hitbox/asset confusion.

- **Fullscreen YouTube background styling lives in React (not Phaser)**
- **YouTube background is now Phaser-managed (not React portal)**
  - The old React portal background renderer was removed in favor of Phaser-managed background video.
  - Any styling/cropping should be done either via rex player sizing or via CSS affecting the Phaser DOM container.

### YouTube resolve endpoint (yt-dlp) (Jan 2026)

To support a future "true WebGL video background" (Phaser `Video` texture), the server can resolve a
YouTube ID into a direct playable video URL:

- **Endpoint**: `GET /youtube/resolve/:videoId`
  - File: `server/index.ts` (route registered before `/youtube/:search`)
  - Implementation: `server/youtubeResolver.ts`
  - Calls the `yt-dlp` binary (configured via `YT_DLP_PATH`, defaults to `yt-dlp` in PATH)
  - Returns:
    - `url` (direct `googlevideo.com` URL)
    - `expiresAtMs` (parsed from `expire=` query param when present)
    - `resolvedAtMs`

- **Caching**:
  - In-memory cache with short TTL and in-flight de-dupe to avoid repeated `yt-dlp` calls.
  - TTL respects expiry by refreshing before `expiresAtMs` using a skew.

- **Local dev install (macOS)**:
  - Recommended: `brew install yt-dlp`
  - Alternative: `pipx install yt-dlp`

- **Expiry refresh strategy (client)**:
  - If `expiresAtMs` is provided, refresh ~60s before expiry.
  - Also refresh on playback error (403/410 / media error) and resume at the current playback time.

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
- **Music server logic**: `server/rooms/ClubMutant.ts`
- **Server state schema**: `server/rooms/schema/OfficeState.ts`
- **Client UI playback**: `client/src/components/YoutubePlayer.tsx`
- **Shared message enum**: `types/Messages.ts`

## Conventions / tips

- Animation keys are plain strings like `mutant_idle_down`, `mutant_boombox`.
- If you change a player animation locally and want others to see it, call `Network.updatePlayerAction(...)` with the anim key.
  - The network layer encodes it into compact ids.
- For shared state, prefer adding explicit fields to the server schema + shared interfaces in `types/` and use those on the client.

## Spritesheet extraction / atlas workflow (Mutant / `adam`)

Preferred pipeline is **TexturePacker atlas** rather than loading many individual spritesheets.

### Inputs and script

- Source sheets: `conversion/base/*`
- Extractor: `conversion/scripts/extract_anim_blocks.py`
- Usage notes: `docs/spritesheet-extraction.md`

### Mapping blocks to animations

The extractor can export per-block label crops and auto-generate a starter map:

- `--export-labels`
- `--write-frames-map <path>`

This produces:

- `labels/block_XXX.png` (cropped label text)
- `frames-map.json` with `blocks.block_XXX.labelFile` entries

OCR is optional:

- `--label-ocr` will only work if `tesseract` is installed.

### Exporting frames for atlas packing

Core flags:

- `--export-frames`
- `--export-frames-flat` (recommended)
- `--frames-trim` and `--frames-trim-pad`
- `--frames-map <path>` and `--frames-map-strict`

Goal is filenames like `idle_up_right_000.png` that can be packed into one atlas.

### Mutant ripped multi-atlas workflow (`mutant_ripped`)

This repo includes a workflow for Fallout 2 mutant frames that were grid-split externally (TexturePacker GUI) into individual PNGs.

- Source sheets (reference only):
  - `conversion/base/mutant_sprites/`
- Ripped frames (input to packing):
  - `conversion/base/ripped_sprites_individual_export/`
  - Naming convention: `<base>-<index>.png` (index is 0-based and contiguous per base)
  - Special markers:
    - `single` in the base name means the animation has **1 row** (all directions reuse row 0)
    - `static` in the base name means it is effectively **one frame** (may still have multiple rows)

Build script:

- `conversion/scripts/build_mutant_ripped_atlas.py`

It generates:

- `conversion/out/mutant_ripped/manifest.json` (groups + inferred rows/cols)
- `client/src/anims/MutantRippedAnims.ts` (generated animation definitions)

And when run with `--pack`, it produces a Phaser 3 **multi-atlas**:

- `client/public/assets/character/mutant_ripped.json`
- `client/public/assets/character/mutant_ripped-<n>.png`

If you have `.webp` versions of the atlas pages, you can switch Phaser to load them by changing the `image` fields inside `client/public/assets/character/mutant_ripped.json` from `mutant_ripped-<n>.png` to `mutant_ripped-<n>.webp`.

Packing settings:

- `--algorithm MaxRects`
- `--trim-mode Crop`
- `--disable-rotation`
- `--multipack` (`--max-size 2048`)

Direction row mapping (when 6 rows):

- `NE, E, SE, SW, W, NW` maps to:
  - `up_right, right, down_right, down_left, left, up_left`
- Additional keys are generated as aliases:
  - `up` duplicates `up_left`
  - `down` duplicates `down_left`

Phaser integration:

- Preload: `client/src/scenes/Bootstrap.ts` loads `mutant_ripped` via `load.multiatlas(...)`.
- Animations: `client/src/anims/CharacterAnims.ts` calls `createMutantRippedAnims(anims)`.
- Debug preview: `client/src/components/MutantRippedAnimDebug.tsx` renders a bottom-center `Debug` overlay button.
  - React emits `Event.MUTANT_RIPPED_DEBUG_NEXT_ANIM` via `phaserEvents`.
  - `client/src/scenes/Game.ts` listens, cycles through `mutantRippedAnimKeys`, and emits `Event.MUTANT_RIPPED_DEBUG_CURRENT_ANIM` back so React can display the current key.

- Mutant idle/run override: `client/src/anims/CharacterAnims.ts` overrides the existing `mutant_idle_*` and `mutant_run_*` keys to use frames from the ripped atlas (unarmed idle/walk), while keeping the same keys so networking and movement logic stay compatible.

### Magenta guide interpretation

- `--guide-mode closed` (default): expects closed rectangles around blocks.
- `--guide-mode open`: intended for sheets where only bottom + right vertical guides exist (left can be shared).
- `--guide-mode auto`: tries closed, then falls back.

Open guide-mode is still under active development; if blocks are mis-cropped, expect further tuning.

## Current tasks

- Fix dev duplication: prevent multiple Phaser/Network instances (multiple connects / duplicated chat) under Vite HMR/refresh
- Implement shared Room Playlist (server-authoritative, remove-own-only)
- Stabilize legacy music booth/music stream code to prevent server errors during transition
- Replace random-spawned pathfinding obstacles with Tiled-placed items (chairs/vending) + proper item classes/object layers
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
- Fixed click-to-move pathfinding: use `camera.getWorldPoint()` instead of broken `pointer.worldX/Y` with zoom.
- Fixed UI click-through: check `event.target === canvas` to prevent movement when clicking UI elements.
- Changed DJ booth activation to single-click when highlighted (removed double-click requirement).
- A\* pathfinding now supports 8-directional movement with octile heuristic and no corner-cutting.

## Recent noteworthy commits (Feb 2026)

- Refactored `YoutubePlayer.tsx` into modular components and hooks (see **YoutubePlayer Architecture** below).
- Made video background toggle local-only (no longer broadcast to server).
- Non-DJ users can now see the miniplayer and toggle background video.
- Fixed music sync on late-join (TimeSync + playerRef issues).
- Fixed background video sync for both WebGL and iframe fallback renderers.

## YoutubePlayer Architecture (Feb 2026 refactor)

The `YoutubePlayer.tsx` was refactored from a monolithic component into modular pieces:

### Files

- `client/src/components/YoutubePlayer.tsx` - Main container component
- `client/src/components/YoutubePlayer.styles.ts` - Styled components (extracted)
- `client/src/components/VideoPlayer.tsx` - ReactPlayer wrapper with background toggle button
- `client/src/components/PlayerControls.tsx` - Play/pause/skip buttons
- `client/src/components/RoomPlaylistView.tsx` - Room playlist UI
- `client/src/components/usePlayerSync.ts` - Custom hook for player synchronization

### Key learnings from refactor

1. **playerRef must be shared**: When extracting ReactPlayer into a sub-component, the `playerRef` used for `seekTo()` must be passed from the parent/hook to the child component. Creating a local ref in the child breaks seeking.

2. **isPlaying should default to true**: The original code had `isPlaying: true` by default. Changing to conditional initialization (`link !== null`) broke auto-play on join.

3. **TimeSync must be ready before seeking**: On late-join, `timeSync.getServerNowMs()` returns `Date.now()` until the first sync response arrives. The `handleReady` callback now:
   - Requests fresh time sync via `game.network.requestTimeSyncNow()`
   - Checks `timeSync.hasSync()` before seeking
   - Retries at 150ms, 400ms, 800ms, 1500ms to catch the sync response

### Background video sync (WebGL + iframe)

Both renderers need to calculate offset using server-synced time, not `Date.now()`:

```ts
const freshOffset = startTime > 0 ? (timeSync.getServerNowMs() - startTime) / 1000 : 0
```

**WebGL video** (`Game.ts`):

- Recalculates offset in the `metadata` event handler (after resolve + load)

**Iframe fallback** (`Game.ts`):

- Recalculates offset in `fallbackToDomYoutubeBackground`
- Multiple delayed seek attempts at 500ms, 1500ms, 3000ms (YouTube iframe needs time to initialize before seeking works)

### Video background toggle (local-only)

The video background toggle (`videoBackgroundEnabled`) is now:

- Local-only (stored in Redux, not synced to server)
- Defaults to `true`
- Available to all users (not just DJ)
- Dispatches Redux action + emits Phaser event for Game.ts to react

## YouTube Microservice (services/youtube-api)

### Motivation

The current `server/Youtube.js` uses fragile HTML/JSON scraping that runs inline with the Colyseus game server. This is problematic:

- CPU-intensive parsing blocks game state sync
- Single point of failure for rate limiting
- Difficult to scale independently

### Architecture

```
┌─────────────────┐     ┌──────────────────────────────┐
│  Colyseus Game  │────▶│  YouTube Microservice (Go)   │
│     Server      │     │  - GET /search?q=...         │
└─────────────────┘     │  - GET /resolve/{videoId}    │
                        │  - GET /proxy/{videoId}      │
                        └──────────────┬───────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────────┐
                        │   In-memory Cache (Redis TBD)│
                        │  - search results (1hr TTL)  │
                        │  - resolved URLs (by expiry) │
                        └──────────────────────────────┘
```

### Implementation Status

1. **Phase 1: Search endpoint** ✅
   - Location: `services/youtube-api/`
   - Endpoint: `GET /search?q=...&limit=10`
   - Uses `github.com/raitonoberu/ytsearch` library
   - In-memory cache with TTL

2. **Phase 2: Colyseus integration** ✅
   - `server/youtubeService.ts` client wrapper
   - Fallback to `Youtube.js` if Go service unavailable

3. **Phase 3: Resolve & proxy endpoints** ✅
   - `GET /resolve/{videoId}` - returns direct stream URL
   - `GET /resolve/{videoId}?videoOnly=true` - video-only (no audio)
   - `GET /proxy/{videoId}` - proxies stream (default: video-only)
   - Uses pure Go: `github.com/kkdai/youtube/v2` (no yt-dlp!)
   - Supports Range headers for seeking
   - Fallback to yt-dlp in Node if Go service unavailable

4. **Phase 4: Redis caching** (pending)
   - Redis for shared cache across instances

### Local development

```bash
# Terminal 1: Go service
cd services/youtube-api && go run .

# Terminal 2: Node server
YOUTUBE_SERVICE_URL=http://localhost:8081 npm run start
```

### Environment variables

- `PORT` - Go service HTTP port (default: 8081)
- `YOUTUBE_API_CACHE_TTL` - search cache TTL in seconds (default: 3600)
- `YOUTUBE_SERVICE_URL` - Node server config (default: `http://localhost:8081`)

### YouTube API Performance Optimizations (Jan 2026)

The Go YouTube library (`github.com/kkdai/youtube/v2`) frequently fails with signature parsing errors due to YouTube cipher changes. The service now uses **yt-dlp exclusively** with several optimizations:

#### Architecture Changes

1. **Removed Go library** - Skipped entirely, go straight to yt-dlp (Go lib always failed with "error parsing signature tokens")
2. **Removed Colyseus fallback** - The Colyseus server no longer has a local yt-dlp fallback (it didn't have cookies configured)

#### Fly.io VM Optimizations

| Issue               | Symptom                               | Fix                                                                                     |
| ------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| CPU Steal           | 90% steal on shared CPU               | Switch to `performance` CPU (`cpu_kind = 'performance'` in fly.toml)                    |
| Disk I/O Throttling | 60-100 throttled events               | Use RAM disk: `TMPDIR=/dev/shm`, `XDG_CACHE_HOME=/dev/shm`                              |
| OOM Kills           | yt-dlp processes killed               | Add semaphore to limit concurrent processes (`ytdlpSemaphore = make(chan struct{}, 2)`) |
| Thundering Herd     | Same video resolved 5x simultaneously | Add singleflight request coalescing (`golang.org/x/sync/singleflight`)                  |

#### yt-dlp Configuration

```go
args := []string{
    url,
    "-f", "best[height<=360][ext=mp4]/best[height<=480][ext=mp4]/best[ext=mp4]/best[height<=360]/best",
    "-g",
    "--no-playlist",
    "--no-warnings",
    "--quiet",
    "--no-cache-dir",
    "--js-runtimes", "node",
    "--remote-components", "ejs:github",
    "--extractor-args", "youtubepot-bgutilhttp:base_url=" + potProviderUrl,
}
// Add cookies if available
if _, err := os.Stat(cookiesFilePath); err == nil {
    args = append(args, "--cookies", cookiesFilePath)
}
```

#### Cookie Authentication (Age-Restricted Content)

- Cookies stored as Fly.io secret: `YOUTUBE_COOKIES`
- Written to `/tmp/youtube_cookies.txt` at startup
- Export from browser using a cookie extension (Netscape format)

#### PO Token Provider

A separate service (`club-mutant-pot-provider`) provides Proof of Origin tokens:

- Uses `bgutil-ytdlp-pot-provider` Python package
- Internal URL: `http://club-mutant-pot-provider.internal:4416`

#### Monitoring Fly.io Metrics

Key metrics to watch:

- **CPU Steal**: Should be 0% with performance CPU
- **Disk Throttled Events**: Should be minimal with RAM disk
- **Network recv vs sent**: If recv >> sent, streams aren't reaching clients
- **Load Average**: High values indicate yt-dlp queue backup

#### Defaults

- `videoOnly=true` on both `/resolve/` and `/proxy/` endpoints (smaller files, faster)
- Cache TTL: based on resolved URL expiry (~6 hours), with a 5-minute safety buffer (never cache past expiry)

### ISP Proxy Integration (Feb 2026)

YouTube aggressively rate-limits datacenter IPs, requiring PO tokens for every request (~6-7s overhead). ISP proxies provide residential IPs that bypass this detection.

#### Architecture

```
┌─────────────┐     ┌──────────────────────────┐     ┌─────────────┐     ┌──────────┐
│   Client    │────▶│  YouTube API (Go)        │────▶│  ISP Proxy  │────▶│ YouTube  │
│  (Browser)  │     │  - resolve via yt-dlp    │     │  (IPRoyal)  │     │   CDN    │
└─────────────┘     │  - stream via HTTP proxy │     └─────────────┘     └──────────┘
                    └──────────────────────────┘
```

#### Key Learnings

| Issue                                | Cause                                                           | Solution                                                                       |
| ------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **403 on video stream**              | YouTube URLs are IP-locked to resolver's IP                     | Stream video through same ISP proxy used for resolve                           |
| **"Requested format not available"** | yt-dlp selectors like `bv[height<=360]` need JavaScript runtime | Use specific itags (`160/133/134`) for proxy path, selectors for PO token path |
| **Cookies interfere with proxy**     | YouTube cookies can override proxy session                      | Only pass `--cookies` arg when using PO token path                             |

#### ISP Proxy Configuration

```go
func init() {
    transport := &http.Transport{...}

    // Route all video streaming through ISP proxy
    if proxyURL := os.Getenv("PROXY_URL"); proxyURL != "" {
        proxyParsed, _ := url.Parse(proxyURL)
        transport.Proxy = http.ProxyURL(proxyParsed)
    }

    httpClient = &http.Client{Transport: transport}
}
```

#### Environment Variables

- `PROXY_URL` - ISP proxy URL (format: `http://user:pass@host:port`)
- For Hetzner deployment: set in `deploy/hetzner/.env` (consumed by `deploy/hetzner/docker-compose.yml`)

#### Performance

| Path      | Resolve Time | Notes                                 |
| --------- | ------------ | ------------------------------------- |
| ISP Proxy | ~4s          | No PO token needed, itag-based format |
| PO Token  | ~6-7s        | Selector-based format, JS runtime     |
| Cached    | ~10ms        | 6-hour cache based on URL expiry      |

### Safari Video Background (Feb 2026)

Safari has significantly slower video metadata loading compared to Chrome for WebGL video backgrounds.

#### Root Cause

- Safari waits for the **moov atom** (MP4 metadata) before firing `loadedmetadata`
- Chrome uses range requests to seek directly to metadata at end of file
- Safari downloads more of the file sequentially, causing 20-30s delays

#### Solution

Detect Safari and use iframe YouTube player instead of WebGL video:

```typescript
// client/src/scenes/Game.ts
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
const BACKGROUND_VIDEO_RENDERER: BackgroundVideoRenderer = isSafari ? 'iframe' : 'webgl'
```

#### Iframe Fallback Styling

When using iframe fallback, the YouTube player needs to render above the Phaser canvas with blend mode:

```scss
// client/src/index.scss
#phaser-container.bg-iframe-overlay {
  canvas {
    mix-blend-mode: difference;
  }
  > div {
    z-index: 2; // Above canvas (z-index: 1)
  }
}
```

#### Browser Behavior Summary

| Browser | Renderer                    | Background Style                          |
| ------- | --------------------------- | ----------------------------------------- |
| Chrome  | WebGL `Video`               | Behind canvas (Phaser display list + CSS) |
| Safari  | iframe (rex YouTube player) | Above canvas + difference blend           |

#### WebGL background video sizing

The WebGL background video can initially render at the wrong size if you use `window.innerWidth/innerHeight` before Phaser's ScaleManager settles.

- Use `this.scale.gameSize` as the authoritative width/height.
- Force an early `this.scale.refresh()` and run a delayed resize pass so both rex YouTube player and the WebGL `Video` get correct dimensions.

### Video Byte Caching (Go Service)

The Go service caches full video bytes in memory for faster subsequent requests.

#### Configuration

```go
const DefaultVideoCacheMaxSize = 100 * 1024 * 1024  // 100MB

// Configurable via environment variable
VIDEO_CACHE_SIZE_MB=1000  // 1000MB cache (see deploy/hetzner/docker-compose.yml)
```

#### Cache Behavior

- **LRU eviction** when cache is full
- **TTL**: Based on URL expiry (~6 hours), with 5-minute safety buffer
- **Only caches** non-range requests (full video downloads)
- **Max entry size**: 10MB (larger videos stream without caching)

#### Cache Flow

```
Request → Check video cache
            ↓ miss
          Resolve URL (yt-dlp)
            ↓
          Stream from YouTube (via proxy)
            ↓
          Cache bytes (if < 10MB)
            ↓
          Return to client
```

### Resolve URL Caching

Resolved YouTube URLs are cached based on their expiry time (parsed from `expire=` query param).

```go
// Parse expiry from URL like ...&expire=1769954631&...
func parseExpiresFromURL(rawURL string) *int64 {
    // Extract expire param, convert to milliseconds
}

// Cache with TTL = expiry - now - 5min buffer
func cacheResolvedURL(key string, resp ResolveResponse) {
    if resp.ExpiresAtMs != nil {
        ttl := time.Until(time.UnixMilli(*resp.ExpiresAtMs)) - 5*time.Minute
        resolveCache.Set(key, resp, ttl)
    }
}
```

Typical YouTube URL expiry: **~6 hours** from resolve time.

### Deployment (Hetzner VPS + Caddy) (Feb 2026)

This repo now includes a working VPS deployment bundle under `deploy/hetzner/` that runs:

- **Caddy** reverse proxy (automatic HTTPS)
- **Colyseus Node server** (port `2567` internal)
- **YouTube API (Go)** (port `8081` internal)
- **PO token provider** (port `4416` internal)

#### Domains

- `api.mutante.club` → Colyseus server (WebSocket + HTTP)
- `yt.mutante.club` → YouTube API (HTTP)

#### Key files

- `deploy/hetzner/docker-compose.yml`
- `deploy/hetzner/Caddyfile`
- `deploy/hetzner/.env.example` (copy to `.env` on the VPS; do not commit)

#### Ports

- Public inbound:
  - `80` / `443` (Caddy)
- Container-internal:
  - `2567` (server)
  - `8081` (youtube-api)
  - `4416` (pot-provider)

#### Environment variables (VPS)

- `PROXY_URL` (recommended)
- `YOUTUBE_COOKIES` (optional; for age-restricted content)

#### Client build config (Netlify)

The client uses these at build time (see `netlify.toml`):

- `VITE_WS_ENDPOINT=wss://api.mutante.club`
- `VITE_HTTP_ENDPOINT=https://api.mutante.club`

### Local Development 403 Troubleshooting (Feb 2026)

**Problem**: YouTube video streaming returns 403 locally even though yt-dlp resolution works.

**Symptom**:

```
[proxy] Upstream connect status=403
[proxy] YouTube returned error 403
```

**Root Cause** (Investigated but not fully resolved):

- yt-dlp can resolve URLs through proxy fine
- httpClient streaming gets 403 even with same proxy
- Works fine in production (Hetzner VPS)
- Suspected cause: IPRoyal proxy may assign different exit IPs per connection when routing from residential IPs vs datacenter IPs

**Implemented Fixes**:

1. **Browser headers on streaming requests** - Go httpClient sends `Go-http-client/1.1` User-Agent by default; added browser-like headers:

   ```go
   req.Header.Set("User-Agent", "Mozilla/5.0 ...")
   req.Header.Set("Origin", "https://www.youtube.com")
   req.Header.Set("Referer", "https://www.youtube.com/")
   ```

2. **Cache busting on 403** - Re-resolves URL if streaming returns 403:

   ```go
   if resp.StatusCode == http.StatusForbidden {
       s.resolveCache.Del(cacheKey)
       // Re-resolve with fresh URL and retry
   }
   ```

3. **Local dev fallback** - When no `PROXY_URL` or `POT_PROVIDER_URL` configured, tries basic yt-dlp without PO tokens (works for some videos)

4. **Better logging** - Logs proxy config status, resolved URLs, retry attempts

**Workaround for Local Dev**:

- Use iframe player fallback instead of WebGL video (`BACKGROUND_VIDEO_RENDERER = 'iframe'`)
- Or test video backgrounds in production only

**Files Modified**:

- `services/youtube-api/main.go` - Added headers, cache busting, logging

**Key Insight**: Production works because the datacenter IP gets consistent proxy routing; local residential IP may get different treatment from IPRoyal.
