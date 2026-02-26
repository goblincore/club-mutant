# Plan: Jukebox Room Type + MyRoom Boombox

## Context

The existing DJ Queue system (PUBLIC and CUSTOM rooms) is a round-robin rotation where multiple DJs take turns playing one track each. This is great for collaborative DJ sessions but heavyweight for simpler use cases.

Two new music playback modes are needed:

1. **Jukebox Room** — New room type with a **shared room playlist**. Any player walks up and adds songs. No DJ rotation — tracks play sequentially. Played songs are removed. Simple, communal, jukebox-style.

2. **MyRoom Boombox** — Existing MyRoom gets a boombox interactable. Single-user personal jukebox — add tracks, they play in order.

Both share the same "sequential shared playlist" mechanic, differing only in room context.

---

## Design Decisions

### D1: Schema — New `JukeboxPlaylist` ArraySchema

Add to `OfficeState`:
```
@type([JukeboxItem]) jukeboxPlaylist = new ArraySchema<JukeboxItem>()
```

`JukeboxItem extends Schema`: `id`, `title`, `link`, `duration`, `addedBySessionId`, `addedByName`, `addedAtMs`.

**Why not reuse existing collections?**
- `djQueue` = per-DJ rotation state (fundamentally different)
- `roomQueuePlaylist` = per-player, server-only, not synced (jukebox is shared, must sync to ALL clients)
- Clean separation avoids conditional pollution in existing DJ code

**Why ArraySchema (not targeted messages)?**
- Jukebox is public — everyone sees the same list
- `ArraySchema` gives automatic `onAdd`/`onRemove`/`onChange` on all clients for free

### D2: Room Types + Music Mode

Add `JUKEBOX = 'jukebox'` to `RoomType` enum. Add `musicMode` to `IRoomData`:

```ts
musicMode?: 'djqueue' | 'jukebox' | 'personal'
```

Mapping:
- `PUBLIC` → always `'djqueue'`
- `CUSTOM` → user chooses at creation time (default `'djqueue'`)
- `JUKEBOX` → always `'jukebox'`
- `MYROOM` → always `'personal'`

The `CreateRoomForm` gets a music mode toggle (radio buttons or dropdown: "DJ Queue" vs "Jukebox").

### D3: Messages — New `JUKEBOX_*` enums

New message types (cleaner than reusing orphaned `ROOM_PLAYLIST_*`):
```
JUKEBOX_ADD, JUKEBOX_REMOVE, JUKEBOX_PLAY, JUKEBOX_STOP, JUKEBOX_SKIP, JUKEBOX_TRACK_COMPLETE,
JUKEBOX_CONNECT, JUKEBOX_DISCONNECT
```

### D4: Exclusive Access (Occupant Model) — IMPLEMENTED

The jukebox uses an **exclusive access** model — only one player (the "occupant") can use it at a time, like a real jukebox. This was a design change from the original "anyone can play/stop/skip" plan.

- **Walk-up interaction**: Player approaches jukebox `<InteractableObject>` and interacts → sends `JUKEBOX_CONNECT`
- **Server tracks occupant**: `OfficeState.jukeboxOccupantId` + `jukeboxOccupantName` (schema-synced to all clients)
- **Busy guard**: If someone else is already using it, server sends `jukebox_busy` toast to the requesting player
- **Disconnect**: Occupant closes the panel or walks away → sends `JUKEBOX_DISCONNECT`, clears occupant fields
- **Controls gated to occupant**: Only the occupant can add/remove tracks, play/stop/skip
- **Everyone sees the playlist**: The shared `jukeboxPlaylist` ArraySchema syncs to all clients, but only the occupant has interactive controls

### D5: Playback Logic — IMPLEMENTED

- **Auto-play on first add**: Adding a track when jukebox is idle auto-starts it
- **Auto-advance**: On `JUKEBOX_TRACK_COMPLETE`, server removes finished track and starts next
- **Any client reports track end**: Any connected client can send `JUKEBOX_TRACK_COMPLETE`. Server deduplicates via `streamId`. Watchdog timer is backup (duration + 10s)
- **Occupant-gated controls**: Only the jukebox occupant can play/stop/skip
- **Destructive**: Played tracks are removed via `splice()` — not cursor-based like the old 2D system

