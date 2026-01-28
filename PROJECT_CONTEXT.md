# Club Mutant (SkyOffice fork) — Project Context

This file is a high-signal, “get back up to speed fast” reference for the `goblincore/club-mutant` codebase.

## What this project is

- A multiplayer 2D top-down Phaser game (client) with a Colyseus authoritative server that is about playing and listening to music together in the form of playlists and 'dj' sessions.
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

### Tooling note (TypeScript)

- Some transitive deps (notably `ioredis@5` via Colyseus redis packages) ship TypeScript declaration syntax that is not parseable by older `typescript` versions.
- If `tsc` outputs huge numbers of parse errors originating from `node_modules/ioredis/*`, upgrade the root toolchain (`typescript`, `ts-node`, `ts-node-dev`).

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

#### Chat bubbles (in-world)

- Chat history is stored in `state.chatMessages` (Colyseus schema) and is used for the chat log UI.
- In-world bubbles are driven by a Phaser event:
  - `Event.UPDATE_DIALOG_BUBBLE`
- Server broadcasts `Message.ADD_CHAT_MESSAGE` with `{ clientId, content }` to other clients.
- Client `Network.ts` listens for that broadcast and emits `Event.UPDATE_DIALOG_BUBBLE` so `Game.ts` can call `Player.updateDialogBubble(...)` on the correct entity.

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
  - Always use the Mutant character
  - Auto-assign a unique username that contains `mutant`

- **Server enforcement (authoritative)**
  - `server/index.ts` passes `isPublic: true` to the public room create options.
  - `types/Rooms.ts` includes `isPublic?: boolean` on `IRoomData`.
  - `server/rooms/SkyOffice.ts`:
    - Stores `this.isPublic`.
    - On `onJoin`, if public:
      - Sets `player.name = mutant-${client.sessionId}` (unique per connection)
      - Sets `player.anim = mutant_idle_down`
    - Ignores `Message.UPDATE_PLAYER_NAME` when public.
    - Sanitizes `Message.UPDATE_PLAYER_ACTION` animation keys to `mutant_*` when public.
      - Allows special DJ/transition anim keys through: `mutant_djwip`, `mutant_boombox`, `mutant_transform`, `mutant_transform_reverse`.

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

## Mutant character animations (atlas)

- **Assets**
  - Texture atlas: `client/public/assets/character/mutant.png`
  - Atlas JSON: `client/public/assets/character/mutant.json`
  - Animation definitions: `client/src/anims/CharacterAnims.ts`

## Mutant ripped multi-atlas (`mutant_ripped`)

- **Assets**
  - Multi-atlas JSON: `client/public/assets/character/mutant_ripped.json`
  - Atlas pages: `client/public/assets/character/mutant_ripped-<n>.png`
  - Optional WebP pages: `client/public/assets/character/mutant_ripped-<n>.webp`

- **Loading**
  - `client/src/scenes/Bootstrap.ts` preloads via:
    - `this.load.multiatlas('mutant_ripped', 'assets/character/mutant_ripped.json', 'assets/character/')`
  - To use WebP pages, update the `image` fields in `mutant_ripped.json` to `mutant_ripped-<n>.webp`.

- **Animation defs**
  - Generated definitions live in: `client/src/anims/MutantRippedAnims.ts`
  - Registered in Phaser via `createMutantRippedAnims(anims)` (called inside `createCharacterAnims`).

- **Replacing base mutant idle/run visuals**
  - `client/src/anims/CharacterAnims.ts` keeps animation keys like `mutant_idle_<dir>` and `mutant_run_<dir>` intact,
    but overrides their frames to come from the ripped atlas (unarmed idle/walk).
  - This preserves all existing movement and networking behavior (server still syncs `mutant_idle_*` / `mutant_run_*`).

- **Debug preview (React overlay)**
  - UI component: `client/src/components/MutantRippedAnimDebug.tsx` (bottom-center `Debug` button).
  - Event bridge:
    - React emits `Event.MUTANT_RIPPED_DEBUG_NEXT_ANIM` via `phaserEvents`.
    - `client/src/scenes/Game.ts` listens, plays the next `mutant_ripped_*` anim on `MyPlayer`,
      then emits `Event.MUTANT_RIPPED_DEBUG_CURRENT_ANIM` so React can display the current key.

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

- **Movement directions added (NW/NE)**
  - `MyPlayer` now supports diagonal-up facings:
    - `up_right` (NE)
    - `up_left` (NW)

- **Debug animation interruption fix**
  - Debug keys `1/2/3` (burn/flamethrower/punch) were getting interrupted by idle transition logic.
  - Fix: guard idle transition while a debug anim is playing via `playingDebugAnim` in `client/src/characters/MyPlayer.ts`.
  - Additional hardening:
    - Only lock debug mode if `scene.anims.exists(animKey)`.
    - Track the active debug anim key in `debugAnimKey` and clear the lock if the current anim changes (e.g. movement interrupts the debug anim).

- **Punch direction keys**
  - Added explicit keys for diagonal-up punch:
    - `mutant_punch_up_right` (frames `0..10`)
    - `mutant_punch_up_left` (frames `55..65`)

## Punching (click-to-punch + server-authoritative hit)

- **UX**
  - Click another player → auto-walk into range → punch triggers.

- **Client flow**
  - `client/src/scenes/Game.ts`
    - Tracks `pendingPunchTargetId` after clicking an `OtherPlayer`.
    - When in range, plays `mutant_punch_<dir>` via `MyPlayer.playActionAnim(...)`.
    - Sends `Message.PUNCH_PLAYER` via `Network.punchPlayer(targetId)`.

