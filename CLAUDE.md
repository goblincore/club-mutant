# Club Mutant

Multiplayer virtual world. Monorepo: `client-3d` (React/R3F/Vite), `server` (Colyseus 0.17), `client-dream`, Go microservices, Nakama auth sidecar.

## Architecture

- Full reference: `docs/architecture/overview.md`
- Auth: Nakama (email/guest) → JWT → `nakamaToken` in Colyseus join options → server verifies via `lib/verifyNakamaToken.ts`
- Network: `client-3d/src/network/NetworkManager.ts` — singleton via `getNetwork()`
- State: `server/rooms/schema/OfficeState.ts` (authoritative), types in `types/`

## Dev Setup

```bash
docker compose -f docker-compose.dev.yml up -d  # Nakama + Postgres
export NAKAMA_ENCRYPTION_KEY=clubmutant_dev_encryption_key_32ch
cd server && pnpm dev
cd client-3d && pnpm dev
```

## Conventions

- Package manager: pnpm
- Nakama runtime modules (`nakama/modules/index.js`): ES5 only (goja engine) — no arrow fns, const, let, or template literals

## Docs Structure

- `docs/architecture/` — system design, DJ queue, dream mode, performance
- `docs/guides/` — deployment, Electron, load testing, spritesheet extraction
- `docs/ideas/` — feature concepts and explorations
- `docs/legacy/` — completed/superseded plans (kept for reference)