### D6: Track Ownership — IMPLEMENTED

- Each `JukeboxItem` stores `addedBySessionId`
- Only the occupant can add/remove tracks (server-enforced via occupant check)
- Currently-playing track (index 0) CAN be removed (triggers skip)
- Tracks persist if the adder disconnects (removed only by play-through or explicit remove)

### D7: MyRoom "Personal" Mode

Mechanically identical to `'jukebox'` — same `jukeboxPlaylist` ArraySchema, same commands. Since MyRoom is `autoDispose: true` and typically single-player, it's effectively personal. No special server logic needed.

### D8: Infrastructure Reuse

| Component | Reuse |
|-----------|-------|
| `MusicStream` schema | Same — set `status`, `currentLink`, `startTime`, etc. |
| `START_MUSIC_STREAM` / `STOP_MUSIC_STREAM` | Same broadcast messages |
| `MUSIC_STREAM_TICK` | Same 5s drift correction |
| `musicStore` (client) | Same playback state |
| `NowPlaying.tsx` | Adapted — hides visible UI in jukebox mode, renders only hidden ReactPlayer for audio |
| `DjQueuePanel.tsx` | Adapted — jukebox mode: occupant status, now-playing mini player at top, search, shared track list |
| `MyPlaylistsPanel.tsx` | Adapted — "add to jukebox" buttons hidden for non-occupants |
| `playlistStore` | Same — personal playlists in localStorage |
| `TimeSync` | Same |
| Track watchdog | Same pattern |
| `prefetchVideo()` | Same |
| `InteractableObject` | Same |

---

## Implementation Plan

### Phase 1: Types & Schema

**`types/Rooms.ts`**
- Add `JUKEBOX = 'jukebox'`
- Add `musicMode?: 'djqueue' | 'jukebox' | 'personal'` to `IRoomData`

**`types/Messages.ts`**
- Add: `JUKEBOX_ADD`, `JUKEBOX_REMOVE`, `JUKEBOX_PLAY`, `JUKEBOX_STOP`, `JUKEBOX_SKIP`, `JUKEBOX_TRACK_COMPLETE`

**`types/Dtos.ts`**
- Add `JukeboxItemDto`: `{ id, title, link, duration, addedBySessionId, addedByName, addedAtMs }`

**`server/src/rooms/schema/OfficeState.ts`**
- Add `JukeboxItem extends Schema` with `@type` decorators for all fields
- Add `@type([JukeboxItem]) jukeboxPlaylist` to `OfficeState`

### Phase 2: Server Commands — IMPLEMENTED

**`server/src/rooms/commands/JukeboxCommand.ts`**

Helpers:
- `playNextJukeboxTrack(room)` — reads `jukeboxPlaylist[0]`, sets `musicStream` fields, increments `streamId`, broadcasts `START_MUSIC_STREAM`, starts watchdog
- `stopJukeboxStream(room)` — clears `musicStream`, broadcasts `STOP_MUSIC_STREAM`, clears watchdog

Commands:
- **`JukeboxConnectCommand`** — sets `jukeboxOccupantId`/`jukeboxOccupantName` on state; rejects if already occupied (sends `jukebox_busy`)
- **`JukeboxDisconnectCommand`** — clears occupant fields
- **`JukeboxAddCommand`** — validates occupant, push `JukeboxItem`, `prefetchVideo()`, auto-start if idle
- **`JukeboxRemoveCommand`** — validates occupant, splice. If removing index 0: stop + start next
- **`JukeboxPlayCommand`** — validates occupant, start/resume if tracks exist
- **`JukeboxStopCommand`** — validates occupant, stop stream but keep tracks in list
- **`JukeboxSkipCommand`** — validates occupant, remove index 0, start next or stop
- **`JukeboxTrackCompleteCommand`** — dedup via `streamId`, remove index 0, start next or stop (any client can report)

### Phase 3: Server Room Integration — IMPLEMENTED

