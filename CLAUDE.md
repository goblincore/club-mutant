# Club Mutant

Multiplayer virtual world. Monorepo: `client-3d` (React/R3F/Vite), `server` (Colyseus 0.17), `client-dream`, Go microservices, Nakama auth sidecar, `packages/os5000k` (in-world OS).

## Architecture

- Full reference: `docs/architecture/overview.md`
- Auth: Nakama (email/guest) → JWT → `nakamaToken` in Colyseus join options → server verifies via `lib/verifyNakamaToken.ts`
- Network: `client-3d/src/network/NetworkManager.ts` — singleton via `getNetwork()`
- State: `server/rooms/schema/OfficeState.ts` (authoritative), types in `types/`
- OS5000k: in-world mini-OS with postMessage bridge to main app — see `docs/architecture/os5000k.md`
- Deployment: Cloudflare Pages (client-3d), Hetzner (server/Nakama)

## Dev Setup

```bash
docker compose -f docker-compose.dev.yml up -d  # Nakama + Postgres
export NAKAMA_ENCRYPTION_KEY=clubmutant_dev_encryption_key_32ch
pnpm --filter @club-mutant/os5000k build        # build OS5000k before client
cd server && pnpm dev
cd client-3d && pnpm dev
```

## Conventions

- Package manager: pnpm
- Nakama runtime modules (`nakama/modules/index.js`): ES5 only (goja engine) — no arrow fns, const, let, or template literals
- OS5000k core (`packages/os5000k/static/`): vanilla JS (not ES5-restricted)

## Workspace Packages

- `client-3d` — React/R3F frontend
- `server` — Colyseus game server
- `client-dream` — Dream mode client
- `packages/os5000k` — In-world OS (esbuild, postMessage bridge)
- `packages/acs-web` — ACS character system (WASM)
- `types` — Shared TypeScript types
- `loadtest` — Load testing tools

## Docs Structure

- `docs/architecture/` — system design, DJ queue, dream mode, OS5000k, performance
- `docs/guides/` — deployment, Electron, load testing, spritesheet extraction
- `docs/ideas/` — feature concepts and explorations
- `docs/plans/` — active implementation plans
- `docs/legacy/` — completed/superseded plans (kept for reference)
