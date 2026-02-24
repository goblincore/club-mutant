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
JUKEBOX_ADD, JUKEBOX_REMOVE, JUKEBOX_PLAY, JUKEBOX_STOP, JUKEBOX_SKIP, JUKEBOX_TRACK_COMPLETE
```

### D4: Playback Logic

- **Auto-play on first add**: Adding a track when jukebox is idle auto-starts it
- **Auto-advance**: On `JUKEBOX_TRACK_COMPLETE`, server removes finished track and starts next
- **Any client reports track end**: Any connected client can send `JUKEBOX_TRACK_COMPLETE`. Server deduplicates via `streamId`. Watchdog timer is backup (duration + 10s)
- **Anyone can play/stop/skip**: No DJ gating
- **Destructive**: Played tracks are removed via `splice()` — not cursor-based like the old 2D system

### D5: Track Ownership

- Each `JukeboxItem` stores `addedBySessionId`
- Anyone can add tracks
- Only the adder can remove their own tracks (server-enforced)
- Currently-playing track (index 0) CAN be removed (triggers skip)
- Tracks persist if the adder disconnects (removed only by play-through or explicit remove)

### D6: MyRoom "Personal" Mode

Mechanically identical to `'jukebox'` — same `jukeboxPlaylist` ArraySchema, same commands. Since MyRoom is `autoDispose: true` and typically single-player, it's effectively personal. No special server logic needed.

### D7: Infrastructure Reuse

| Component | Reuse |
|-----------|-------|
| `MusicStream` schema | Same — set `status`, `currentLink`, `startTime`, etc. |
| `START_MUSIC_STREAM` / `STOP_MUSIC_STREAM` | Same broadcast messages |
| `MUSIC_STREAM_TICK` | Same 5s drift correction |
| `musicStore` (client) | Same playback state |
| `NowPlaying.tsx` | Adapt — show play/stop/skip for all (no DJ gating) |
| `DjQueuePanel.tsx` | Adapt — jukebox shows shared playlist + add-from-personal |
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

### Phase 2: Server Commands

**New file: `server/src/rooms/commands/JukeboxCommand.ts`**

Helpers:
- `playNextJukeboxTrack(room)` — reads `jukeboxPlaylist[0]`, sets `musicStream` fields, increments `streamId`, broadcasts `START_MUSIC_STREAM`, starts watchdog
- `stopJukeboxStream(room)` — clears `musicStream`, broadcasts `STOP_MUSIC_STREAM`, clears watchdog

Commands:
- **`JukeboxAddCommand`** — push `JukeboxItem`, `prefetchVideo()`, auto-start if idle
- **`JukeboxRemoveCommand`** — validate `addedBySessionId`, splice. If removing index 0: stop + start next
- **`JukeboxPlayCommand`** — start/resume if tracks exist
- **`JukeboxStopCommand`** — stop stream but keep tracks in list
- **`JukeboxSkipCommand`** — remove index 0, start next or stop
- **`JukeboxTrackCompleteCommand`** — dedup via `streamId`, remove index 0, start next or stop

### Phase 3: Server Room Integration

**`server/src/rooms/ClubMutant.ts`**
- Add `musicMode` field, computed in `onCreate()`:
  - If `isPublic` → `'djqueue'`
  - If room options include `musicMode` → use it
  - If `RoomType.MYROOM` → `'personal'`
  - Default → `'djqueue'`
- Register `JUKEBOX_*` handlers gated on `musicMode !== 'djqueue'`
- Guard `DJ_QUEUE_*` and `ROOM_QUEUE_PLAYLIST_*` handlers with `musicMode === 'djqueue'`
- `onLeave`: jukebox tracks from disconnected player stay in playlist
- Reuse existing `startTrackWatchdog()` / `clearTrackWatchdog()` / tick interval for jukebox

**`server/src/index.ts`**
- Register `RoomType.JUKEBOX` with `enableRealtimeListing()` and `musicMode: 'jukebox'`
- Update `RoomType.MYROOM` options to include `musicMode: 'personal'`

### Phase 4: Client Network + Stores

**New file: `client-3d/src/stores/jukeboxStore.ts`**
```ts
interface JukeboxState {
  playlist: JukeboxItemDto[]   // from schema sync
  setPlaylist(items: JukeboxItemDto[]): void
  addItem(item: JukeboxItemDto): void
  removeItem(id: string): void
  clear(): void
}
```

**`client-3d/src/stores/gameStore.ts`**
- Extend `roomType`: `'public' | 'custom' | 'myroom' | 'jukebox' | null`
- Add `musicMode: 'djqueue' | 'jukebox' | 'personal' | null`

**`client-3d/src/network/NetworkManager.ts`**
- In `wireRoomListeners()`: add `jukeboxPlaylist` schema `onAdd`/`onRemove` callbacks → update `jukeboxStore`
- New methods: `addToJukebox()`, `removeFromJukebox()`, `jukeboxPlay()`, `jukeboxStop()`, `jukeboxSkip()`, `jukeboxTrackComplete()`
- New join methods: `joinJukeboxRoom()`, `createJukeboxRoom()` (or extend `createCustomRoom` with `musicMode` option)

### Phase 5: Client UI

**`client-3d/src/ui/NowPlaying.tsx`**
- When `musicMode === 'jukebox' || 'personal'`:
  - Play/stop/skip available to ALL players (no DJ gating)
  - Show track title + elapsed time
  - "Up next: {jukeboxPlaylist[1].title}" from `jukeboxStore`
  - `onEnded` → `getNetwork().jukeboxTrackComplete()`
  - Show "added by {name}" instead of DJ name

**`client-3d/src/ui/DjQueuePanel.tsx`**
- When `musicMode === 'jukebox' || 'personal'`:
  - Replace "DJ Queue" tab with "Jukebox" tab showing shared `jukeboxStore.playlist`
  - Each track: title, duration, who added it, remove button (own tracks only)
  - Index 0 highlighted as "now playing"
  - "My Playlists" tab: same as now, but "+" adds to jukebox via `addToJukebox()`
  - Search adds to jukebox directly

**`client-3d/src/ui/CreateRoomForm.tsx`**
- Add music mode selector (two radio buttons or toggle):
  - "DJ Queue" (default) — collaborative round-robin
  - "Jukebox" — shared playlist, anyone adds/plays
- Pass `musicMode` to `getNetwork().createCustomRoom()`

**`client-3d/src/ui/LobbyScreen.tsx`**
- Jukebox rooms appear in `CustomRoomBrowser` alongside regular custom rooms
- The room browser shows music mode icon/label per room
- No need for a separate "Jukebox" lobby button — they're created via custom room flow with jukebox mode selected

### Phase 6: Jukebox Room Scene

**New file: `client-3d/src/scene/JukeboxRoom.tsx`**

A retro bar/lounge vibe room. Smaller than the club (8×8 instead of 12×12).

Layout concept:
- **Centerpiece**: A retro jukebox machine (GLB model) against the back wall, wrapped in `<InteractableObject>` — clicking it opens `DjQueuePanel`
- **Floor**: Checkered tile pattern (new shader or reuse TvStaticFloor with different colors)
- **Walls**: Dark wood paneling (procedural shader or BrickWallMaterial variant)
- **Furniture**: A few bar stools/tables scattered around, a neon sign on the wall
- **Lighting**: Warm dim ambient + colored accent lights from the jukebox (purple/pink glow)
- **Skybox**: `NightSky` (reuse from MyRoom)
- **Video display**: Wall-mounted screen (same `VideoDisplay` pattern as Room.tsx) showing current track's video
- **No DJ booth / no eggs** — the jukebox IS the music interaction point

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

| Action | File |
|--------|------|
| Modify | `types/Rooms.ts` — Add JUKEBOX enum, musicMode to IRoomData |
| Modify | `types/Messages.ts` — Add JUKEBOX_* enums |
| Modify | `types/Dtos.ts` — Add JukeboxItemDto |
| Modify | `server/src/rooms/schema/OfficeState.ts` — JukeboxItem + jukeboxPlaylist |
| Create | `server/src/rooms/commands/JukeboxCommand.ts` — All jukebox commands |
| Modify | `server/src/rooms/ClubMutant.ts` — musicMode, jukebox handlers, guard DJ handlers |
| Modify | `server/src/index.ts` — Register JUKEBOX room |
| Create | `client-3d/src/stores/jukeboxStore.ts` — Shared jukebox state |
| Modify | `client-3d/src/stores/gameStore.ts` — roomType + musicMode |
| Modify | `client-3d/src/network/NetworkManager.ts` — Schema sync + methods |
| Modify | `client-3d/src/ui/NowPlaying.tsx` — Jukebox controls |
| Modify | `client-3d/src/ui/DjQueuePanel.tsx` — Jukebox tab |
| Modify | `client-3d/src/ui/CreateRoomForm.tsx` — Music mode selector |
| Modify | `client-3d/src/ui/CustomRoomBrowser.tsx` — Music mode badge |
| Modify | `client-3d/src/ui/LobbyScreen.tsx` — Minor (jukebox rooms in browser) |
| Create | `client-3d/src/scene/JukeboxRoom.tsx` — New scene |
| Modify | `client-3d/src/scene/JapaneseRoom.tsx` — Boombox interactable |
| Modify | `client-3d/src/scene/GameScene.tsx` — Route jukebox room |
| Modify | `scripts/build-models.mjs` — Jukebox + boombox + bar stool + neon sign |
| Modify | `client-3d/src/input/usePlayerInput.ts` — Jukebox collision boxes |

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