**`server/src/rooms/ClubMutant.ts`**
- `musicMode` field computed in `onCreate()` from room options
- Registers `JUKEBOX_CONNECT` and `JUKEBOX_DISCONNECT` handlers for exclusive access
- Registers `JUKEBOX_*` handlers gated on `musicMode !== 'djqueue'`
- Guards `DJ_QUEUE_*` handlers with `musicMode === 'djqueue'`
- `onLeave`: if leaving player is jukebox occupant, clears occupant fields; jukebox tracks stay in playlist

**`server/src/rooms/schema/OfficeState.ts`**
- Added `@type("string") jukeboxOccupantId` and `@type("string") jukeboxOccupantName` to `OfficeState`

**`types/Messages.ts`**
- Added `JUKEBOX_CONNECT` and `JUKEBOX_DISCONNECT` message types

### Phase 4: Client Network + Stores — IMPLEMENTED

**`client-3d/src/stores/jukeboxStore.ts`**
```ts
interface JukeboxState {
  playlist: JukeboxItemDto[]   // from schema sync
  occupantId: string | null    // who is using the jukebox
  occupantName: string | null  // display name of occupant
  setPlaylist(items: JukeboxItemDto[]): void
  addItem(item: JukeboxItemDto): void
  removeItem(id: string): void
  setOccupant(id: string | null, name: string | null): void
  clear(): void
}
```

**`client-3d/src/stores/gameStore.ts`**
- `musicMode: 'djqueue' | 'jukebox' | 'personal' | null` — set from room metadata on join

**`client-3d/src/network/NetworkManager.ts`**
- Schema listeners: `jukeboxPlaylist` `onAdd`/`onRemove` → `jukeboxStore`, `jukeboxOccupantId`/`jukeboxOccupantName` `.listen()` → `jukeboxStore.setOccupant()`
- `jukebox_busy` message handler → toast notification
- Methods: `jukeboxConnect()`, `jukeboxDisconnect()`, `addToJukebox()`, `removeFromJukebox()`, `jukeboxPlay()`, `jukeboxStop()`, `jukeboxSkip()`, `jukeboxTrackComplete(streamId)`

### Phase 5: Client UI — IMPLEMENTED

**`client-3d/src/ui/NowPlaying.tsx`**
- In jukebox/personal mode: renders **only** the hidden `<ReactPlayer>` for audio playback — no visible mini player bar
- All visible UI (playback controls, track info, status) is handled by `DjQueuePanel` to avoid duplicate controls
- `onEnded` → `getNetwork().jukeboxTrackComplete(streamId)` with streamId dedup guard
- DJ queue mode: unchanged (shows mini player bar with controls for current DJ)

**`client-3d/src/ui/DjQueuePanel.tsx`**
- When `musicMode === 'jukebox' || 'personal'`:
  - Header: "● jukebox (N)" or "● boombox (N)" with close button (also disconnects occupant)
  - **Occupant status bar**: shows "● you are using the jukebox" (green) or "● {name} is using the jukebox" (amber)
  - **Now-playing mini player** (top, below status): current track title + stop/skip buttons (occupant only) — styled consistently with the DJ queue NowPlaying mini bar (w-7 h-7 icon buttons)
  - **When stopped**: play button + "stopped — press ▶ to play" (occupant) or "N tracks queued" (non-occupant)
  - **Search bar**: YouTube search, only shown to occupant
  - **Track list**: shared `jukeboxStore.playlist`, index 0 highlighted as now playing with ♪ indicator, remove button (occupant only)
  - **Empty state**: occupant sees "search above or add from playlists" link; non-occupant sees "no tracks in the jukebox yet"

**`client-3d/src/ui/MyPlaylistsPanel.tsx`**
- "Add to Jukebox" / "+" buttons are **hidden for non-occupant users** via `canAddToQueue` guard
- Guards applied to: "add all to queue" in detail view, per-track "+" button, "+all" on playlist list view

**`client-3d/src/App.tsx`**
- `nowPlayingVisible = false` in jukebox mode, so the playlist panel starts at `top: 0` (no gap for hidden mini player)

