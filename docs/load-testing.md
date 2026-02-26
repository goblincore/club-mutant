# Load Testing Guide — Club Mutant

## Overview

This guide covers how to load test the Colyseus game server, what to measure, known bottlenecks, and optimization strategies applied.

## Server Performance Profile

### Before Optimization (Baseline)

| Setting | Value | Notes |
|---|---|---|
| `maxClients` | **unlimited** | No cap — server will accept until it crashes |
| `patchRate` | **50ms** (20 fps) | Default Colyseus value, not explicitly set |
| Move throttle | **50ms** | Server-side per-client minimum interval |
| Speed validation | **240 px/s + 40px buffer** | Rejects teleport-like jumps |
| Player state | `MapSchema<Player>` | O(N) per-patch: all fields diffed for all clients |
| `console.log` | **in onJoin, onLeave, onDrop** | Logs full client object on join |
| Message rate limits | **Only `UPDATE_PLAYER_ACTION`** | Chat, jump, DJ queue all unthrottled |

### After Optimization (Current)

| Setting | Value | Notes |
|---|---|---|
| `maxClients` | **50** | Hard cap per room |
| `patchRate` | **100ms** (10 fps) | Halves broadcast volume, visually smooth with client lerp |
| Move throttle | **100ms** | Matches patchRate on both server and client |
| Dead-zone | **< 1px skip** | Idle players generate zero position patches |
| `console.log` | **Lifecycle: always-on; debug: guarded** | Lifecycle hooks (onCreate/onJoin/onLeave/etc.) log unconditionally; verbose logs gated by `LOG_ENABLED` |
| Chat throttle | **500ms** | Per-client rate limit |
| Jump throttle | **1000ms** | Per-client rate limit |
| DJ queue throttle | **2000ms** | Per-client rate limit on join/leave |

### O(N^2) Broadcast Problem

The core scalability bottleneck:

```
N players each send positions
  → server mutates player.x/y on Schema
  → Colyseus diffs all changed fields every patchRate ms
  → Broadcasts full diff to ALL N clients
  → N positions x N clients = O(N^2) deliveries/sec
```

Key insight from benchmarking: Colyseus batches all state mutations into a **single patch per tick**, so the actual patches/sec/client equals `1000 / patchRate` regardless of N. The O(N^2) cost shows up in **patch payload size** (more players = more fields changed per patch = larger diffs), not in patch count.

## Benchmark Results

Benchmarks run locally (MacBook) with bots continuously moving. Server restarts between baseline/optimized runs.

### Baseline (patchRate=50ms, throttle=50ms, no dead-zone)

| Bots | Patches/sec/client | Total patches (15s) | Total patches/sec |
|---|---|---|---|
| 5 | 16.4 | 1,230 | 82 |
| 10 | 19.4 | 2,910 | 194 |
| 20 | 19.7 | 5,920 | 395 |
| 50 | 19.7 | 14,800 | 987 |

### Optimized (patchRate=100ms, throttle=100ms, dead-zone)

| Bots | Patches/sec/client | Total patches (15s) | Total patches/sec |
|---|---|---|---|
| 5 | 9.8 | 735 | 49 |
| 10 | 9.3 | 1,390 | 93 |
| 20 | 9.9 | 2,960 | 197 |
| 50 | 9.9 | 7,400 | 493 |

### Summary

| Metric | Baseline | Optimized | Improvement |
|---|---|---|---|
| Patches/sec/client | ~20 | ~10 | **50% reduction** |
| Total patches/sec @ 50 bots | 987 | 493 | **50% reduction** |
| Avg connect time | 4-17ms | 3-8ms | Slightly faster |
| Patch variance | 0 | 0 | Both uniform |

### Observations

