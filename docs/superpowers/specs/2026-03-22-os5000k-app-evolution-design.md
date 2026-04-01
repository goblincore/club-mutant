# KonpyuuTA App Evolution — Shared Module + MutantBook + MutantTube

## Context

KonpyuuTA is the in-world mini-OS in Club Mutant, running inside an iframe with a postMessage bridge to the React host. It currently has 9 apps as single HTML files with inline CSS/JS. As the OS gains more complex apps (social profile, video browser), the current pattern of copy-pasting bridge setup, UI patterns, and utilities across every app doesn't scale. This design introduces a shared module for reusability and two new themed apps: MutantBook (early Facebook) and MutantTube (early YouTube).

## Architecture: Enhanced Vanilla JS + Shared Module

**Approach:** Keep the single-HTML-file app pattern but add a shared `konpyuuta-components.js` module loaded by every app. Vanilla JS by default; individual apps can upgrade to Preact via esbuild if reactivity becomes necessary.

**Why vanilla JS:** Apps run in tiny iframes inside a retro OS. The aesthetic is intentionally lo-fi. Framework overhead isn't justified for apps this size. AI generates the code so DX isn't a concern. The shared module addresses the real pain point (reusability) without adding complexity.

## Shared Module: `konpyuuta-components.js`

Located at `packages/konpyuuta/static/konpyuuta-components.js`. Loaded by apps via `<script src="../konpyuuta-components.js">`.

### Bridge Setup
```
KonpyuuTAApp.init(themeName, callback)
```
Replaces the duplicated `waitForBridge()` pattern in every app. Polls for bridge availability, calls back when ready. Accepts a theme name for app-specific CSS variable injection.

### UI Builders (return DOM elements)
- `KonpyuuTAApp.toolbar(title, buttons[])` — standard toolbar with title + action buttons
- `KonpyuuTAApp.list(items, renderFn)` — scrollable list with custom item rendering
- `KonpyuuTAApp.feed(items, renderFn)` — timeline/feed layout (wall posts, video cards)
- `KonpyuuTAApp.tabs(tabDefs[])` — tabbed navigation with content switching
- `KonpyuuTAApp.pagination(loadMoreFn)` — infinite scroll or "Load More" button
- `KonpyuuTAApp.loading()` / `KonpyuuTAApp.empty(message)` — loading spinner and empty state
- `KonpyuuTAApp.avatar(userId, size)` — user avatar with fallback initial
- `KonpyuuTAApp.timeAgo(timestamp)` — relative time formatting ("2 hours ago")
- `KonpyuuTAApp.searchBar(placeholder, onSearch)` — debounced search input

### Utilities
- `KonpyuuTAApp.esc(str)` — XSS-safe HTML escaping (currently duplicated in every app)
- `KonpyuuTAApp.debounce(fn, ms)` — for search inputs
- `KonpyuuTAApp.formatDuration(seconds)` — video duration formatting ("3:42")