**`client-3d/src/ui/CreateRoomForm.tsx`**
- Add music mode selector (two radio buttons or toggle):
  - "DJ Queue" (default) — collaborative round-robin
  - "Jukebox" — shared playlist, anyone adds/plays
- Pass `musicMode` to `getNetwork().createCustomRoom()`

**`client-3d/src/ui/LobbyScreen.tsx`**
- Jukebox rooms appear in `CustomRoomBrowser` alongside regular custom rooms
- The room browser shows music mode icon/label per room
- No need for a separate "Jukebox" lobby button — they're created via custom room flow with jukebox mode selected

### Phase 6: Jukebox Room Scene — IMPLEMENTED

**`client-3d/src/scene/JukeboxRoom.tsx`**

A retro diner/bar vibe room. Existing scene with jukebox interactable.

Key elements:
- **Jukebox interactable**: `<InteractableObject>` — clicking sends `JUKEBOX_CONNECT` and opens `DjQueuePanel`
- **JukeboxStatusBubble**: `<Html>` (from drei) positioned above the jukebox, renders a white pill speech bubble with monospace text showing who's using the jukebox ("you are using the jukebox" / "{name} is using the jukebox"). Only visible when occupied.
- **No DJ booth** — the jukebox IS the music interaction point

**`client-3d/src/scene/GameScene.tsx`** routing:
```tsx
{roomType === 'myroom' ? <JapaneseRoom ... />
 : roomType === 'jukebox' ? <JukeboxRoom ... />
 : <Room ... />}
```

Note: Custom rooms with `musicMode: 'jukebox'` use the same scene as regular custom rooms (`<Room />`). The `JukeboxRoom` scene is only for rooms created as `RoomType.JUKEBOX`. The music mode is independent of the visual scene.

### Phase 7: MyRoom Boombox

**`scripts/build-models.mjs`** — Add `buildBoombox()`:
- Retro boombox/CD player: boxy body, two speaker grilles, cassette/CD slot, antenna, carry handle
- Colors: dark gray body, silver grilles, colored buttons
- ~0.5W × 0.3H × 0.2D

**`client-3d/src/scene/JapaneseRoom.tsx`**
- Add boombox GLB on the low table or near the computer desk
- Wrap in `<InteractableObject interactDistance={2.0} onInteract={() => openDjQueue()}>`
- Clicking opens `DjQueuePanel` in jukebox/personal mode

### Phase 8: GLB Models

**`scripts/build-models.mjs`** — New builders:

| Model | Description |
|-------|-------------|
| `jukebox.glb` | Classic Wurlitzer-style jukebox: curved top with rainbow arch, front panel with record selector, coin slot, speaker grille, wooden sides. ~1.0W × 1.8H × 0.6D. Emissive colored panels for glow. |
| `boombox.glb` | Portable retro boombox: rectangular body, dual speaker cones, cassette slot, antenna, carry handle. ~0.5W × 0.3H × 0.2D. |
| `bar-stool.glb` | Simple bar stool: 4 legs, round seat, optional backrest. ~0.4W × 0.9H × 0.4D |
| `neon-sign.glb` | Wall-mounted "JUKEBOX" or music note neon sign. Emissive tube geometry. |

### Phase 9: Collision Boxes

**`client-3d/src/input/usePlayerInput.ts`**
- Add `JUKEBOX_COLLISION_BOXES` for the jukebox room layout
- Extend `getCollisionBoxes()` to handle `'jukebox'` room type
- `getRoomBounds()` returns appropriate bounds for jukebox room (8×8 → `halfX: 400, halfY: 400`)

### Phase 10: Lobby Integration

**`client-3d/src/ui/CustomRoomBrowser.tsx`**
- Display `musicMode` badge per room listing ("DJ" or "Jukebox" pill/tag)
- Rooms are filterable by type (optional, can defer)

---

## Deferred / Future

- **Max tracks per user limit** — Count `jukeboxPlaylist.filter(i => i.addedBySessionId === id).length` in `JukeboxAddCommand`
- **Voting/likes on tracks** — Community feature
- **Custom room scene variation** — Custom rooms with jukebox mode still use the Club scene; consider letting them pick a scene too
- **Video display in jukebox room** — Wall screen showing current video (same VideoDisplay pattern)

