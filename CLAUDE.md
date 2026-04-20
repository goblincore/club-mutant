# Club Mutant

Multiplayer virtual world. Monorepo: `client-3d` (React/R3F/Vite), `server` (Colyseus 0.17), Go microservices, Nakama auth sidecar, `packages/konpyuuta` (in-world OS).

## Architecture

- Full reference: `docs/architecture/overview.md`
- Auth: Nakama (email/guest) → JWT → `nakamaToken` in Colyseus join options → server verifies via `lib/verifyNakamaToken.ts`
- Network: `client-3d/src/network/NetworkManager.ts` — singleton via `getNetwork()`
- State: `server/rooms/schema/OfficeState.ts` (authoritative), types in `types/`
- KonpyuuTA: in-world mini-OS with postMessage bridge to main app — see `docs/architecture/konpyuuta.md`
- Deployment: Cloudflare Pages (client-3d), Hetzner (server/Nakama)

## Dev Setup

```bash
docker compose -f docker-compose.dev.yml up -d  # Nakama + Postgres
export NAKAMA_ENCRYPTION_KEY=clubmutant_dev_encryption_key_32ch
pnpm --filter @club-mutant/konpyuuta build       # build KonpyuuTA before client
cd server && pnpm dev
cd client-3d && pnpm dev
```

## Cross-Package Recipes

### Adding a multiplayer feature (e.g., new interaction, UI state)
1. Define types in `types/Messages.ts` (message enum) and `types/Dtos.ts` or `types/IOfficeState.ts` (state/payload types)
2. Add server state to `server/src/rooms/schema/OfficeState.ts` if persistent
3. Add message handler in `server/src/rooms/ClubMutant.ts` (or a new Command in `server/src/rooms/commands/`)
4. Add client listener in `client-3d/src/network/NetworkManager.ts`
5. Update/create Zustand store in `client-3d/src/stores/`
6. Add UI in `client-3d/src/ui/`

### Adding an NPC behavior
1. Update personality/prompt in `services/dream-npc-go/npc/personalities.go`
2. Modify chat logic in `services/dream-npc-go/npc/chat.go`
3. Server proxies NPC chat via HTTP from `server/src/rooms/ClubMutant.ts`

### Adding a KonpyuuTA app
1. Create `packages/konpyuuta/static/apps/yourapp.html`
2. Register in `client-3d/src/ui/konpyuuta/appRegistry.ts`
3. Communication with main client via postMessage bridge (`packages/konpyuuta/src/bridge-sdk.ts`)

### Adding a Nakama RPC
1. Write handler in `nakama/modules/index.js` (**ES5 only!**)
2. Register in `InitModule`
3. Restart Nakama: `docker compose -f docker-compose.dev.yml restart nakama`

## Language Conventions

### TypeScript (client-3d, server, types)
- Strict mode, Zustand for client state, Colyseus Schema for server state
- Network messages: enum in `types/Messages.ts`, handler pattern in `server/src/rooms/ClubMutant.ts`
- Shared types go in `types/` package — define types before implementing

### Go (services/*)
- Standard library + Fiber v2 (dream-npc-go) or net/http (youtube-api)
- Env vars for all config, no config files
- Each service independently deployable with its own Dockerfile

### Nakama (ES5 JavaScript)
- **ES5 ONLY** — `var`, `function() {}`, string concatenation
- **Forbidden:** const, let, arrow functions, template literals, destructuring, for...of, classes, async/await
- Code silently fails with modern syntax. Test by restarting the Nakama container.

### KonpyuuTA (vanilla JS)
- Modern JS is fine (not ES5-restricted like Nakama)
- Runs in iframes — communicates via postMessage bridge only

## Conventions

- Package manager: pnpm
- See per-package `CLAUDE.md` files for detailed patterns and directory maps

## Workspace Packages

- `client-3d` — React/R3F frontend
- `server` — Colyseus game server
- `client-dream` — Dream mode client
- `packages/konpyuuta` — In-world OS (esbuild, postMessage bridge)
- `packages/acs-web` — ACS character system (WASM)
- `types` — Shared TypeScript types
- `loadtest` — Load testing tools

## Services

- `services/dream-npc-go` — Go NPC AI chat service (Lily bartender, cogmem)
- `services/youtube-api` — Go YouTube API wrapper (prefetch queue, disk cache)
- `services/image-upload` — Image upload service
- `services/pot-provider` — PO token provider

## Verification

```bash
cd server && pnpm test      # Server smoke tests (schema, state)
cd types && pnpm test       # Types smoke tests (message enum integrity)
pnpm -r build               # Verify all packages build
```

## Docs Structure

- `docs/architecture/` — system design (authoritative, always current)
- `docs/guides/` — deployment, tooling how-tos
- `docs/plans/` — approved implementation plans (in-progress work)
- `docs/archive/` — old plans, speculative ideas (ignore unless explicitly asked)
