# YouTube API Microservice

A lightweight Go service that provides YouTube search, video resolution, and streaming proxy functionality for Club Mutant, decoupled from the main Colyseus game server.

## Prerequisites

- Go 1.26.9+
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

### GET /featured

Returns TinyTubes’ shared “Unpopular video of the day”: `{ date, checkedAt, video }`. The date is UTC; the pick remains stable across reloads and service restarts. Every request rechecks the selected video's count through watch-page metadata. A count of 100+, missing metadata, or hidden views cannot be served as an eligible feature. Picks that reach 100 are replaced; an empty eligible pool returns `video: null` and verification failures return 503. Responses use `Cache-Control: no-store`.

`FEATURED_STATE_FILE` optionally sets the atomic daily state file. By default it is `<DISK_CACHE_DIR>/daily/featured.json`, outside the video eviction pool. Persist that directory across deployments. Concurrent requests share one bounded 24-second selection/verification job; an individual canceled request does not cancel other visitors’ work.

### GET /search

Search YouTube for videos.

**Query Parameters:**

- `q` (required): Search query
- `limit` (optional): Max results (1-50, default: 10)
- `maxViews` (optional): Inclusive maximum view count (0–1,000,000). TinyTubes uses `99` for fewer than 100 views. This mode scans up to three pages each of ordinary video search and this month's uploads, filters before limiting, excludes hidden/unknown counts and live streams, and sorts lowest first. Results may be sparse or empty; popular videos are never substituted. Requests have a 24-second search budget and filtered cache entries expire within five minutes. Unfiltered searches retain relevance ordering and the configured cache TTL.

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

- `videoOnly` (optional): Video-only by default; set to `false` for combined audio+video
- `audioOnly` (optional): Set to `true` for audio-only; overrides `videoOnly`

**Example:**

```bash
# Combined audio+video
curl "http://localhost:8081/resolve/dQw4w9WgXcQ?videoOnly=false"

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
- `audioOnly` (optional): Set to `true` for audio-only; overrides `videoOnly`

**Headers:**

- Supports single byte ranges, including suffix ranges, for seeking. Malformed and multipart ranges are ignored and receive the complete resource with HTTP 200.

**Example:**

```bash
# Stream video-only (default, best for background visuals)
curl "http://localhost:8081/proxy/dQw4w9WgXcQ" --output video.mp4

# Stream with audio
curl "http://localhost:8081/proxy/dQw4w9WgXcQ?videoOnly=false" --output video.mp4
```

**Response:** Raw video stream with appropriate `Content-Type`, `Content-Length`, `Content-Range` headers.

### GET /browse (disabled)

This route is disabled in the server router because arbitrary HTML proxying permits
redirect SSRF and same-origin script execution. The following describes the retained
handler, which is not publicly registered.

Proxy-browse an arbitrary web page. Fetches the URL through the server (and configured `PROXY_URL` if set), strips iframe-blocking headers (`X-Frame-Options`, `Content-Security-Policy`), and injects a `<base href>` tag + navigation script for use inside an iframe.

**Query Parameters:**

- `url` (required): Full URL to fetch (must be http or https)

**Example:**

```bash
curl "http://localhost:8081/browse?url=https://www.wikipedia.org/"
```

**Response:** The proxied HTML (or other content) with:

- `X-Frame-Options` and `Content-Security-Policy` headers stripped
- `<base href="https://origin/">` injected so relative resources load from the target
- A small JS script injected that intercepts link clicks and form submissions, sending `postMessage({ type: 'browse-navigate', url })` to the parent frame

**Security:**

- Only `http://` and `https://` URLs are allowed
- Requests to private/loopback IPs are blocked
- Response body capped at 10MB
- 30-second timeout per request

### GET /health

Health check endpoint.

**Response:**

```json
{ "status": "ok" }
```

## Streaming metrics

The existing `/admin` page shows playback cache-hit percentage, memory/disk/miss counts,
bytes served from cache, ISP-proxy and direct media bytes, recent ISP-proxy throughput,
joined downloads, active downloads, outcomes, and upstream errors/403s. It refreshes
every 10 seconds after login. The totals reset when the service restarts; their start
time is displayed. Redis is not needed for these counters.

Two read-only endpoints use the same `Authorization: Bearer <ADMIN_TOKEN>` authentication
as other admin APIs. If `ADMIN_TOKEN` is unset, both return 503; unauthorized requests
return 401. Responses are marked `no-store`.