---

## Files Summary

| Status | Action | File |
|--------|--------|------|
| ✅ | Modify | `types/Rooms.ts` — Add JUKEBOX enum, musicMode to IRoomData |
| ✅ | Modify | `types/Messages.ts` — Add JUKEBOX_* enums + JUKEBOX_CONNECT/DISCONNECT |
| ✅ | Modify | `types/Dtos.ts` — Add JukeboxItemDto |
| ✅ | Modify | `server/src/rooms/schema/OfficeState.ts` — JukeboxItem + jukeboxPlaylist + jukeboxOccupantId/Name |
| ✅ | Create | `server/src/rooms/commands/JukeboxCommand.ts` — All jukebox commands incl. connect/disconnect |
| ✅ | Modify | `server/src/rooms/ClubMutant.ts` — musicMode, jukebox handlers, occupant tracking, guard DJ handlers |
| ✅ | Modify | `server/src/index.ts` — Register JUKEBOX room |
| ✅ | Create | `client-3d/src/stores/jukeboxStore.ts` — Shared jukebox state + occupant tracking |
| ✅ | Modify | `client-3d/src/stores/gameStore.ts` — musicMode |
| ✅ | Modify | `client-3d/src/network/NetworkManager.ts` — Schema sync + methods + jukebox_busy toast |
| ✅ | Modify | `client-3d/src/ui/NowPlaying.tsx` — Hide visible UI in jukebox mode (audio-only ReactPlayer) |
| ✅ | Modify | `client-3d/src/ui/DjQueuePanel.tsx` — Jukebox mode: occupant status, mini player at top, search, track list |
| ✅ | Modify | `client-3d/src/ui/MyPlaylistsPanel.tsx` — Hide "add to jukebox" for non-occupants |
| ✅ | Modify | `client-3d/src/App.tsx` — nowPlayingVisible=false in jukebox mode, playlist panel top:0 |
| ✅ | Create | `client-3d/src/scene/JukeboxRoom.tsx` — Scene with jukebox interactable + Html speech bubble status |
| ✅ | Modify | `client-3d/src/scene/GameScene.tsx` — Route jukebox room |
| | Modify | `client-3d/src/ui/CreateRoomForm.tsx` — Music mode selector |
| | Modify | `client-3d/src/ui/CustomRoomBrowser.tsx` — Music mode badge |
| | Modify | `client-3d/src/ui/LobbyScreen.tsx` — Minor (jukebox rooms in browser) |
| | Modify | `client-3d/src/scene/JapaneseRoom.tsx` — Boombox interactable |
| | Modify | `scripts/build-models.mjs` — Jukebox + boombox + bar stool + neon sign |
| | Modify | `client-3d/src/input/usePlayerInput.ts` — Jukebox collision boxes |

---

## Verification

1. `pnpm build:models` — confirm new GLBs generated
2. Start server + 3D client
3. **Jukebox room**: Create via custom room flow with "Jukebox" mode → verify scene loads → click jukebox → add track from personal playlist → auto-plays → add more → sequential playback → track removed after playing → second player joins, adds tracks, sees shared playlist
4. **Custom room with jukebox mode**: Create custom room, select jukebox mode → verify Club scene renders but music uses jukebox system (not DJ queue)
5. **MyRoom boombox**: Join MyRoom → click boombox → add tracks → verify playback
6. **DJ queue rooms unaffected**: Join public/custom (DJ Queue mode) → verify DJ queue works exactly as before
7. **Any-client track complete**: Two players in jukebox room → player A adds track → player B's `onEnded` fires → track advances correctly
8. **Late-join sync**: Join jukebox room mid-song → correct seek offset + full playlist visible
9. **Disconnect persistence**: Player adds tracks, disconnects → tracks stay in jukebox
10. **Watchdog**: Kill client mid-track → server auto-advances after duration + 10s
11. **Room browser**: Custom room browser shows music mode badge on each room
