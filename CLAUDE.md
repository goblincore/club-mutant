# Club Mutant

Multiplayer virtual world. Monorepo: `client-3d` (React/R3F/Vite), `server` (Colyseus 0.17), `client-dream`, Go microservices, Nakama auth sidecar.

## Architecture

- Auth: Nakama (email/guest) → JWT → `nakamaToken` in Colyseus join options → server verifies via `lib/verifyNakamaToken.ts`
- Auth state: `client-3d/src/stores/authStore.ts`
- Network: `client-3d/src/network/NetworkManager.ts` — singleton via `getNetwork()`
- Lobby UI: `client-3d/src/ui/LobbyScreen.tsx`
- Detailed architecture reference: see `openmemory.md`

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