- **Patch rate is the dominant factor.** Reducing from 50ms to 100ms directly halves all broadcast work. This is the single biggest win.
- **Dead-zone suppression has minimal effect when all bots move.** In these benchmarks, all bots move continuously, so the dead-zone (skip < 1px changes) rarely activates. In real sessions where ~60% of players idle, this would provide additional savings.
- **50 bots connect in ~180ms** with zero failures. Connection time is not a bottleneck.
- **Zero patch variance** — all clients receive identical patch counts. Colyseus broadcasts uniformly.
- **Client lerp hides the reduced update rate.** The 3D client uses exponential lerp with `REMOTE_LERP=8`, which converges to 99% of target in ~0.58s. At 10fps (100ms intervals) this is visually indistinguishable from 20fps.

## How to Run Load Tests

### Prerequisites

1. Start the server: `cd server && npm run start`
2. Install loadtest deps: `cd loadtest && pnpm install`

### Quick Benchmark

```bash
# From loadtest/ directory:
npx tsx benchmark.ts 20                          # 20 bots, local server
npx tsx benchmark.ts 50 wss://api.mutante.club   # 50 bots, production

# Override move interval (default 110ms):
MOVE_INTERVAL=60 npx tsx benchmark.ts 20
```

Runs 15 seconds of observation and prints patches/sec, connect times, and variance.

### Main Scenario (Movement + Chat + Jump)

```bash
# From loadtest/ directory:
npx tsx scenario.ts --room clubmutant --numClients 20 --endpoint ws://localhost:2567 --delay 100

# From project root:
pnpm loadtest -- --room clubmutant --numClients 20 --endpoint ws://localhost:2567 --delay 100
```

**What bots do:**
- Walk around randomly (position updates every 110ms)
- Change direction every 1-3 seconds
- Send chat messages every 10-30 seconds
- Jump every 5-15 seconds

### DJ Scenario (DJ Queue Rotation)

```bash
npx tsx dj-scenario.ts --room clubmutant --numClients 10 --endpoint ws://localhost:2567 --delay 200
```

**What bots do:**
- First 3 bots become DJs (one per slot)
- Each DJ adds 2-3 tracks to their queue
- First DJ presses play after 3 seconds
- DJs simulate track completion after 8 seconds
- DJs leave queue after 60-80 seconds
- Remaining bots are audience (walk, chat, jump)

### Minimal Connection Test

```bash
npx tsx test-connect.ts
```

Tests both `http://` and `ws://` endpoints with a single bot.

### CLI Options

| Flag | Description | Default |
|---|---|---|
| `--room` | Room name to join | Required |
| `--numClients` | Number of bots to spawn | Required |
| `--endpoint` | Server WebSocket URL | Required |
| `--delay` | Delay between bot spawns (ms) | `0` |

## What to Measure

### Key Metrics

1. **Max connections before degradation** — At what N do patches start lagging?
2. **CPU usage** — Monitor with `top` or `htop` on the server
3. **Memory per player** — Check with `process.memoryUsage()` or Node.js inspector
4. **Patch latency** — Time between state change and client receiving the diff
5. **Bandwidth** — Bytes/sec sent and received (monitor with `nettop` or similar)

### Ramp-Up Strategy

| Phase | Bots | What to Check |
|---|---|---|
| Smoke test | 5 | Connections work, bots move, chat works |
| Light load | 20 | CPU baseline, memory per player |
| Medium load | 50 | First signs of degradation, patch frequency |
| Stress test | 100 | Breaking point, error rate (note: maxClients=50, so use 2 rooms) |

### How to Profile

**CPU profiling:**
```bash
# Start server with inspector
cd server && node --inspect node_modules/.bin/tsx watch src/index.ts

# Connect Chrome DevTools: chrome://inspect
# Record CPU profile during load test
```

**Memory:**
```bash
# Add to server startup for periodic memory logging:
setInterval(() => {
  const mem = process.memoryUsage()
  console.log(`RSS: ${(mem.rss / 1024 / 1024).toFixed(1)}MB, Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB`)
}, 10000)
```

## Optimizations Applied

### 1. Reduced patchRate (50ms → 100ms) ✅

**Impact: ~50% broadcast reduction (the biggest single win)**

Colyseus broadcasts one patch per tick to all clients. Halving the tick rate halves all broadcast work. Client-side exponential lerp makes this visually imperceptible.

