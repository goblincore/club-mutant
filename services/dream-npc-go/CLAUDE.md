# dream-npc-go

Go service for NPC AI chat. Powers Lily the bartender and other dream NPCs.

## Structure

- `main.go` — Entry point, Fiber v2 HTTP server, route setup
- `npc/chat.go` — Chat logic, prompt construction, memory injection
- `npc/personalities.go` — NPC personality definitions and system prompts
- `npc/types.go` — Go type definitions
- `npc/rate_limiter.go` — Per-user rate limiting
- `npc/cache.go` — Response caching
- `cmd/` — CLI subcommands
- `cogmem-inspect/` — Debugging tool for cognitive memory
- `data/` — SQLite databases (cogmem.db, dualmem.db)

## Cognitive Memory (cogmem)

NPCs have a cognitive memory system with 5 sectors, composite scoring (similarity + salience + recency + link weight), Gemini embeddings (768d), SQLite storage. Memories are injected into prompts as "background impressions" that shape tone, not facts to recite.

## Environment Variables

- `GEMINI_API_KEY` — Required for embeddings and chat
- `PORT` — HTTP port (default: 4000)

## Key Pattern

The Colyseus server (`server/src/rooms/ClubMutant.ts`) proxies NPC chat requests to this service via HTTP. Client never calls this service directly.

## Build & Run

```bash
go build -o dream-npc ./
./dream-npc
# or with Docker:
docker build -t dream-npc .
```
