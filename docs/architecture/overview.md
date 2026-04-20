# Club Mutant — Architecture Overview

## Overview
Multiplayer virtual world: Colyseus 0.17 (real-time) + Nakama (auth/social sidecar). React + Three.js client, Go microservices, Node.js server, deployed on Hetzner VPS behind Caddy.

## System Diagram

```
client-3d (React/R3F/Vite, port 5173+)
  └─ AuthScreen → Nakama (email/guest auth)
  └─ LobbyScreen → NetworkManager → Colyseus rooms
  └─ GameScene (Three.js / @react-three/fiber)

server (Colyseus 0.17, Node.js, port 2567)
  └─ ClubMutant.ts — onAuth verifies Nakama JWT → onJoin uses uid as playerId
  └─ lib/verifyNakamaToken.ts — HS256 JWT verification

Nakama (Go sidecar, port 7350/7351) — auth, accounts, social
  └─ Postgres — Nakama DB

Go microservices:
  └─ youtube-api  (port 8081) — search, resolve, stream proxy
  └─ dream-npc-go (port 4000) — AI NPC chat (Gemini + cogmem)
  └─ image-upload  (port 4001) — R2/CDN image upload
  └─ pot-provider  (port 4416) — YouTube PO token (Fly.io)

Caddy — reverse proxy, TLS
tools/paper-rig-editor — standalone Vite app for character rig authoring
```

## Monorepo Packages

```
Root
├── client/          Original Phaser 2D client (legacy, kept as alt implementation)
├── client-3d/       React/R3F/Vite 3D client (active)
├── server/          Colyseus multiplayer server
├── types/           Shared TypeScript types
├── loadtest/        Load testing utilities
├── services/        Go microservices
├── nakama/          Nakama config + runtime modules (ES5 only)
├── tools/           paper-rig-editor
└── deploy/          Deployment configs
```

## Dependency Graph

### Build-time (imports)
```
types ──→ server        (imports @club-mutant/types)
types ──→ client-3d     (imports @club-mutant/types)
konpyuuta → client-3d   (iframe embed, must build konpyuuta first)
acs-web → client-3d     (WASM import)
```

### Runtime (network calls)
```
client-3d ──WebSocket──→ server         (Colyseus rooms)
client-3d ──HTTP──────→ nakama          (auth, profiles, playlists, DMs)
server ────HTTP──────→ nakama           (JWT verification)
server ────HTTP──────→ dream-npc-go     (NPC chat proxy)
server ────HTTP──────→ youtube-api      (music search/resolve)
youtube-api ──HTTP───→ pot-provider     (YouTube PO tokens)
```

### Build order
1. `types` (no deps)
2. `packages/konpyuuta` + `packages/acs-web` (no deps on workspace packages)
3. `server`, `client-3d` (depend on types, konpyuuta)

## Services

### youtube-api (Go, port 8081)
YouTube search, stream URL resolution, CORS-safe video proxy. No YouTube API key — uses web scraping + kkdai/youtube.
- `GET /search?q=&limit=` — search
- `GET /resolve/:videoId` — get direct stream URL (cached)
- `GET /proxy/:videoId` — stream through server
- `GET /browse?url=` — proxy-browse a web page
- Env: `PORT`, `YOUTUBE_API_CACHE_TTL`, `PROXY_URL`, `POT_PROVIDER_URL`

### dream-npc-go (Go, port 4000)
AI NPC chat for dream characters and bartender (Lily). Fiber v2, LRU cache (500 entries, 1hr TTL — skipped when music playing), rate limiting per IP/room. Gemini 2.5 Flash Lite.
- `POST /dream/npc-chat` — dream character conversation
- `POST /bartender/npc-chat` — bartender NPC conversation (+ cogmem if playerId present)
- **Cogmem:** `npc/cogmem/` — cognitive sector memory (CaviraOSS port). 5 sectors, composite scoring, Gemini embeddings (768-dim), SQLite.
- Env: `PORT`, `GEMINI_API_KEY`, `COGMEM_DB_PATH`, `MEM0_API_KEY` (optional fallback)

### image-upload (Go, port 4001)
Chat image uploads. Resizes to 512px max, JPEG 80%, stores on Cloudflare R2.
- `POST /upload` — multipart (file + sessionId), returns CDN URL
- Max 2MB, 5 uploads/min per session

### pot-provider (port 4416)
YouTube Proof-of-Origin token provider (bgutil). Deployed on Fly.io.

## Auth (Nakama)

- Flow: Nakama (email/guest) → JWT → `nakamaToken` in Colyseus join options → server verifies via `lib/verifyNakamaToken.ts`
- Auth state: `client-3d/src/stores/authStore.ts`
- AuthScreen → login/register/guest, restores session on mount, sets `authReady=true`
- nakamaClient — singleton SDK client, `getValidToken()` auto-refreshes
- NetworkManager.getAuthOptions() — returns `{ nakamaToken }` or `{}` for guests
- Runtime modules: `nakama/modules/index.js` (ES5 only — goja engine)

## Colyseus State Model

- Authoritative state: `OfficeState` (`server/rooms/schema/OfficeState.ts`)
- Key collections: `players` (MapSchema), `musicBooths` (ArraySchema), `djQueue` (ArraySchema), `currentDjSessionId`, `musicStream`
- Type model: Schema (server state) / IOfficeState interfaces (client typing) / DTOs (wire payloads in `types/Dtos.ts`)

## Key Env Vars
| Var | Service | Notes |
|-----|---------|-------|
| `NAKAMA_ENCRYPTION_KEY` | Colyseus server | Must match Nakama `--session.encryption_key` |
| `VITE_NAKAMA_HOST` | client-3d build | Default: `localhost` |
| `VITE_NAKAMA_PORT` | client-3d build | Default: `7350` |
| `VITE_NAKAMA_USE_SSL` | client-3d build | `true` in production |
| `GEMINI_API_KEY` | dream-npc-go | Chat + cogmem embeddings |
| `R2_*` | image-upload | Cloudflare R2 credentials |
| `PROXY_URL` | youtube-api | Residential proxy for YT extraction |

## LobbyScreen UI Flow
- **Logged-in**: Carousel + 3 buttons (Global Lobby, Custom Rooms, My Room). No name input.
- **Guests**: Carousel + name input + Go! → choose (Global Lobby + Custom Rooms only).
- **Invite links**: `?room=ID` auto-joins for logged-in, shown as indicator for guests.

## Session Lock
`NetworkManager` uses `localStorage` key `club-mutant:session-lock` to prevent duplicate tabs for logged-in users. Heartbeat every 10s, TTL 30s.
