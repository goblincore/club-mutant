# Custom Character System — Roadmap

Allow users to create and upload custom paper-doll characters via the existing rig editor, then use them in-game with other players seeing the custom avatar in real time.

## Current State

- **Editor**: `tools/paper-rig-editor/` — standalone Vite app for assembling parts (PNG textures), setting pivots/offsets/bone roles, exporting `manifest.json` + texture files as a zip
- **Character format**: Folder with `manifest.json` (parts, animations, bone roles) + individual PNG textures per body part
- **Loading**: `client-3d/src/character/CharacterLoader.ts` fetches `{basePath}/manifest.json`, then loads each part's texture relative to that path. Already works with any URL.
- **Selection**: Lobby picks from hardcoded `CHARACTERS` array → stores `textureId` (uint8) on server `Player` schema → other clients map `textureId` → local folder path via `TEXTURE_ID_TO_CHARACTER` in `GameScene.tsx`
- **5 built-in characters** in `public/characters/default` through `default5`

## Core Problem

Characters are static assets baked into the build. To support user-created characters:
1. **Storage** — somewhere to persist uploaded textures + manifest
2. **Distribution** — a URL other clients can fetch the character from at runtime
3. **Identity** — a way to tell other clients "this player uses character X" (replacing the uint8 `textureId`)

## Proposed Phases

### Phase 1: Schema Change — `textureId` → `characterUrl`

Server `Player` schema currently has:
```
@type('uint8') textureId  // 0-4, indexes into built-in characters
```

Change to:
```
@type('string') characterUrl  // e.g. '/characters/default' or 'https://cdn.example.com/characters/abc123'
```

- Built-in characters keep existing paths (`/characters/default`, etc.)
- Custom characters use their uploaded URL
- `CharacterLoader.ts` already takes a `basePath` string and fetches `{basePath}/manifest.json` — works with any URL out of the box
- Remove the `TEXTURE_ID_TO_CHARACTER` mapping in `GameScene.tsx`; pass `player.characterUrl` directly as `characterPath`
- `gameStore.selectedCharacterPath` is already a string — no change needed

**Affected files:**
- `server/src/rooms/schema/OfficeState.ts` — Player schema
- `server/src/rooms/ClubMutant.ts` — join handler, player action command
- `types/AnimationCodec.ts` — remove `TEXTURE_IDS` / `sanitizeTextureId` if no longer needed
- `client-3d/src/scene/GameScene.tsx` — remove `TEXTURE_ID_TO_CHARACTER`, pass `characterUrl` directly
- `client-3d/src/ui/LobbyScreen.tsx` — send `characterUrl` instead of `textureId`
- `client-3d/src/network/NetworkManager.ts` — join options

### Phase 2: Upload Endpoint

**Option A: Server filesystem (dev/prototype)**
- Colyseus server accepts multipart upload at `POST /api/characters`
- Validates manifest structure, limits file sizes (512KB per texture, 8 parts max)
- Stores in `server/public/user-characters/{hash}/`
- Returns `characterUrl` pointing to the hosted files

**Option B: Object storage (production)**
- S3/R2/Supabase Storage
- Upload to `characters/{userId}/{hash}/`
- Returns CDN URL

**Recommendation:** Start with Option A, migrate to B later.

### Phase 3: Lobby Upload Flow

- Add "Upload Custom" option in `LobbyScreen.tsx` alongside built-in roster
- File picker accepts `.zip` (the export format from paper-rig-editor)
- Client uploads zip → server validates + stores → returns `characterUrl`
- Store URL in `gameStore.selectedCharacterPath`
- Optionally persist in `localStorage` so guest users keep their character

### Phase 4: Fallback + Safety

- If a custom character fails to load (network error, invalid manifest), fall back to `/characters/default`
- `PaperDoll` already returns `null` while loading — add a timeout + fallback path
- Server-side validation: check manifest structure, sanitize filenames, enforce size limits
- Optional content moderation (flag for review, or restrict to trusted users initially)

### Phase 5: Persistence + Editor Embed (future)

- **Authenticated users**: Store `characterUrl` in user profile DB
- **Guest users**: `localStorage` only
- **Embed editor**: Mount paper-rig-editor directly in the client as a modal/route (larger effort, nice-to-have — users can use standalone editor + upload for now)

## What Already Works (No Changes Needed)

| Component | Why |
|---|---|
| `CharacterLoader.ts` | Already URL-based, fetches `{basePath}/manifest.json` |
| `PaperDoll.tsx` | Already takes `characterPath: string` prop |
| `loadCharacterCached` | Already caches by URL string |
| `gameStore.selectedCharacterPath` | Already a string |
| Paper-rig-editor export format | Already produces the right manifest |

## What Needs Building

| Component | Effort | Phase |
|---|---|---|
| Schema migration (`textureId` → `characterUrl`) | Small | 1 |
| Remove `TEXTURE_ID_TO_CHARACTER` mapping | Small | 1 |
| Upload endpoint on server | Medium | 2 |
| Lobby "Upload Custom" UI | Medium | 3 |
| Fallback + validation | Small | 4 |
| localStorage persistence | Small | 4 |
| Editor embed in client | Large | 5 |

## Data Flow

```
Editor → Export zip (manifest.json + PNGs)
  ↓
Client uploads to server (POST /api/characters)
  ↓
Server validates + stores, returns characterUrl
  ↓
Client joins room with { name, characterUrl }
  ↓
Server stores characterUrl on Player schema, syncs to all clients
  ↓
Other clients' PaperDoll fetches manifest + textures from characterUrl
```
