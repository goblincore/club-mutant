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
