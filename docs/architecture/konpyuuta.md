# KonpyuuTA — In-World Operating System

## Overview

KonpyuuTA is an in-world mini-OS that opens when players interact with computer terminals in Club Mutant. It uses a **React-based shell** (window manager, taskbar, desktop) with a DOS/BIOS-style boot sequence. Apps are vanilla JS HTML files loaded as single-level iframes. A **postMessage bridge** connects apps to the main Club Mutant app — giving them access to player profiles, friends, direct messaging, playlists, wall posts, and YouTube search.

## Architecture

```
┌────────────────────── client-3d (React/R3F) ───────────────────────┐
│                                                                     │
│  KonpyuuTAShell.tsx (main shell container)                         │
│    ├─ KonpyuuTABoot.tsx (DOS POST animation)                       │
│    ├─ KonpyuuTADesktop.tsx (icon grid, wallpaper)                  │
│    ├─ KonpyuuTAWindow.tsx (draggable/resizable per app)            │
│    │    └─ <iframe src="/konpyuuta/apps/X.html">  (single level)  │
│    │         └─ bridge-sdk.ts → parent.postMessage                 │
│    └─ KonpyuuTATaskbar.tsx (window buttons, clock, power)          │
│                                                                     │
│  KonpyuuTABridgeHost.ts ◄──── postMessage ────► bridge-sdk.ts     │
│    ├─ Multi-iframe support (registerIframe/unregisterIframe)       │
│    ├─ Routes responses by event.source per request ID              │
│    ├─ Nakama client calls + YouTube Go service                     │
│    └─ Rate limiting (10 req/s/method)                              │
│                                                                     │
│  konpyuutaStore.ts (Zustand)        konpyuutaEvents.ts (event bus) │
│    ├─ windows Map + z-order           └─ push events to apps       │
│    ├─ bootPhase (off/booting/desktop)                              │
│    └─ activeVideo                                                  │
│                                                                     │
│  GameScene.tsx: SceneContent returns null when osActive=true       │
└─────────────────────────────────────────────────────────────────────┘

┌─────── packages/konpyuuta ──────┐    ┌────── nakama/modules ──────────┐
│ static/                          │    │ index.js (ES5 only)            │
│   ├─ apps/   profile, friends,   │    │   ├─ send_message RPC         │
│   │          mail, mutantbook,   │    │   ├─ list_conversations RPC   │
│   │          mutanttube          │    │   ├─ get/mark_read RPCs       │
│   └─ konpyuuta-components.js         │    │   ├─ create/get/delete         │
│ src/                             │    │   │  wall_post RPCs            │
│   ├─ bridge-sdk.ts → IIFE       │    │   └─ save/list/delete          │
│   └─ types.ts                    │    │      playlist RPCs             │
│ build.mjs (esbuild)             │    └────────────────────────────────┘
│   └─ injects bridge-sdk into    │
│      each apps/*.html            │    ┌────── services/youtube-api ────┐
└──────────────────────────────────┘    │ Go service (ytsearch lib)      │
                                        │   ├─ /search (with viewCount)  │
                                        │   ├─ /resolve/{videoId}        │
                                        │   └─ /proxy/{videoId}          │
                                        └────────────────────────────────┘
```

## Boot Sequence

When a player clicks a computer terminal:
1. `uiStore.setOsActive(true)` → Canvas stops rendering (SceneContent returns null)
2. `konpyuutaStore.setBootPhase('booting')` → `KonpyuuTABoot` renders DOS POST animation (~2.6s)
3. Boot completes → `setBootPhase('desktop')` → Shell renders desktop + taskbar
4. ESC or power button → `setBootPhase('off')`, `setOsActive(false)` → Canvas resumes

## PostMessage Bridge Protocol

Three message types flow between the React host and app iframes:

| Type | Direction | Purpose |
|------|-----------|---------|
| `konpyuuta:request` | app iframe → host | Request with method + payload, expects response |
| `konpyuuta:response` | host → app iframe | Response with payload or error, routed by event.source |
| `konpyuuta:push` | host → all iframes | Unsolicited event (new mail, presence update, etc.) |

### Request Methods

| Method | Payload | Returns |
|--------|---------|---------|
| `profile.getSelf` | — | `UserProfile` |
| `profile.getUser` | `{ userId }` | `UserProfile` |
| `friends.list` | `{ state? }` | `{ friends: FriendEntry[] }` |
| `friends.add` | `{ userId?, username? }` | `{ success }` |
| `friends.remove` | `{ userId }` | `{ success }` |
| `mail.send` | `{ recipientId, subject, body }` | `{ messageId }` |
| `mail.listConversations` | `{ cursor? }` | `{ conversations, cursor? }` |
| `mail.getMessages` | `{ otherUserId, cursor? }` | `{ messages, cursor? }` |
| `mail.markRead` | `{ otherUserId }` | `{ success }` |
| `playlists.list` | — | `{ playlists: PlaylistEntry[] }` (includes items) |
| `playlists.create` | `{ name }` | `Playlist` |
| `playlists.addVideo` | `{ playlistId, video }` | `{ success }` |
| `playlists.removeVideo` | `{ playlistId, videoId }` | `{ success }` |
| `wall.getPosts` | `{ userId, cursor? }` | `{ posts, cursor? }` |
| `wall.createPost` | `{ targetUserId, content }` | `WallPost` |
| `wall.deletePost` | `{ postId, targetUserId }` | `{ success }` |
| `youtube.search` | `{ query }` | `Video[]` |
| `youtube.resolve` | `{ videoId }` | `{ url, expiresAt }` |
| `youtube.importPlaylist` | `{ url }` | `Playlist` |
| `video.play` | `{ videoId, title }` | `{ success }` |
| `video.stop` | — | `{ success }` |

