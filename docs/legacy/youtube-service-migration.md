# YouTube Service Migration Plan

This document tracks the migration from inline YouTube scraping (`server/Youtube.js`) to the standalone Go microservice (`services/youtube-api`).

## Phase 1: Search Endpoint ✅

**Status: Complete**

- [x] Create Go service with `/search` endpoint
- [x] In-memory caching with TTL
- [x] Dockerfile for deployment
- [x] Test locally with Go installed

### Testing locally

```bash
cd services/youtube-api
go run .

# In another terminal
curl "http://localhost:8081/search?q=test&limit=5"
```

## Phase 2: Colyseus Integration ✅

**Status: Complete**

- [x] Add `YOUTUBE_SERVICE_URL` env var to server
- [x] Create `server/youtubeService.ts` client wrapper
- [x] Modify `server/index.ts` to route `/youtube/:search` through the Go service
- [x] Add fallback to `Youtube.js` if Go service unavailable

## Phase 3: Resolve & Proxy Endpoints ✅

**Status: Complete**

Uses pure Go library (`github.com/kkdai/youtube/v2`) - no yt-dlp dependency!

- [x] Add `/resolve/{videoId}` endpoint to Go service
- [x] Add `/proxy/{videoId}` endpoint with Range header support
- [x] In-memory caching with expiry-aware TTL
- [x] Colyseus integration with yt-dlp fallback
- [x] Video-only streams for background visuals (lower bandwidth)
- [x] Safari WebGL video playback compatibility

### Endpoints

| Endpoint                                | Description                                |
| --------------------------------------- | ------------------------------------------ |
| `GET /resolve/{videoId}`                | Returns direct stream URL + expiry         |
| `GET /resolve/{videoId}?videoOnly=true` | Video-only stream (no audio)               |
| `GET /proxy/{videoId}`                  | Proxies video stream (default: video-only) |
| `GET /proxy/{videoId}?videoOnly=false`  | Proxies combined audio+video               |

### Video Format Selection

The proxy defaults to **video-only** (no audio) for background visuals:

- Lower bandwidth (~2MB vs ~10MB for combined)
- Typically 144p resolution (itag 160)
- Perfect for ambient background video in WebGL

### Safari Compatibility

Fixed intermittent video loading in Safari:

- Removed 30s timeout on streaming connections
- Increased client-side frame-ready timeout to 5s (was 1.5s)
- Added proper `Content-Type: video/mp4` headers
- Added `Cache-Control: no-cache` for Safari
- Improved Node.js streaming with backpressure handling

### Testing

```bash
# Resolve a video
curl "http://localhost:8081/resolve/dQw4w9WgXcQ"

# Proxy with range request
curl -H "Range: bytes=0-1023" "http://localhost:8081/proxy/dQw4w9WgXcQ" -o /dev/null -w "%{http_code}\n"

# Check format selection (should show "144p video-only")
# Look for log: [proxy] Resolved dQw4w9WgXcQ -> 144p video-only (itag=160)
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
