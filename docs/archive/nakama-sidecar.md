# Nakama Sidecar — Social & Economy Layer

Run [Nakama](https://heroiclabs.com/docs/nakama/) alongside Colyseus: Colyseus handles real-time multiplayer (state sync, DJ queue, music streams), Nakama handles persistent social/economy features that would take months to build from scratch.

**Why not full migration?** Colyseus Schema auto-sync (binary delta patches, `onAdd`/`onRemove`/`listen`) has no Nakama equivalent. You'd rewrite thousands of lines of serialization code. See the full analysis in the plan archive if curious.

---

## What Nakama Gives You

### User Accounts & Auth
- Email/password, OAuth (Google, Apple, Discord, Steam), device ID
- Account linking (multiple auth providers per user)
- JWT sessions with refresh
- User metadata (16KB limit) for public profile data
- Online presence tracking
- [Docs](https://heroiclabs.com/docs/nakama/concepts/user-accounts/)

### Wallets (Virtual Currency)
- Multi-currency per user (key-value: string/integer pairs)
- **Server-authoritative** — clients cannot modify wallets, only the server runtime can
- Positive values to credit, negative to debit
- Transaction audit ledger
- IAP validation for Apple App Store & Google Play
- Pattern: premium currency (IAP) → soft currency (conversion) → items (purchase)
- **Gotcha:** Integer-only values (no decimals). Fine for coins/gems, not for fractional currencies
- **Gotcha:** No built-in item catalog/store — build on storage engine or use [Hiro](https://heroiclabs.com/hiro/) library
- [Docs](https://heroiclabs.com/docs/nakama/concepts/user-accounts/#virtual-wallet)

### Friends
- 4-state model: Friend, Invite Sent, Invite Received, Blocked
- Batch add by user ID or username
- Blocking prevents all communication
- Import from Facebook/Steam
- Direct 1-on-1 chat channels between friends
- Notifications on friend requests
- [Docs](https://heroiclabs.com/docs/nakama/concepts/friends/)

### Groups / Clans
- 4-tier hierarchy: Superadmin → Admin → Member → Join Request
- Public (open join) or private (invite only)
- Configurable max members (default: 100)
- Group chat channels
- Search/filter by name, language, open/closed
- **Gotcha:** Only one superadmin — if they leave without promoting, group is orphaned
- [Docs](https://heroiclabs.com/docs/nakama/concepts/groups-clans/)

### Leaderboards & Tournaments
- Score operators: `set`, `best`, `incr`, `decr`
- Ascending or descending sort
- CRON-based reset schedules with server callbacks
- "Around me" queries (nearby competitors)
- Tournaments: time-limited, max attempts, max opponents, reward callbacks
- **Gotcha:** Sort order immutable after creation — changing = delete + recreate (lose history)
- [Docs](https://heroiclabs.com/docs/nakama/concepts/leaderboards/)

### Notifications
- Persistent (stored until read, survives offline) + non-persistent (online only)
- Real-time delivery via WebSocket for connected clients
- Offline retrieval with cursor pagination
- Categorizable via numeric codes
- **Gotcha:** In-app only — no push notifications (FCM/APNs)
- [Docs](https://heroiclabs.com/docs/nakama/concepts/in-app-notifications/)

### Storage Engine
- Collection-based JSON document storage
- Per-object access control: Public Read / Owner Read / No Read × Owner Write / No Write
- Optimistic Concurrency Control (OCC) — conditional writes fail if version changed
- Transactional batch writes (all-or-nothing)
- System-owned objects (nil UUID) for global game data
- **Gotcha:** No full-text search on document contents
- **Gotcha:** No document TTL/expiration
- [Docs](https://heroiclabs.com/docs/nakama/concepts/collections/)

### Admin Console
- Built-in web UI on port 7351
- Inspect users, storage objects, matches, metrics
- No Colyseus equivalent in OSS

---

## Build-from-Scratch Comparison

| Feature | DIY Effort | What's hard about it |
|---------|-----------|---------------------|
| Multi-provider auth + linking | 2-4 weeks | OAuth flows, token refresh, session management, security |
| Server-authoritative wallet | 2-3 weeks | Atomicity, audit trail, race conditions |
| Friends (4-state + blocking) | 1-2 weeks | Bi-directional relationships, blocking edge cases |
| Groups with role hierarchy | 2-3 weeks | Permission system, lifecycle (create/join/kick/ban/promote) |
| Leaderboards + tournaments | 3-4 weeks | Rank calculation at scale, CRON resets, reward distribution |
| Notifications (persistent + RT) | 1 week | Offline queueing, real-time delivery |
| Per-user storage with OCC | 1-2 weeks | Versioning, permissions, batch transactions |
| Admin console | 2-3 weeks | Separate web app with auth |
| **Total** | **~14-22 weeks** | |
| **Nakama integration** | **~2 weeks** | Docker setup + client auth flow + data migration |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Client (Cloudflare Pages — mutante.club)                   │
│    @heroiclabs/nakama-js  (auth, storage, social, economy)  │
│    @colyseus/sdk          (real-time multiplayer)            │
└──────────┬──────────────────────┬───────────────────────────┘
           │ WebSocket            │ WebSocket + HTTP
           ▼                     ▼
┌─────────────────────┐  ┌─────────────────────────────────┐
│  Colyseus (Node.js) │  │  Nakama (Go + PostgreSQL)       │
│  :2567              │  │  :7350 (API) :7351 (console)    │
│                     │  │                                  │
│  Real-time:         │  │  Persistent:                     │
│  - Player positions │  │  - Auth (multi-provider)         │
│  - DJ queue state   │  │  - User profiles                 │
│  - Music streams    │  │  - Wallets / economy             │
│  - Chat bubbles     │  │  - Friends & groups              │
│  - NPC behavior     │  │  - Leaderboards                  │
│  - Reconnection     │  │  - Collectible persistence       │
│  - Jump/punch sync  │  │  - Playlists / favorites         │
│                     │  │  - Notifications                  │
│                     │  │  - Admin console                  │
└─────────────────────┘  └─────────────────────────────────┘
```

### Auth Bridge (Nakama → Colyseus)

1. Client authenticates with Nakama → gets JWT session
2. Client passes JWT in `joinOrCreate()` options: `{ token: nakamaSession.token }`
3. Colyseus `onAuth()` verifies JWT using Nakama's `session.encryption_key`
4. Extracts `userId` and links to Colyseus session

~50 lines of server code. Zero game logic changes.

---

## Deployment

Add to `deploy/hetzner/docker-compose.yml`:

```yaml
nakama:
  image: heroiclabs/nakama:latest
  depends_on:
    - postgres
  ports:
    - "7350:7350"   # Client API (WebSocket + HTTP)
    - "7351:7351"   # Admin console
  environment:
    - NAKAMA_SOCKET_SERVER_KEY=${NAKAMA_SERVER_KEY}
    - NAKAMA_SESSION_ENCRYPTION_KEY=${NAKAMA_ENCRYPTION_KEY}
  volumes:
    - ./nakama-data:/nakama/data
  restart: unless-stopped

postgres:
  image: postgres:16-alpine
  volumes:
    - pgdata:/var/lib/postgresql/data
  environment:
    - POSTGRES_DB=nakama
    - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
```

### Resource Footprint

| Service | RAM | Notes |
|---------|-----|-------|
| Nakama (Go) | ~100-200 MB idle | Lightweight Go binary |
| PostgreSQL | ~200-400 MB | Main resource consumer |
| **Added total** | **~300-600 MB** | Well within 8GB VPS headroom |

Nakama and Colyseus share the same PostgreSQL instance. Nakama manages its own tables via migrations. You can add custom Club Mutant tables alongside them (e.g., for mem0 self-hosting — see [self-hosted-mem0.md](self-hosted-mem0.md)).

---

## What It Replaces

| Currently Planned | Replaced By |
|-------------------|-------------|
| Supabase Auth | Nakama Auth (multi-provider, account linking) |
| Self-hosted PostgreSQL (custom) | Nakama's PostgreSQL (managed migrations) |
| Custom user accounts | Nakama accounts (built-in) |
| localStorage persistence | Nakama Storage Engine (per-user, server-side) |
| Custom admin panel | Nakama Console (built-in web UI) |
| Nothing (no economy) | Nakama Wallets (server-authoritative) |
| Nothing (no social) | Nakama Friends + Groups |

---

## Integration Effort

| Task | Time | Notes |
|------|------|-------|
| Nakama + PG Docker setup | 1 day | Config + Caddyfile routing |
| Client auth flow (`@heroiclabs/nakama-js`) | 2-3 days | Login/signup UI, session mgmt |
| Colyseus `onAuth` JWT bridge | 1 day | Verify Nakama JWT, extract userId |
| Migrate playlists to Nakama storage | 2-3 days | Replace localStorage |
| Migrate dream collectibles | 1 day | Data model already exists |
| User profile page | 2-3 days | Display name, avatar, stats |
| **Total** | **~2 weeks** | Incremental, no feature freeze |

---

## Limitations & Gotchas

- **Wallet integers only** — no decimal currencies
- **16KB user metadata cap** — use storage engine for larger data
- **No item catalog** — build on storage engine or use Hiro library
- **No push notifications** — in-app only (WebSocket + persistent)
- **Two client connections** — Colyseus WS + Nakama WS/HTTP
- **Small ecosystem** — `@heroiclabs/nakama-js` ~875 npm downloads/week
- **ES5-only server runtime** — custom Nakama server logic (RPCs) runs in goja (Go JS engine), no async/await. Keep RPCs simple; complex logic stays in Colyseus
- **OSS clustering is limited** — Nakama Enterprise needed for cross-node routing. Fine for sidecar use (social features don't need clustering at indie scale)

---

## Alternatives Considered

| Platform | Self-Hosted | Open Source | Social | Economy | Cost |
|----------|------------|-------------|--------|---------|------|
| **Nakama** | Yes | Yes (Apache 2.0) | Full | Wallet + IAP | Free (OSS) |
| **PlayFab** | No (Azure) | No | Full | Full (v2 catalog) | $99+/mo |
| **Supabase** | Yes | Yes | DIY | DIY | $25+/mo |
| **brainCloud** | Cloud only | No | Full | Multi-currency | $15-99/mo |
| **LootLocker** | No | No | Partial | Catalog + currencies | Free (non-commercial) |
| **Firebase** | No (GCP) | No | DIY | DIY | Pay-as-you-go |

Nakama wins for this project: open source, self-hosted (no vendor lock-in), purpose-built for games, Go binary is lightweight, and the feature set covers exactly what's missing in Club Mutant.

---

## Related Docs
- [colyseus-scaling.md](colyseus-scaling.md) — Colyseus regional cluster architecture
- [cloudflare-durable-objects.md](cloudflare-durable-objects.md) — DO cost/architecture analysis
- [cloudflare-do-migration-plan.md](cloudflare-do-migration-plan.md) — DO migration phases
- [self-hosted-mem0.md](self-hosted-mem0.md) — Shares PostgreSQL for AI memory
- [custom-character-system.md](custom-character-system.md) — Character persistence (Phase 5: accounts)
