# Scaling Club Mutant with Colyseus — Regional Clusters

## Current State (Single Process, No Scaling)

1 Colyseus process on Hetzner VPS (8GB/2vCPU), no Redis, no clustering, no persistence. All state is ephemeral — server restart = rooms destroyed. Capacity: ~500-1,200 CCU depending on room activity.

---

## Phase 1: Multi-Process on Same VPS (~2,000-4,000 CCU)

**When to do this**: Consistently hitting 500+ CCU or CPU > 60% on the Colyseus process.

### 1. Add Redis to Docker Compose

```yaml
redis:
  image: redis:7-alpine
  ports: ["6379:6379"]
  volumes:
    - redis_data:/data
  restart: unless-stopped
```

### 2. Configure Colyseus with RedisPresence + RedisDriver

In `server/src/index.ts`:

```typescript
import { RedisPresence } from "@colyseus/redis-presence"
import { RedisDriver } from "@colyseus/redis-driver"

const server = defineServer({
  transport: new uWebSocketsTransport({ maxPayloadLength: 1024 * 1024 }),
  presence: new RedisPresence({ url: process.env.REDIS_URL }),
  driver: new RedisDriver({ url: process.env.REDIS_URL }),
  options: {
    publicAddress: `api.mutante.club/${process.env.PORT || 2567}`
  },
  // ...existing room definitions
})
```

### 3. Run multiple Colyseus containers (one per vCPU)

```yaml
colyseus-1:
  build: { context: ., dockerfile: Dockerfile.server }
  environment:
    - PORT=2567
    - REDIS_URL=redis://redis:6379
  depends_on: [redis]

colyseus-2:
  build: { context: ., dockerfile: Dockerfile.server }
  environment:
    - PORT=2568
    - REDIS_URL=redis://redis:6379
  depends_on: [redis]
```

### 4. Update Caddy to route by port path

```
api.mutante.club {
    # Matchmaker requests go to any process (round-robin)
    @matchmake path /matchmake/*
    handle @matchmake {
        reverse_proxy colyseus-1:2567 colyseus-2:2568
    }
    # Direct WebSocket connections route to specific process by port
    @direct path_regexp port ^/(\d+)/(.*)
    handle @direct {
        reverse_proxy 127.0.0.1:{re.port.1}
    }
}
```

### How it works

Client calls `joinOrCreate()` → hits any process via Caddy → matchmaker queries Redis for available rooms across all processes → reserves a seat → returns `publicAddress` with the specific process port → client connects directly to that process via WebSocket.

**Key constraint**: Rooms still live on one process. But rooms distribute evenly across processes, so 2 processes = ~2x capacity.

**Memory impact**: Redis adds ~50-100 MB. Each additional Colyseus process adds ~200 MB. Total for 2 processes + Redis: ~1.2-1.6 GB (still well within 8 GB).

---

## Phase 2: Multi-Machine, Single Region (~5,000-10,000 CCU)

**When to do this**: Maxing out a single VPS (all cores saturated, or need fault tolerance).

### What changes

1. **Add a second Hetzner VPS** in the same datacenter (Falkenstein/Nuremberg)
2. **Shared Redis** — run Redis on one VPS and expose via private networking, or use Upstash/Redis Cloud
3. **Each VPS runs 2 Colyseus processes** with unique `publicAddress` values
4. **Caddy on each VPS** handles its own processes
5. **DNS round-robin or Cloudflare load balancing** distributes initial matchmaker requests

```
                  ┌──────────────────┐
                  │  Cloudflare DNS  │
                  │  api.mutante.club│
                  └───────┬──────────┘
                          │ Round-robin
              ┌───────────┴───────────┐
              ▼                       ▼
   ┌──────────────────┐    ┌──────────────────┐
   │   VPS-1 (EU)     │    │   VPS-2 (EU)     │
   │   Caddy          │    │   Caddy          │
   │   Colyseus :2567 │    │   Colyseus :2567 │
   │   Colyseus :2568 │    │   Colyseus :2568 │
   │   youtube-api    │    │   youtube-api    │
   │   dream-npc-go   │    │   dream-npc-go   │
   └────────┬─────────┘    └────────┬─────────┘
            │                       │
            └───────────┬───────────┘
                        ▼
                 ┌──────────────┐
                 │    Redis     │
                 │  (shared)    │
                 └──────────────┘
```

**Cost**: ~$10-20/mo for second VPS + ~$0-10/mo for managed Redis. Total: ~$25-40/mo.

---

## Phase 3: Multi-Region (~10,000+ CCU, global latency optimization)

**When to do this**: Players in multiple continents complaining about latency (>150ms), or you want presence in US/Asia markets.

**Architecture**: Independent Colyseus clusters per region. Each region is fully self-contained — own Redis, own Colyseus processes, own YouTube API, own dream-npc service. Players in different regions cannot be in the same room (by design — cross-region state sync adds too much latency for real-time music/DJ interaction).