### Theming
Each app passes a theme name to `KonpyuuTAApp.init()` which injects CSS variables:
- `mutantbook` — Facebook blue (#3b5998), Lucida Grande font
- `mutanttube` — YouTube red (#cd201f), Arial, gray backgrounds
- `default` — standard gray gradient look

## MutantBook (Profile + Wall)

Early Facebook (2005) aesthetic. Blue header, tabbed layout, wall posts.

### Views
1. **Profile + Wall** (default) — profile header with avatar/bio/friends count, compose box, chronological wall posts
2. **Info tab** — extended profile (favorite song, links, member since). Uses existing Nakama profile metadata.
3. **Friends tab** — grid of friend avatars with online indicators. Click to visit profile. Reuses `friends.list` bridge method.

### Profile Header
- Avatar (from Nakama), username, bio, friend count
- Vibes count shown if economy is implemented; degrade gracefully (hide if unavailable)
- Add Friend / Remove Friend / Accept Request button (context-dependent)
- Navigate to any user's profile via search or friend click

### Wall Posts
- Only friends can post on each other's walls (enforced server-side)
- Each post: author avatar, username, text content, timestamp, delete button (own posts only)
- Compose box at top of wall: textarea + "Post" button
- Paginated with "Load More" button
- Content moderation: deferred. Wall posts are visible to anyone viewing the profile.

### Guest Users
Guests can view profiles and wall posts but cannot post or add friends. Show auth-gated message: "Log in to post on walls."

### File
`packages/konpyuuta/static/apps/mutantbook.html`

## MutantTube (YouTube Browser)

Early YouTube (2006) aesthetic. Red accent, gray backgrounds, star ratings, boxy layout.

### Views
1. **Homepage** — grid of videos from curated search queries (e.g., "lofi hip hop", "synthwave", "chillhop"). On load, picks a random query from a hardcoded list and displays results. No new backend endpoint needed — reuses `youtube.search`.
2. **Search Results** — list view with thumbnail, title, channel, view count, star rating, duration, description snippet. Each result has "Add to Playlist" button.
3. **Playlists** — list of user's playlists with video count and last updated. Click into a playlist to see its videos. Create new playlist button. These playlists sync bidirectionally with DJ queue playlists.
4. **Import Playlist** — paste a YouTube playlist URL, Go service resolves all videos (max 100), imports into a new MutantTube playlist.

### Playlist Sync
MutantTube playlists ARE DJ queue playlists — same Nakama Storage Engine collection (`playlists`), same underlying `save_playlist` RPC. No separate playlist CRUD RPCs are created. Instead, the bridge host handles `playlists.create`, `playlists.addVideo`, and `playlists.removeVideo` by reading the current playlist via `list_playlists`, modifying the items array in memory, and writing back via `save_playlist`. This avoids race conditions between two RPC paths writing to the same storage objects.

### Guest Users
Guests can search and browse videos but cannot save playlists. Show auth-gated message for playlist features.

### Future: OAuth YouTube Sync
When Google OAuth lands for Club Mutant auth (planned in auth security roadmap), extend with YouTube Data API scopes to auto-sync real YouTube playlists. The data model (playlists with video entries) is the same, so nothing gets thrown away.

### File
`packages/konpyuuta/static/apps/mutanttube.html`

## Type Definitions

### WallPost
```typescript
interface WallPost {
  postId: string;
  authorId: string;
  authorUsername: string;
  targetUserId: string;
  content: string;
  createdAt: string; // ISO 8601
}
```

### Video (matches Go service VideoResult)
```typescript
interface Video {
  id: string;        // YouTube videoId
  title: string;
  channelTitle: string;
  duration: number;  // seconds
  thumbnail: string; // URL
  isLive: boolean;
}
```

### Playlist (matches existing save_playlist schema)
```typescript
interface Playlist {
  id: string;        // playlist storage key
  name: string;
  items: Video[];
  updatedAt: string; // ISO 8601
}
```

## Bridge Extensions

### New Methods in `KonpyuuTABridgeHost.ts`

The bridge host needs to import `getNetwork()` from `NetworkManager` for YouTube methods (currently only imports from `nakamaClient.ts`).

| Method | Handler | Purpose |
|--------|---------|---------|
| `wall.getPosts` | `nakamaClient.getWallPosts()` → new Nakama RPC | Fetch wall posts (paginated) |
| `wall.createPost` | `nakamaClient.createWallPost()` → new Nakama RPC | Post on someone's wall |
| `wall.deletePost` | `nakamaClient.deleteWallPost()` → new Nakama RPC | Delete own post |
| `youtube.search` | `getNetwork().searchYouTube()` | Search videos via Go service |
| `youtube.resolve` | `getNetwork().resolveYouTube()` | Get playable URL for preview |
| `youtube.importPlaylist` | `getNetwork().importYouTubePlaylist()` → new Go endpoint | Import playlist videos |
| `playlists.create` | Read-modify-write via `save_playlist` RPC | Create empty playlist |
| `playlists.addVideo` | Read-modify-write via `save_playlist` RPC | Add video to playlist |
| `playlists.removeVideo` | Read-modify-write via `save_playlist` RPC | Remove video from playlist |

### New Bridge SDK Methods in `bridge-sdk.ts`

```typescript
// Wall
getWallPosts(userId: string, cursor?: string): Promise<{posts: WallPost[], cursor?: string}>
createWallPost(targetUserId: string, content: string): Promise<WallPost>
deleteWallPost(postId: string): Promise<void>

// YouTube
searchYouTube(query: string): Promise<Video[]>
resolveYouTube(videoId: string): Promise<{url: string, expiresAt: number}>
importPlaylist(playlistUrl: string): Promise<Playlist>

// Playlists
createPlaylist(name: string): Promise<Playlist>
addVideoToPlaylist(playlistId: string, video: Video): Promise<void>
removeVideoFromPlaylist(playlistId: string, videoId: string): Promise<void>
```

SDK method → bridge request mapping:
- `getWallPosts()` → `wall.getPosts`
- `createWallPost()` → `wall.createPost`
- `deleteWallPost()` → `wall.deletePost`
- `searchYouTube()` → `youtube.search`
- `resolveYouTube()` → `youtube.resolve`
- `importPlaylist()` → `youtube.importPlaylist`
- `createPlaylist()` → `playlists.create`
- `addVideoToPlaylist()` → `playlists.addVideo`
- `removeVideoFromPlaylist()` → `playlists.removeVideo`

## Nakama RPCs (ES5)

All in `nakama/modules/index.js`. Must be ES5 (no arrow fns, const, let, template literals).

### Wall Posts

**Collection:** `wall_posts`
- **Owner:** `targetUserId` (storage listed by target user for efficient reads)
- **Key format:** `{timestamp}:{postId}` (zero-padded timestamp for sort order)
- **Permission:** `permissionRead: 2` (public read), `permissionWrite: 0` (server-only write)
- **Fields:** `postId`, `authorId`, `authorUsername`, `targetUserId`, `content`, `createdAt`

**RPCs:**
- `create_wall_post` — validates content (max 500 chars), verifies author is a friend of target user (via `nk.friendsList`), rate limits (5 posts/min), writes to storage under target user's ID, sends Nakama notification (code 101) to target user
- `get_wall_posts` — `nk.storageList(targetUserId, 'wall_posts', limit, cursor)` returns paginated posts sorted by key (timestamp descending)
- `delete_wall_post` — reads post, verifies `authorId === ctx.userId`, then deletes

### Playlist CRUD

No new Nakama RPCs needed. The bridge host handles create/add/remove by:
1. Reading current playlists via existing `list_playlists` RPC
2. Modifying the items array in memory (add/remove video, or create new playlist)
3. Writing back via existing `save_playlist` RPC

This keeps playlist operations atomic through the existing RPC and avoids race conditions.

## Go YouTube Service Extension

### New Endpoint: `GET /playlist?url=<encoded_youtube_playlist_url>`
Resolves a YouTube playlist URL via `yt-dlp --flat-playlist` (metadata-only, no downloads), returns array of video metadata. Max 100 videos per playlist (matches `MAX_TRACKS_PER_PLAYLIST`). Timeout: 30 seconds. Rate limited: 1 concurrent playlist import per user.

## Build Changes

Minimal:
- Copy `konpyuuta-components.js` into `dist/` alongside existing static files (already handled by the existing copy step in `build.mjs`)
- No new build targets unless/until an app adopts Preact

## Key Files to Modify

| File | Change |
|------|--------|
| `packages/konpyuuta/static/konpyuuta-components.js` | **New** — shared module |
| `packages/konpyuuta/static/apps/mutantbook.html` | **New** — MutantBook app |
| `packages/konpyuuta/static/apps/mutanttube.html` | **New** — MutantTube app |
| `packages/konpyuuta/static/programs.js` | Add MutantBook + MutantTube to app registry |
| `packages/konpyuuta/src/bridge-sdk.ts` | Add wall, youtube, playlist convenience methods |
| `packages/konpyuuta/src/types.ts` | Add WallPost, Video, Playlist interfaces |
| `client-3d/src/ui/konpyuuta/KonpyuuTABridgeHost.ts` | Add wall, youtube, playlist request handlers; import `getNetwork()` |
| `client-3d/src/network/nakamaClient.ts` | Add wall post wrapper functions (createWallPost, getWallPosts, deleteWallPost) |
| `client-3d/src/network/NetworkManager.ts` | Add `importYouTubePlaylist()` method |
| `nakama/modules/index.js` | Add wall post RPCs (ES5) |
| `types/WallPost.ts` | **New** — shared WallPost type |

## Implementation Order

1. **Shared module** (`konpyuuta-components.js`) — foundation everything else depends on
2. **Nakama RPCs** — wall post RPCs (ES5, backend first)
3. **Bridge extensions** — new methods in host + SDK + nakamaClient wrappers
4. **MutantBook** — profile + wall app
5. **MutantTube** — YouTube browser with search + playlists + homepage
6. **Go service playlist endpoint** — for import feature
7. **Migrate existing apps** — optionally update mail/friends/profile to use shared module

## Verification

- `pnpm --filter @club-mutant/konpyuuta build` succeeds
- KonpyuuTA loads in client-3d with new apps in the programs menu
- MutantBook: view own profile, post on wall (friend-only enforced), view others' walls, navigate via friends
- MutantBook: guest users can view but not post (auth gate message shown)
- MutantTube: homepage loads random curated videos, search works, add to playlist, create playlist
- MutantTube: import playlist by URL (max 100 videos)
- Playlists created in MutantTube appear in DJ queue panel and vice versa
- Nakama RPCs respond correctly (test via curl or Nakama console)
- All existing apps still work (no regressions from shared module)
