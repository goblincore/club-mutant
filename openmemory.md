# Club Mutant — OpenMemory Guide

## Overview
Multiplayer virtual world: Colyseus 0.17 (real-time) + Nakama (auth/social sidecar). React + Three.js client, Go microservices, Node.js server, deployed on Hetzner VPS behind Caddy.

## Architecture

```
client-3d (React/R3F/Vite, port 5173+)
  └─ AuthScreen → Nakama (email/guest auth)
  └─ LobbyScreen → NetworkManager → Colyseus rooms
  └─ GameScene (Three.js / @react-three/fiber)

client-dream (React/Vite) — dream room iframe client

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

## Services

### youtube-api (Go, port 8081)
YouTube search, stream URL resolution, CORS-safe video proxy. No YouTube API key — uses web scraping + kkdai/youtube.
- `GET /search?q=&limit=` — search
- `GET /resolve/:videoId` — get direct stream URL (cached)
- `GET /proxy/:videoId` — stream through server
- `GET /browse?url=` — proxy-browse a web page (iframe use)
- Env: `PORT`, `YOUTUBE_API_CACHE_TTL`, `PROXY_URL`, `POT_PROVIDER_URL`

### dream-npc-go (Go, port 4000)
AI NPC chat for dream characters and bartender. Fiber v2, LRU cache (500 entries), rate limiting per IP/room.
- `POST /dream/npc-chat` — dream character conversation
- `POST /bartender/npc-chat` — bartender NPC conversation
- **Memory:** `npc/cogmem/` — cognitive sector memory (CaviraOSS model ported to Go). 5 sectors (episodic, semantic, procedural, emotional, reflective) with per-sector decay, composite scoring, waypoint graph, Gemini embeddings (768-dim). Per-personality sector weights. SQLite storage at `./data/cogmem.db`. Falls back to mem0 cloud API if cogmem unavailable.
- Env: `PORT`, `GEMINI_API_KEY` (required — chat + embeddings + classification), `COGMEM_DB_PATH` (default: `./data/cogmem.db`), `MEM0_API_KEY` (optional fallback)

### image-upload (Go, port 4001)
Chat image uploads. Resizes to 512px max, JPEG 80% quality, stores on Cloudflare R2.
- `POST /upload` — multipart (file + sessionId), returns CDN URL
- Max 2MB, 5 uploads/min per session
- Env: `PORT`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`

### pot-provider (port 4416)
YouTube Proof-of-Origin token provider (bgutil). Used internally by youtube-api. Deployed on Fly.io (`services/pot-provider`).

## Tools

### paper-rig-editor (`tools/paper-rig-editor`, Vite port 5174)
Visual 2D character rig editor. React + R3F + Zustand + JSZip.
- **Rig mode** — position parts, set pivots, parent-child hierarchy, z-index, animate clips
- **Slicer mode** — draw polygons on sprite sheets to extract character parts (background removal via API)
- **Export** — .zip of manifest.json + texture images
- Run: `cd tools/paper-rig-editor && pnpm dev`

## Key Env Vars
| Var | Service | Notes |
|-----|---------|-------|
| `NAKAMA_ENCRYPTION_KEY` | Colyseus server | Must match Nakama `--session.encryption_key` |
| `VITE_NAKAMA_HOST` | client-3d build | Default: `localhost` |
| `VITE_NAKAMA_PORT` | client-3d build | Default: `7350` |
| `VITE_NAKAMA_USE_SSL` | client-3d build | `true` in production |
| `VITE_NAKAMA_SERVER_KEY` | client-3d build | Default: `clubmutant_dev` |
| `GEMINI_API_KEY` | dream-npc-go | Gemini AI (chat + cogmem embeddings + classification) |
| `COGMEM_DB_PATH` | dream-npc-go | SQLite path for cognitive memory (default: `./data/cogmem.db`) |
| `MEM0_API_KEY` | dream-npc-go | Optional fallback if cogmem unavailable |
| `R2_*` | image-upload | Cloudflare R2 credentials |
| `PROXY_URL` | youtube-api | Residential proxy for YT extraction |

## Nakama Integration Status

### ✅ Phase 1 — Complete (local)
- Docker Compose dev stack (`docker-compose.dev.yml`)
- `server/src/lib/verifyNakamaToken.ts` — JWT bridge
- `client-3d/src/stores/authStore.ts` — Zustand auth state
- `client-3d/src/network/nakamaClient.ts` — SDK wrapper (login, register, token refresh)
- `client-3d/src/ui/AuthScreen.tsx` — login / register / guest UI
- All Colyseus room join methods pass `nakamaToken` when authenticated
- Auth gate in `App.tsx` — shows AuthScreen before lobby
- Guest access preserved (no token = anonymous flow unchanged)

### 🔜 Phase 1 — Production (not yet deployed)
- Generate secrets (`openssl rand -hex 16/32`)
- Add DNS A record for `nakama.mutante.club`
- Set `VITE_NAKAMA_*` in production build env
- `docker compose up -d --build` on VPS
- See full guide in `docs/ideas/nakama-sidecar.md`

### 🔜 Phase 2 — Future
- Friends / social graph, inventory / economy, leaderboards

## Nakama Key Components
- **AuthScreen** — login/register/guest, restores session on mount, sets `authReady=true`
- **authStore** — `authReady` false → App shows AuthScreen instead of lobby
- **nakamaClient** — singleton SDK client, `getValidToken()` auto-refreshes
- **verifyNakamaToken** — server-side HS256 verify, returns `{ uid, usn, exp, tid }` or null
- **NetworkManager.getAuthOptions()** — returns `{ nakamaToken }` or `{}` for guests

## LobbyScreen UI Flow
**Logged-in users** — Screen 1 shows carousel + 3 buttons (Global Lobby → direct join, Custom Rooms → browse sub-view, My Room → direct join). No name input. Username from authStore. CharacterSidePreview shows read-only name.
**Guests** — Screen 1 shows carousel + name input + Go! → Screen 2 choose (Global Lobby + Custom Rooms only; My Room hidden).
**Both** — invite link (`?room=ID`) auto-joins for logged-in, shown as indicator for guests.

## Session Lock (duplicate tab prevention)
`NetworkManager` uses `localStorage` key `club-mutant:session-lock` to block logged-in users from joining the same game from two tabs. Heartbeat every 10s, TTL 30s. Released on disconnect/leave/`beforeunload`. `isSessionActive()` exported from NetworkManager.ts.

## Local Dev Setup
```bash
# Nakama + Postgres
docker compose -f docker-compose.dev.yml up -d
# Admin console: http://localhost:7351  (admin / password)

export NAKAMA_ENCRYPTION_KEY=clubmutant_dev_encryption_key_32ch
cd server && pnpm dev
cd client-3d && pnpm dev
```

## User Defined Namespaces
- `nakama` — Nakama auth/social integration
- `colyseus` — Real-time server rooms and state
- `client` — React client components and stores
- `deploy` — Docker, Caddy, VPS deployment
- `services` — Go microservices (youtube-api, dream-npc, image-upload)
- `tools` — paper-rig-editor and other dev tooling
