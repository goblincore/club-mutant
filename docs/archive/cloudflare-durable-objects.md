# Cloudflare Durable Objects (PartyKit) Multiplayer Architecture

This document explores a potential future architecture migrating the authoritative multiplayer server (currently Colyseus on a Hetzner VPS) to Cloudflare Durable Objects using the PartyKit framework.

## Core Architecture Mapping

The fundamental concept maps perfectly to the current room-based design:

- **1 Colyseus Room = 1 Durable Object (DO)**: Every multiplayer room (e.g., JukeboxRoom, JapaneseRoom, or custom lobby rooms) maps to its own globally unique Durable Object instance.
- **Compute Edge**: When a player creates/joins a new room, the DO spins up in a Cloudflare datacenter close to them. All subsequent players in that specific room route to that exact datacenter.
- **PartyKit SDK**: Replaces the Colyseus API. Instead of `@colyseus/schema` doing binary delta-syncs, you use PartyKit's room abstraction (`this.room.broadcast()`) to send JSON patches for player positions and animation states.

## Persistent User Accounts && Storage

Durable Objects handle the "hot" real-time state of the room, but they are not the ideal place to store global relational data like user accounts.

- **D1 (Cloudflare's Serverless SQLite)**: This is the perfect companion for user accounts, credentials, earned badges, or saved custom character configurations. D1 databases are accessible from any Cloudflare Worker or Durable Object globally.
- **KV / R2**: For larger assets or key-value lookups (e.g., character manifest JSONs), R2 (object storage) or KV is used.

## The Global "Static" Lobby Room

Your "global" lobby room is a unique case because it is intended to be a single, persistent room where everyone gathers, rather than a transient room that spins down when empty.

- **Location Hints**: By default, a Durable Object spins up near the first person who requests it. For a global lobby, you want it to be geographically stable so latency is predictable. You can use Cloudflare's **Location Hints** API when creating the Lobby DO to force it to originate in a specific region (e.g., `locationHint: "enam"` for Eastern North America, or wherever the majority of your player base is).
- **Concurrency Limits**: A single DO operates on a single thread. It can handle hundreds of concurrent WebSocket connections and coordinate their state efficiently, but if your global lobby scales to thousands of concurrent users in the exact same room, a single DO might hit CPU limits. In that extreme scenario, the lobby would need to be sharded (e.g., `Lobby-Instance-1`, `Lobby-Instance-2`).

## Cost Comparison: Hetzner VPS vs. Cloudflare DO

### Current Setup (Hetzner VPS)
- **Flat Rate Pricing**: You pay a fixed monthly fee (e.g., ~$5 to $20/month depending on the tier) for dedicated CPU/RAM.
- **Pros**: Completely predictable pricing. You can run raw TCP proxy streams (like the YouTube proxy) and native binaries (like `yt-dlp` or Rust CLI tools) directly on the box for free.
- **Cons**: You are responsible for scaling, server maintenance, and uptime. Everyone globally routes to one physical datacenter (e.g., Germany or US East), meaning high latency for players in Asia or South America.

### Future Setup (Cloudflare Workers + Durable Objects / PartyKit)
- **Usage-Based Pricing**: Cloudflare's Durable Objects require the **Workers Paid Plan ($5/month)**. This plan includes:
  - 1 million DO requests/month free ($0.15 per million thereafter). *Note: Incoming WebSocket messages are billed at a 20:1 ratio (20 messages = 1 request).*
  - 400,000 GB-seconds of compute duration free ($12.50 per million thereafter). *You only pay for compute when the DO is awake and processing.*
- **Pros**: Zero ops. Infinite auto-scaling. Rooms spin up instantly next to the users who create them, drastically reducing latency. You don't pay for idle rooms—when a room empties, the DO hibernates and stops charging for compute. State (like DJ queues) can be persisted to DO local storage and instantly reloaded when the room wakes up.
- **Cons**: 
  - The main hidden cost is **incoming WebSocket messages**. A multiplayer game sending positional updates at 20 ticks per second generates a *massive* number of messages. 
  - Native binaries (like `yt-dlp`) cannot run natively in a V8 isolate Worker. You would still need a minimal VPS (like a $5 Hetzner box) strictly to act as the YouTube proxy/resolver microservice.

### Rough Cost Estimate: 100 Concurrent Users (CCU) 24/7

To understand when DO becomes expensive compared to a VPS, let's look at a hypothetical scenario where you have **100 players online 24/7 for a full month**, split across 10 rooms (DOs).

**1. Hetzner VPS Option:**
- A $20/month VPS (e.g., 4 cores, 8GB RAM) can comfortably run a Node.js Colyseus server handling 100-500 CCU depending on your physics and tick-rate logic.
- **Estimated Monthly Cost:** **~$20 flat** (predictable, regardless of message volume).

**2. Cloudflare DO / PartyKit Option:**
*(Assuming 20 game ticks per second per player: 20 incoming messages/sec)*
- **Requests Cost**: 
  - 100 players × 20 msgs/sec × 60 sec × 60 min × 730 hours = **5.25 billion messages/month**.
  - Cloudflare bills WebSockets at a 20:1 ratio. Billed requests = **262.8 million** requests.
  - Pricing: 1 million free, then $0.15 per million.
  - `(262.8 - 1) × $0.15` = **~$39.27 / month**.
- **Compute Volume Cost**:
  - 10 rooms awake 24/7 (730 hours/month) = **7,300 hours** of DO uptime.
  - `7,300 hours × 3600 seconds = 26.28 million seconds`.
  - Assuming a standard 128MB memory tier (0.125 GB) per DO.
  - `26.28 million × 0.125 GB` = **~3.28 million GB-seconds**.
  - Pricing: 400,000 free, then $12.50 per million.
  - `(3.28 - 0.4) × $12.50` = **~$36.00 / month**.
- **Workers Paid Plan Base**: **$5.00 / month**
- **Estimated Total DO Cost:** **~$80.27 / month**

### The Takeaway

- **At low/medium scale with consistent 24/7 player counts**, a dedicated Hetzner VPS will always be significantly cheaper and more predictable. 100 CCU costs $20 on Hetzner vs ~$80 on Cloudflare DO.
- **Where Cloudflare wins**: 
  1. **Latency & Regionality**: Your 100 players might be spread globally. With Hetzner, players in Australia will suffer ~250ms ping to a German server. With DOs, rooms spin up in Sydney, Tokyo, or New York closest to the players, giving them 20-40ms ping.
  2. **Spike Scaling & Zero Ops**: If a streamer plays your game and player count jumps from 10 to 5,000 instantly, the Hetzner box will crash and require manual downtime to upgrade. Cloudflare DOs will vertically and horizontally scale automatically without you ever noticing (though you will pay for that spike in usage).
  3. **Hibernation Savings**: The estimate above assumes 100 players *24 hours a day*. In reality, game traffic is highly cyclical. If your rooms sit empty for 12 hours a day, those DOs hibernate. You pay absolutely **$0** for compute when a room is empty. A VPS charges you $20/mo whether your server is completely full or entirely abandoned.
