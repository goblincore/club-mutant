# YouTube API Microservice

A lightweight Go service that provides YouTube search functionality for Club Mutant, decoupled from the main Colyseus game server.

## Prerequisites

- Go 1.21+
- (Optional) Docker for containerized deployment

## Quick Start

```bash
# Install dependencies
go mod tidy

# Run the service
go run .

# Or build and run
go build -o youtube-api .
./youtube-api
```

The service runs on port `8081` by default.

## API Endpoints

### GET /search

Search YouTube for videos.

**Query Parameters:**

- `q` (required): Search query
- `limit` (optional): Max results (1-50, default: 10)

**Example:**

```bash
curl "http://localhost:8081/search?q=lofi+hip+hop&limit=5"
```

**Response:**

```json
{
  "items": [
    {
      "id": "jfKfPfyJRdk",
      "type": "video",
      "title": "lofi hip hop radio 📚 beats to relax/study to",
      "channelTitle": "Lofi Girl",
      "duration": "0:00",
      "isLive": true,
      "thumbnail": "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg"
    }
  ],
  "query": "lofi hip hop",
  "cached": false,
  "cacheAt": 1706601234
}
```

### GET /resolve/:videoId

Resolve a YouTube video ID to a direct stream URL.

**Query Parameters:**

- `videoOnly` (optional): Set to `true` to get video-only stream (no audio, lower bandwidth)

**Example:**

```bash
# Combined audio+video (default)
curl "http://localhost:8081/resolve/dQw4w9WgXcQ"

# Video-only (for background visuals)
curl "http://localhost:8081/resolve/dQw4w9WgXcQ?videoOnly=true"
```

**Response:**

```json
{
  "videoId": "dQw4w9WgXcQ",
  "url": "https://rr1---sn-xxx.googlevideo.com/videoplayback?...",
  "expiresAtMs": 1706605234000,
  "resolvedAtMs": 1706601234000,
  "videoOnly": true,
  "quality": "360p video-only"
}
```

### GET /proxy/:videoId

Stream a YouTube video through the server (avoids CORS issues for WebGL playback).

**Query Parameters:**

- `videoOnly` (optional): Set to `false` for combined audio+video (default: `true`)

**Headers:**

- Supports `Range` header for seeking

**Example:**

```bash
# Stream video-only (default, best for background visuals)
curl "http://localhost:8081/proxy/dQw4w9WgXcQ" --output video.mp4

# Stream with audio
curl "http://localhost:8081/proxy/dQw4w9WgXcQ?videoOnly=false" --output video.mp4
```

**Response:** Raw video stream with appropriate `Content-Type`, `Content-Length`, `Content-Range` headers.

### GET /health

Health check endpoint.

**Response:**

```json
{ "status": "ok" }
```

## Environment Variables

| Variable                | Default | Description                 |
| ----------------------- | ------- | --------------------------- |
| `PORT`                  | `8081`  | HTTP server port            |
| `YOUTUBE_API_CACHE_TTL` | `3600`  | Search cache TTL in seconds |

## Docker

```bash
# Build
docker build -t youtube-api .

# Run
docker run -p 8081:8081 youtube-api
```

## Architecture Notes

This service uses the `ytsearch` library which scrapes YouTube's web interface. It's more reliable than manual parsing but may still break if YouTube changes their frontend significantly.

### Caching

- In-memory cache with configurable TTL
- Cache key: `{query}:{limit}`
- Automatic cleanup of expired entries every 5 minutes

### Future Phases

1. **Resolve endpoint**: Add `/resolve/:videoId` to get direct video URLs via `yt-dlp`
2. **Redis cache**: Shared cache for horizontal scaling
3. **Stream proxy**: Proxy video streams for playback