Files changed:
- `server/src/rooms/ClubMutant.ts` — `this.patchRate = 100` in `onCreate()`
- `client-3d/src/network/NetworkManager.ts` — Move throttle 50ms → 100ms
- `loadtest/scenario.ts` + `dj-scenario.ts` — Move interval 60ms → 110ms

### 2. Dead-zone suppression ✅

**Impact: Eliminates idle players from patches (saves ~60% in typical sessions)**

Skips schema mutation when position hasn't meaningfully changed (< 1px). Idle players (standing, chatting, in DJ booth) generate zero position changes in the patch diff.

File changed:
- `server/src/rooms/commands/PlayerUpdateActionCommand.ts`

### 3. Message throttling ✅

**Impact: Prevents spam, reduces unnecessary processing**

Per-client rate limits using a `Map<sessionId, Map<messageType, lastSentMs>>`:
- Chat: 500ms minimum interval
- Jump: 1000ms
- DJ queue join/leave: 2000ms

File changed:
- `server/src/rooms/ClubMutant.ts` — `throttle()` helper + applied to message handlers

### 4. maxClients cap ✅

**Impact: Prevents runaway resource consumption**

Hard cap of 50 clients per room. Beyond this, Colyseus returns an error to joining clients.

### 5. Production log guards ✅ (updated Feb 2026)

**Impact: Eliminates unnecessary I/O in production while keeping lifecycle visibility**

Verbose/debug logs in `ClubMutant.ts` are wrapped with `if (LOG_ENABLED)` where `LOG_ENABLED = process.env.NODE_ENV !== 'production'`. Key lifecycle hooks (`onCreate`, `onAuth`, `onJoin`, `onDrop`, `onReconnect`, `onLeave`, `onDispose`) now log **unconditionally** — these are low-volume (one line per event) and essential for diagnosing connection issues in production.

### Future: StateView per-client filtering

Colyseus 0.17's `@view()` decorator system enables per-client state filtering. Position fields (`x`, `y`, `animId`) could be tagged with `@view()` so they're only sent to clients that have "added" that player to their view. This provides infrastructure for spatial filtering (only send positions of nearby players).

**Not implemented yet** because the room is ~1160x1160px and all players are typically visible, so the radius would need to be very large (~800px) to filter anything meaningful. Worth revisiting if rooms get larger or player counts increase significantly.

## Technical Notes

### fetch Patch

The load test scripts require a custom `fetch` implementation (`patch-fetch.ts`) because:

1. **Colyseus SDK** hardcodes `credentials: "include"` on all fetch calls
2. **uWebSockets transport** sends duplicate `Content-Length` headers (one lowercase from Colyseus controller, one mixed-case from uWebSockets itself)
3. **Node.js 22's native fetch** (undici-based) strictly rejects duplicate `Content-Length` per HTTP spec

The patch replaces `globalThis.fetch` with a raw `net.Socket`/`tls.connect`-based implementation that bypasses all HTTP parsers. For duplicate headers, it keeps the last value (matching browser behavior). Must be imported before `@colyseus/sdk` in every scenario file.

**Why not just `--insecure-http-parser`?** This Node.js flag only affects the `http`/`https` modules, NOT native `fetch` (which uses undici internally). Even undici's own client rejects duplicate Content-Length. Raw TCP is the only reliable workaround.

### CORS for Non-Browser Callers

The server's `getCorsHeaders` callback was updated to handle the no-origin case (Node.js loadtest clients don't send an `Origin` header):

- **No origin:** Returns `Access-Control-Allow-Origin: *` without credentials
- **Browser origin:** Echoes the specific origin with `credentials: true`

This is in `server/src/index.ts`.

### Running Against Production

```bash
npx tsx scenario.ts --room clubmutant --numClients 20 --endpoint wss://api.mutante.club --delay 200
```

The fetch patch supports both `ws://` (plain TCP) and `wss://` (TLS via `tls.connect`). For production testing, run from a machine geographically close to the server to minimize latency variance.
