# Migration Plan: Colyseus to Cloudflare Durable Objects (PartyKit)

This document outlines the step-by-step strategy for building a shadow/parallel multiplayer backend using Cloudflare Durable Objects (specifically using the [PartyKit](https://partykit.io) framework) while keeping the current Hetzner VPS setup active. The goal is to have an infinitely scalable version of Club Mutant ready if traffic skyrockets.

## Phase 1: Stateless Services (dream-npc)

The `dream-npc` service is currently a Go service running on the VPS to minimize memory footprint. Because it is largely stateless (relying only on in-memory rate-limiting and LRU caching), it is a prime candidate for a raw Cloudflare Worker if VPS resources become constrained or if we want edge-location latency for AI NPC responses.

1. **Worker Conversion**
   - Port the Go routing logic into a standard Cloudflare Worker `fetch` event handler using TypeScript.
   - The rate-limiting and caching can be handled by **Cloudflare KV** and the **Rate Limiting API**.
   - No Durable Objects are required for this specific service since it doesn't need strict synchronization or long-lived websocket connections; just standard HTTP Request/Response.

## Phase 2: Setup and Foundation (Stateful Multiplayer)

1. **Initialize PartyKit Workspace**
   - Create a new directory alongside `server/` (e.g., `server-cf/` or `party/`).
   - Run `npx partykit init` to set up the basic Worker/DO skeleton.
   - Configure `partykit.json` to map room types (e.g., `global`, `custom`) to specific DO classes.

2. **Durable Object Classes**
   - Create the core `ClubMutantRoom` class that implements `Party.Server`. 
   - *Colyseus Equivalent*: `server/src/rooms/ClubMutant.ts`.
   - Setup `onConnect(conn, ctx)`, `onMessage(message, sender)`, and `onClose(conn)` handlers.

3. **Client-Side Abstraction**
   - In `client-3d/src/network/NetworkManager.ts`, introduce an abstraction layer or toggle (e.g., `VITE_MULTIPLAYER_BACKEND=colyseus|partykit`).
   - Swap the `@colyseus/sdk` `Client.joinOrCreate()` with `new PartySocket({ host, room })` when the PartyKit flag is active.

## Phase 2: State Sync (Replacing Colyseus Schema)

Because PartyKit provides raw WebSockets rather than binary-delta schema syncing, you must build a lightweight state reconciler.

1. **State Snapshot**
   - At the DO level, maintain an in-memory `Map` of players (positions, animation IDs, connection status) equivalent to `OfficeState.players`.

2. **Delta Transmissions (Player Updates)**
   - When a player moves (`UPDATE_PLAYER_ACTION`), the server applies it to its local memory.
   - **Crucial Optimization**: Do *not* broadcast the entire state array at 20 ticks per second. Instead, broadcast tiny JSON arrays (e.g., `["uuid", x, y, animId, charId]`) to all clients *except* the sender.

3. **Client-Side Rehydration**
   - The PartyKit client receives these JSON payloads and mutates the local Redux store (`gameStore`) or updates the same phasor events (`Event.PLAYER_UPDATED`) currently used by Colyseus.
   - *Design Note*: The goal is to make the 3D rendering loop completely unaware of *which* network backend is feeding it positional data.

## Phase 3: The DJ Queue and Music Stream

The DJ Queue system is distinct because it requires absolute ordering and persistence, not high-frequency ticking.

1. **Room State Storage (DO Storage API)**
   - Instead of storing `djQueue` and `musicStream` history purely in RAM, use `this.room.storage.put("djQueue", currentQueue)`.
   - When the `ClubMutantRoom` wakes from hibernation (i.e., the first player joins), read from `this.room.storage.get("djQueue")` in the constructor to seamlessly resume the queue where it left off.

2. **Handling `DJQueueCommand` Logic**
   - Port the command patterns from `server/src/rooms/commands/DJQueueCommand.ts` directly into the DO's `onMessage` router. Since the logic is pure TypeScript, it should drop in with minimal modifications (swapping Colyseus `ArraySchema` for native arrays).

## Phase 4: The Lobby Room Registry

Currently, Colyseus provides a native active room listing feature. You must rebuild this for PartyKit.

1. **Singleton Registry DO**
   - Create a separate DO (e.g., `LobbyRegistry`). There can only ever be one instance of this object globally.
   - Whenever a `ClubMutantRoom` adds or loses a player, it sends a quick HTTP request to `LobbyRegistry` updating its count.
   - When a room reaches 0 players, it tells the registry to delete it from the active list.

2. **Client Polling/Subscription**
   - The `CustomRoomBrowser` frontend queries the `LobbyRegistry` via HTTP (or opens a low-frequency WebSocket) to get the live list of multiplayer rooms.

## Phase 5: User Accounts and D1 SQLite

If/when custom characters, unlocked cosmetics, or persistent names are added, use **Cloudflare D1**.

1. **D1 Binding**
   - Add a D1 database binding in `partykit.json`.
   - When a player authenticates (either via JWT, Web3auth, or OAuth), the DO queries D1: `env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first()`.
   - Load their unlocked gear and apply it to their in-room avatar state.

## Summary Checklist for V1 DO Prototype

- [ ] Spin up `server-cf` with PartyKit.
- [ ] Connect a single 3D client (`NetworkManager.ts` fork) to the DO via WebSocket.
- [ ] Implement player movement broadcasting (JSON payload) and rendering.
- [ ] Port the `DJQueue` logic to run in the `Party.Server` memory.
- [ ] Persist the DJ queue to DO Storage so it survives hibernation.
