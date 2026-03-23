# Club Mutant: Vite Migration + DJ/Playlist Rewrite Plan

## Goals

- Update this repo to build/run on modern systems.
- Keep the core ClubMutant-style multiplayer world (Phaser + Colyseus).
- Rewrite player/playlist logic with a clear, server-authoritative DJ rotation model.

## Key Decisions (Locked)

- **Client build tool**
  - Use **Vite** (aligned with upstream `kevinshen56714/SkyOffice`).
- **Playlists (Phase 1 persistence)**
  - **My Playlist (per-user)** persists in **`localStorage`**.
  - **Room Playlist (shared)** is visible to all users in the room and stored in **Colyseus room state** (ephemeral until DB is added).
- **DJ rotation model**
  - **Per-user rotation**.
  - User must be **standing at the booth** to be in rotation.
  - When it’s your turn, playback comes from **your personal queue**.
  - Users can **skip their own turn**.
- **Room playlist permissions**
  - Users can **remove only their own contributions** from the room playlist.

## Non-Goals / Intentionally Ignored

- Graphic/UI changes from upstream that don’t help the DJ feature.
- Previous “short playlist sync” implementation (`nextTwoPlaylist` / client pushing 1–2 items) — replacing with a new protocol.

---

## Phase Plan

### Phase A — Modernize client build (Vite)

Target outcome: `client/` runs with `npm run dev` and builds with `npm run build`.

- Align `client/package.json` scripts with upstream:
  - `dev`, `build`, `preview`
- Upgrade to React 18 (match upstream) unless a specific dependency blocks it.
- Replace CRA-specific wiring:
  - remove `react-scripts`, `react-app-rewired`, CRA env assumptions
- Ensure existing Phaser + Redux integration still works.

### Phase B — Shared Room Playlist (server authoritative, ephemeral)

Target outcome: all clients see the same room playlist and ownership rules are enforced.

- Add room playlist state to Colyseus schema.
- Add messages for add/remove.
- Enforce “remove only your own contribution” on the server.

### Phase C — DJ Rotation + Synced Playback (rewrite)

Target outcome: booth-driven DJ rotation plays each DJ’s queued track in sync for all users.

- Replace current booth/stream commands with new DJ rotation logic.
- Server becomes authoritative for:
  - who is currently DJ
  - which track is playing
  - when it started
- Clients are playback renderers (ReactPlayer or future player) with drift correction.

### Phase D — Persistence upgrade (later)

Target outcome: room playlist and user playlists persist via DB.

- Add auth or durable user identity.
- Persist:
  - `roomPlaylist` per `roomId`
  - `myPlaylist` per `userId`

---

## State Model (Proposed)

### Client Local State

- **My Playlist** (`localStorage`)
  - `myPlaylist.items: MyPlaylistItem[]`

```ts
type MyPlaylistItem = {
  id: string
  youtubeVideoId: string
  title: string
  durationSec: number
  addedAtMs: number
}
```

### Server Room State (Colyseus)

- **Room Playlist** (shared)

```ts
type RoomPlaylistItem = {
  id: string
  youtubeVideoId: string
  title: string
  durationSec: number
  addedAtMs: number
  addedBySessionId: string
}
```

- **DJ Rotation (standing-at-booth requirement)**

```ts
type DjRotationEntry = {
  sessionId: string
  boothId: number
  joinedAtMs: number
}
```

- **Playback**

```ts
type PlaybackState = {
  status: 'waiting' | 'playing'
  startedAtMs: number
  currentDjSessionId: string | null
  currentTrack: {
    youtubeVideoId: string
    title: string
    durationSec: number
  } | null
}
```

---

## Message Types (Proposed)

### Room playlist

- `ROOM_PLAYLIST_ADD`
  - payload: `{ item: { youtubeVideoId, title, durationSec } }`
  - server fills: `id`, `addedAtMs`, `addedBySessionId`
- `ROOM_PLAYLIST_REMOVE`
  - payload: `{ itemId: string }`
  - server validates owner (`addedBySessionId === client.sessionId`)

### DJ rotation (booth-driven)

- `DJ_JOIN_ROTATION`
  - payload: `{ boothId: number }`
  - called when user engages the booth
- `DJ_LEAVE_ROTATION`
  - payload: `{ boothId: number }`
  - called when user disengages/leaves booth
- `DJ_QUEUE_MY_TRACK`
  - payload: `{ track: { youtubeVideoId, title, durationSec } }`
  - server enqueues on the user’s personal DJ queue
- `DJ_SKIP_MY_TURN`
  - payload: `{}`
  - allowed only if `client.sessionId === playback.currentDjSessionId`

### Playback

- `PLAY_START`
  - payload: `{ playback: PlaybackState }`
- `PLAY_STOP`
  - payload: `{}`
- (optional) `PLAY_SYNC`
  - payload: `{ startedAtMs: number }`

---

## Sync Algorithm (Client)

- On `PLAY_START`, compute offset:
  - `offsetSec = (Date.now() - startedAtMs) / 1000`
  - start player at `offsetSec`.
- Optional drift correction:
  - every N seconds compare `playerCurrentTime` vs `offsetSec`.
  - if drift > ~0.75s: seek to `offsetSec`.

---

## Notes / Migration Risks

- Current repo is CRA-based; upstream client has already moved to Vite.
- Current playlist/stream code mixes responsibilities (client decides next track, server tries to patch sync). This rewrite makes the server authoritative.