- **Server flow**
  - `server/rooms/SkyOffice.ts`
    - Validates the punch (target exists, not self, server-side range check).
    - Uses dy-weighted distance for isometric feel (`punchRangePx = 56`, `punchDyWeight = 1.5`).
    - After `punchImpactDelayMs = 350`, applies small knockback (`punchKnockbackPx = 10`) and forces a hit anim.
    - Randomly chooses `mutant_hit1_<dir>` vs `mutant_hit2_<dir>`.

- **Victim handling (important detail)**
  - The victim does **not** rely only on state sync for immediate feedback.
  - Server sends `Message.PUNCH_PLAYER` to the victim with `{ anim, x, y }`.
  - Client `Network.ts` emits `Event.MY_PLAYER_FORCED_ANIM`.
  - `Game.ts` handles it by resetting the Arcade body (if `x/y` provided) and calling `MyPlayer.playHitAnim(...)`.

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

### DJ-synced fullscreen video background

The DJ can toggle the current YouTube stream as a fullscreen background for everyone:

- **Server state**: `musicStream.videoBackgroundEnabled` (Colyseus schema)
- **Message**: `Message.SET_VIDEO_BACKGROUND` (DJ-only; booth connected user)
- **Client rendering**:
  - `client/src/App.tsx` renders a fullscreen `ReactPlayer` behind Phaser via a portal.

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
  - `client/public/assets/character/MutantBoomboxTest.png`

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
- **Music sync/resync (implemented)**: `docs/music-sync-resync-plan.md`

## Conventions / tips

- Animation keys are plain strings like `mutant_idle_down`, `mutant_boombox`.
- If you change a player animation locally and want others to see it, you must update `player.anim` via `Network.updatePlayerAction(...)`.
- For shared state, prefer adding explicit fields to the server schema + shared interfaces in `types/` and use those on the client.

## VHS PostFX (Shadertoy port)

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

## Spritesheet extraction / atlas workflow (Mutant / `adam`)

The preferred pipeline for new character animations is **texture atlas** (TexturePacker).

- Source images live under `conversion/base/`.
- Extraction script: `conversion/scripts/extract_anim_blocks.py`
- Notes/how-to: `docs/spritesheet-extraction.md`

### Output structure

The extractor writes an output folder containing:

- `manifest.json`: detected blocks and inferred grid metadata
- `blocks/`: per-block crops
- `labels/`: per-block label crops (for mapping)
- `frames/`: individual frame PNGs suitable for atlas packing

### Label-based mapping (no manual guessing)

The original boxed spritesheet includes left-aligned labels under each block. The script can:

- Export the label crops:
  - `--export-labels`
- Generate a starter mapping file:
  - `--write-frames-map <path>`
  - Produces per-block entries including `labelFile` for quick manual mapping.

OCR is optional:

- `--label-ocr` uses `tesseract` if present on the system.

### Exporting atlas-friendly frames

Key options:

- `--export-frames`: export individual frame PNGs
- `--export-frames-flat`: export into a single folder with globally-unique names (recommended for TexturePacker)
- `--frames-trim`: trim transparent borders from each frame
- `--frames-trim-pad <n>`: add a small pad after trimming
- `--frames-map <path>`: provide a mapping file to name blocks into animation buckets
- `--frames-map-strict`: fail if a block has no mapping entry

Mapping file convention:

- Blocks are named `block_XXX` and mapped to an animation `name` (e.g. `idle`, `walk`, `punch`, etc.).
- Directions are a per-row list (defaults used in prior work):
  - `up_right`, `right`, `down_right`, `down_left`, `left`, `up_left`

The goal is exported frame names like:

- `idle_up_right_000.png`
- `walk_left_009.png`

These are then packed into a single atlas with offsets (TexturePacker “trim + offsets” workflow).

### Guide modes (magenta lines)

Block detection relies on magenta guide lines:

- `--guide-mode closed` (default): works well when guides form closed rectangles
- `--guide-mode open`: intended for sheets where only bottom + right vertical lines exist (left may be shared)
- `--guide-mode auto`: attempts `closed` first, falls back to `open`

Open-guide support is still experimental; if blocks look mis-cropped, it likely needs further tuning.

## Mutant ripped multi-atlas workflow (`mutant_ripped`)

There is a separate pipeline for mutant animations where frames were exported as individual PNGs (via TexturePacker GUI splitter) and then re-packed via TexturePacker CLI:

- Input frames:
  - `conversion/base/ripped_sprites_individual_export/`
  - Filenames: `<base>-<index>.png` (0-based, contiguous)
  - Markers:
    - `single` means 1 row (all directions use row 0)
    - `static` means a single-frame animation (may still have 6 rows)

Build + pack:

- Script: `conversion/scripts/build_mutant_ripped_atlas.py`
- Generate manifest + TS animation defs:
  - `conversion/out/mutant_ripped/manifest.json`
  - `client/src/anims/MutantRippedAnims.ts`
- Pack into a Phaser multi-atlas (MaxRects + trim):
  - `client/public/assets/character/mutant_ripped.json`
  - `client/public/assets/character/mutant_ripped-<n>.png`

Phaser wiring:

- `client/src/scenes/Bootstrap.ts` loads `mutant_ripped` via `load.multiatlas(...)`.
- `client/src/anims/CharacterAnims.ts` calls `createMutantRippedAnims(anims)`.

Debug preview:

- `client/src/scenes/Game.ts` adds a small clickable `Ripped Anims` button that cycles through `mutant_ripped_*` animations on the local player.

## Recent noteworthy commits (Jan 2026)

- Added DJ boombox spritesheet + animation + slowed playback.
- Room playlist changed to be non-destructive, index-based playback.
- Added Play button + auto-start on DJ connect + active-track highlight.
- Synced DJ boombox animation to other players via `updatePlayerAction`.
- Public lobby: skip login, server-enforced mutant identity, and reliable auto-login in `Game.create()`.