- `GET /admin/metrics`: JSON snapshot used by the admin page.
- `GET /metrics`: [Prometheus text exposition](https://prometheus.io/docs/instrumenting/exposition_formats/)
  for recording history outside the service. No scraper or historical database is deployed by this change.

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:8081/admin/metrics
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:8081/metrics
```

### What the counters measure

| Metric | Meaning |
| --- | --- |
| `youtube_playback_cache_requests_total{format,result}` | One lookup per valid `/proxy` request, labeled `memory`, `disk`, or `miss`. Prefetch, queue checks, and internal cache rechecks are excluded. Even an unsatisfiable range counts its lookup, but serves zero bytes. |
| `youtube_playback_bytes_total{format,source}` | Bytes accepted by the client response writer, labeled `memory`, `disk`, or `download`. Includes partial ranges and bytes served before a disconnect; does not prove client receipt. |
| `youtube_upstream_media_bytes_total{route,format}` | Response-body bytes actually read on `isp_proxy` or `direct`, including prefetch, failed chunks and retries. Excludes headers, connection overhead, unread response bodies, yt-dlp extraction, search, and `/browse`; this is not the proxy provider's billing total. |
| `youtube_upstream_media_requests_total{route,format}` | Each upstream media HTTP attempt, including retries and oversized probes. Shared subscribers do not multiply this count. |
| `youtube_upstream_media_errors_total{route,format}` | Transport errors, invalid/truncated chunks, and HTTP failures, including 403s. A recovered attempt still counts as an error. |
| `youtube_upstream_media_forbidden_total{route,format}` | Upstream HTTP 403 responses, attributed to the route that returned them. |
| `youtube_media_downloads_started_total` | Shared operations that start an upstream fetch, including probes that discover oversized files. |
| `youtube_media_downloads_joined_total` | Additional viewers or prefetch subscribers joining an existing operation. Indicates sharing, not guaranteed successful downloads or exact bytes saved. |
| `youtube_media_download_results_total{result}` | Shared operation outcomes: `completed`, `failed`, `canceled` (including deadlines), `oversized`, or `cache_recheck` (cache filled before work began). Complete means validated transfer; disk publication is best effort. Oversized playback continues through an unshared stream. |
| `youtube_media_downloads_active` | Current shared operations; excludes unshared oversized streams. |
| `youtube_media_url_refreshes_total` / `youtube_media_url_refresh_successes_total` | URL refresh attempts after 403, and successful resolutions. A successful refresh does not guarantee subsequent media success. |
| `youtube_process_start_time_seconds` | Counter reset boundary. |

Formats are the fixed labels `video`, `audio`, and `combined`. Metrics never label by
video ID, URL, search query, or token. Atomic counters allow concurrent updates;
a snapshot may observe different operations at slightly different instants.

### Recording trends

For an optional Prometheus scraper on the same Docker network, store the admin token
in a restricted file and use:

```yaml
scrape_configs:
  - job_name: youtube-api
    scrape_interval: 30s
    metrics_path: /metrics
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/youtube-admin-token
    static_configs:
      - targets: [youtube-api:8081]
```

Example PromQL for playback cache-hit percentage and ISP-proxy media bytes per second:

```promql
100 * sum(rate(youtube_playback_cache_requests_total{result=~"memory|disk"}[5m]))
  / sum(rate(youtube_playback_cache_requests_total[5m]))

sum(rate(youtube_upstream_media_bytes_total{route="isp_proxy"}[5m]))
```

Compare proxy media bytes against playback bytes over similar workloads and sufficiently
long windows to include prefetch activity. Joined-download counts and recovered errors
help explain changes. No pre-fix baseline was captured, so the new counters cannot
retrospectively quantify savings from the earlier implementation.

## Environment Variables

| Variable                | Default | Description                 |
| ----------------------- | ------- | --------------------------- |
| `PORT`                  | `8081`  | HTTP server port            |
| `YOUTUBE_API_CACHE_TTL` | `3600`  | Search cache TTL in seconds |
| `ADMIN_TOKEN` | unset | Bearer token for admin APIs and metrics endpoints |

## Docker

```bash
# Build
docker build -t youtube-api .

# Run
docker run -p 8081:8081 youtube-api
```

## Architecture Notes

### Libraries

- **Search**: `innertube.go` - bounded YouTube InnerTube searches and continuation parsing
- **Resolve/Proxy**: yt-dlp, using the ISP proxy first and the bgutil PO token provider as fallback. The plugin and provider are pinned together at 2.0.0.

### Caching

- Search/URL caches have TTLs; media bytes use an in-memory LRU plus a persistent disk cache
- Search cache key: `{query}:{limit}`
- Resolve/media keys: `{videoId}`, `{videoId}:video`, or `{videoId}:audio`
- Automatic cleanup of expired entries
- Resolve URLs cached until five minutes before expiry when the signed URL's expiry is available

### Downloads and prefetch

- Playback and `POST /prefetch/:videoId` share the same bounded 1 MiB upstream fetcher. Short chunks are retried; offsets, byte counts and resource totals are validated. A 403 can refresh the signed URL and switch from the ISP proxy to the direct token-bound route, including on a later chunk. A refresh cannot splice a different format into an existing download.
- Concurrent cache misses for the same video and format share one progressive temporary file. Viewers can start before the download finishes and seek independently; prefetch joins the same download. One canceled viewer does not cancel other viewers. The last interested caller cancels upstream work.
- Only successful EOF with the exact declared resource size publishes a cache entry. Failed/canceled transfers and entries above `MAX_CACHEABLE_VIDEO_MB` (default 50 MiB) never publish partial files. Files above the cap remain streamable using bounded ranges, without shared spooling.
- Shared files live in `<DISK_CACHE_DIR>/inflight`, outside the eviction pool, and are removed after the last reader leaves. Startup removes crash leftovers. Each disk cache directory/volume belongs to one service instance; do not share it between concurrently running instances. Without disk caching, spools use the system temporary directory.
- Prefetch uses its own yt-dlp semaphore and fetches video, then audio/analysis, within the queue worker's lifecycle. Queue shutdown cancels its interest in shared downloads; another viewer can keep its download alive. Shared URL resolution has its own 90-second budget so one canceled caller cannot interrupt another's resolution.

### Video Format Selection

| Endpoint                  | Default    | Format Selected               |
| ------------------------- | ---------- | ----------------------------- |
| `/resolve`                | video-only | ≤360p no audio (144p preferred) |
| `/resolve?videoOnly=true` | video-only | ≤360p no audio                |
| `/proxy`                  | video-only | ≤360p no audio (144p typical) |
| `/proxy?videoOnly=false`  | combined   | 360p with audio               |

### Browser Compatibility

- Tested with Safari WebGL video playback
- Supports HTTP Range requests for seeking
- Shared downloads have a five-minute total budget
- MP4 and WebM cache hits advertise the corresponding video/audio content type

### Future: Redis Cache

- Replace in-memory cache for horizontal scaling
- Share resolved URLs across service instances