```
                    ┌─────────────────────────────┐
                    │   Cloudflare Workers         │
                    │   (Global Region Router)     │
                    │   region.mutante.club        │
                    └──────┬──────┬──────┬────────┘
                           │      │      │
              ┌────────────┘      │      └────────────┐
              ▼                   ▼                    ▼
   ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
   │  EU (Hetzner)    │ │  US-East (Vultr) │ │  Asia (Vultr)    │
   │  Falkenstein     │ │  New Jersey      │ │  Tokyo           │
   │                  │ │                  │ │                  │
   │  Caddy           │ │  Caddy           │ │  Caddy           │
   │  2× Colyseus     │ │  2× Colyseus     │ │  2× Colyseus     │
   │  Redis           │ │  Redis           │ │  Redis           │
   │  youtube-api     │ │  youtube-api     │ │  youtube-api     │
   │  dream-npc-go    │ │  dream-npc-go    │ │  dream-npc-go    │
   └──────────────────┘ └──────────────────┘ └──────────────────┘
```

### Client region selection

```typescript
// Cloudflare Worker at edge — lightweight region router
export default {
  async fetch(request) {
    const country = request.headers.get('CF-IPCountry')
    const region = getRegion(country) // EU, US, ASIA
    const endpoints = {
      EU: 'https://eu.api.mutante.club',
      US: 'https://us.api.mutante.club',
      ASIA: 'https://asia.api.mutante.club',
    }
    return Response.json({ endpoint: endpoints[region], region })
  }
}
```

**Flow**: Client loads from Cloudflare Pages → pings regional endpoints or uses CF Worker → connects to lowest-latency region's Colyseus cluster.

**Cost per region**: ~$10-20/mo VPS + Redis. Three regions: ~$40-70/mo total.

**Trade-off**: Players in different regions are in separate lobbies. A player in Tokyo and a player in Berlin cannot DJ together. Could add a "global room" option that routes to a central server with higher latency warning.

---

## What Stays Unchanged (All Phases)

- **Client code**: `@colyseus/sdk` `joinOrCreate()` handles multi-process routing automatically
- **Room logic**: `ClubMutant.ts`, all commands, schema — unchanged. Rooms are single-process.
- **Shared types**: `types/` package — unchanged
- **Dream mode**: iframe-based, no Colyseus dependency

## What Changes Per Phase

| Change | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|
| Add Redis | Yes | Yes | Yes (per region) |
| `RedisPresence` + `RedisDriver` | Yes | Yes | Yes |
| `publicAddress` per process | Yes | Yes | Yes |
| Multiple Colyseus containers | Yes | Yes | Yes |
| Caddy port routing | Yes | Yes | Yes |
| Second VPS | No | Yes | Yes (per region) |
| Shared Redis across machines | No | Yes | No (per region) |
| Region router | No | No | Yes |
| Client region selection | No | No | Yes |
| Duplicate supporting services | No | Yes | Yes |

---

## Room Migration / Fault Tolerance

Colyseus does NOT support room migration between processes. If a process dies, rooms on it are lost.

**Mitigation**:
1. **Reconnection**: Existing `onDrop`/`onReconnect` (60s grace) handles transient disconnects. Full process death → `onLeave` → DisconnectedOverlay → Refresh → rejoin new room.
2. **State checkpointing** (optional): Periodically snapshot room state to Redis/PostgreSQL. Restore on room recreation.
3. **Graceful shutdown**: Colyseus 0.17 `room.onBeforeShutdown()` — notify players, save state, drain rooms before process stops. Useful for zero-downtime deploys.

---

## Verification / Load Testing

```bash
npx @colyseus/loadtest --room clubmutant --numClients 100 --endpoint ws://localhost:2567
```

Test each phase by:
1. Spinning up configured number of processes
2. Running load test with increasing `--numClients`
3. Monitoring CPU/memory via `docker stats`
4. Verifying room distribution across processes via Redis `KEYS colyseus:*`
5. Testing reconnection by killing a process mid-session

---

## Colyseus vs Durable Objects for Scaling

Cloudflare Durable Objects (see `cloudflare-durable-objects.md`) offer auto-scaling and zero ops, but for Club Mutant specifically, Colyseus clusters are the better path because:

- **State sync**: Colyseus Schema auto-sync is too valuable to rewrite as manual JSON patches
- **Cost**: 100 CCU = ~$20/mo VPS vs ~$80/mo DO; gap widens at scale
- **Still need VPS**: youtube-api/yt-dlp/pot-provider need native binaries (can't run in V8 isolates)
- **Limits**: 128MB memory per DO, 1,000 req/s per DO — tight for active rooms

DOs make sense as a Phase 4 escape hatch at 10,000+ CCU or if zero-ops becomes a priority. The DO migration plan is documented in `cloudflare-do-migration-plan.md`.