### Push Events

| Event | Payload | Source |
|-------|---------|--------|
| `system.connected` | `{ userId, username }` | Sent per iframe on load |
| `mail.newMessage` | `MailMessage` | Nakama notification (code 100) |
| `friends.presenceUpdate` | `{ joins, leaves }` | Colyseus presence |

## Bridge Injection

The `build.mjs` script automatically injects `<script src="../konpyuuta-bridge.js"></script>` into every app HTML file in `dist/apps/`. The bridge-sdk creates `window.KonpyuuTA` which sends `parent.postMessage(...)` to the React shell. Apps use `KonpyuuTAApp.init(theme, callback)` to wait for the bridge, with a polling fallback.

On iframe load, `KonpyuuTAWindow.tsx` calls `bridge.registerIframe(iframe)` and after a short delay sends `system.connected` to that specific iframe via `bridge.sendConnectedTo(iframe)`.

## Apps

| App | File | Description |
|-----|------|-------------|
| Profile | `apps/profile.html` | View/edit profile, look up players |
| Friends | `apps/friends.html` | Friends list, online status |
| Mail | `apps/mail.html` | Direct messaging inbox |
| MutantBook | `apps/mutantbook.html` | Facebook-style profiles + wall posts |
| MutantTube | `apps/mutanttube.html` | YouTube search, playlists, inline video |

### MutantTube Homepage Algorithm

The homepage generates 3 random search queries from word pools (e.g. "backyard fish", "old setup timelapse"), fires them in parallel, merges + dedupes results, and sorts by **lowest view count first** — surfacing obscure, low-view videos.

## Direct Messaging (DM) System

### Storage Design (Nakama Storage Engine)

**Dual-write pattern** — each message stored twice:
- `dm_messages` collection, key = `{timestamp}_{messageId}`
  - Sender copy: `userId = senderId`
  - Recipient copy: `userId = recipientId`

**Conversation index** — secondary collection for efficient inbox listing:
- `dm_conversations` collection, key = `conv_{otherUserId}`
  - Fields: `otherUserId`, `otherUsername`, `lastMessagePreview`, `lastMessageAt`, `unreadCount`
  - Updated atomically on every send/receive

## Build System

- **Package**: `@club-mutant/konpyuuta` in `packages/konpyuuta/`
- **Build**: `node build.mjs` — copies `static/` to `dist/`, compiles `bridge-sdk.ts` to IIFE with esbuild, injects bridge script into each `apps/*.html`
- **Dev**: Vite plugin (`client-3d/vite.config.ts`) serves `dist/` at `/konpyuuta/` in dev, copies to `client-3d/dist/konpyuuta/` in production
- **Deployment**: Cloudflare Pages `_redirects` has passthrough rule `/konpyuuta/* /konpyuuta/:splat 200`

## Key Files

| File | Role |
|------|------|
| `client-3d/src/stores/konpyuutaStore.ts` | Window state, boot phase, active video |
| `client-3d/src/ui/konpyuuta/KonpyuuTAShell.tsx` | Main shell container, bridge lifecycle |
| `client-3d/src/ui/konpyuuta/KonpyuuTABoot.tsx` | DOS POST boot animation |
| `client-3d/src/ui/konpyuuta/KonpyuuTADesktop.tsx` | Desktop icons + wallpaper |
| `client-3d/src/ui/konpyuuta/KonpyuuTAWindow.tsx` | Draggable/resizable window + iframe |
| `client-3d/src/ui/konpyuuta/KonpyuuTATaskbar.tsx` | Bottom taskbar |
| `client-3d/src/ui/konpyuuta/appRegistry.ts` | App definitions (5 apps) |
| `client-3d/src/ui/konpyuuta/KonpyuuTABridgeHost.ts` | Host-side multi-iframe request handler |
| `client-3d/src/events/konpyuutaEvents.ts` | Event bus for push notifications |
| `packages/konpyuuta/build.mjs` | Build script |
| `packages/konpyuuta/src/bridge-sdk.ts` | Client-side bridge SDK (`window.KonpyuuTA`) |
| `packages/konpyuuta/src/types.ts` | Shared TypeScript types |
| `packages/konpyuuta/static/konpyuuta-components.js` | Shared UI component library for apps |
| `packages/konpyuuta/static/apps/*.html` | App HTML files (vanilla JS) |
| `nakama/modules/index.js` | All RPCs (ES5) |
| `services/youtube-api/main.go` | YouTube search/resolve/proxy Go service |
