# YouTube Service Migration Plan

This document tracks the migration from inline YouTube scraping (`server/Youtube.js`) to the standalone Go microservice (`services/youtube-api`).

## Phase 1: Search Endpoint ✅

**Status: Complete**

- [x] Create Go service with `/search` endpoint
- [x] In-memory caching with TTL
- [x] Dockerfile for deployment
- [ ] Test locally with Go installed
- [ ] Deploy to staging environment

### Testing locally

```bash
cd services/youtube-api
go mod tidy
go run .

# In another terminal
curl "http://localhost:8081/search?q=test&limit=5"
```

## Phase 2: Colyseus Integration

**Status: Not started**

### Tasks

- [ ] Add `YOUTUBE_SERVICE_URL` env var to server
- [ ] Create `server/youtubeService.ts` client wrapper
- [ ] Modify `server/index.ts` to route `/youtube/:search` through the Go service
- [ ] Add fallback to `Youtube.js` if Go service unavailable
- [ ] Test end-to-end with client playlist search

### Server changes needed

```typescript
// server/youtubeService.ts (new file)
const YOUTUBE_SERVICE_URL = process.env.YOUTUBE_SERVICE_URL || 'http://localhost:8081'

export async function searchYouTube(query: string, limit = 10) {
  const url = `${YOUTUBE_SERVICE_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`YouTube service error: ${response.status}`)
  return response.json()
}
```

## Phase 3: Resolve Endpoint Migration

**Status: Not started**

### Tasks

- [ ] Add `/resolve/:videoId` endpoint to Go service
- [ ] Shell out to `yt-dlp` binary
- [ ] Add caching with expiry-aware TTL
- [ ] Migrate `server/youtubeResolver.ts` calls to use Go service
- [ ] Update Dockerfile to include `yt-dlp` binary

### Dockerfile changes

```dockerfile
# Add yt-dlp to the runtime image
FROM alpine:latest AS runtime
RUN apk add --no-cache ca-certificates python3 py3-pip
RUN pip3 install yt-dlp
# ... copy Go binary
```

## Phase 4: Redis + Scaling

**Status: Not started**

### Tasks

- [ ] Add Redis client to Go service
- [ ] Replace in-memory cache with Redis
- [ ] Add Redis connection env vars
- [ ] Test with multiple service instances
- [ ] Document deployment topology

## Local Development Setup

### Option A: Run Go service standalone

```bash
# Terminal 1: Go service
cd services/youtube-api
go run .

# Terminal 2: Node server (with env var)
YOUTUBE_SERVICE_URL=http://localhost:8081 npm run start
```

### Option B: Docker Compose (future)

```yaml
# docker-compose.yml (to be created)
services:
  youtube-api:
    build: ./services/youtube-api
    ports:
      - '8081:8081'

  server:
    build: ./server
    environment:
      - YOUTUBE_SERVICE_URL=http://youtube-api:8081
    depends_on:
      - youtube-api
```

## Rollback Plan

If issues arise with the Go service:

1. Set `YOUTUBE_SERVICE_URL` to empty/unset
2. Server falls back to `Youtube.js` inline scraping
3. No client changes needed (API response format is compatible)
