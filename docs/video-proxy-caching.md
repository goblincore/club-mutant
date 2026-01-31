# Video Proxy Caching Strategies

This document outlines strategies for optimizing the YouTube video proxy to avoid redundant fetches when serving the same video to multiple clients.

## Current Architecture

```
Client A ──┐                              ┌── YouTube fetch 1
Client B ──┼── Colyseus ── Go Proxy ──────┼── YouTube fetch 2
Client C ──┘                              └── YouTube fetch 3
```

Each client request triggers a separate fetch from YouTube, even for the same video.

## Strategy 1: In-Memory Video Cache (Implemented)

Cache video bytes in RAM as they're fetched. Subsequent requests serve from cache.

```
Client A ──┐                              ┌── YouTube fetch (first)
Client B ──┼── Colyseus ── Go Proxy ──────┼── Cache hit (instant)
Client C ──┘                              └── Cache hit (instant)
```

### Implementation Details

```go
type VideoCache struct {
    mu      sync.RWMutex
    entries map[string]*CacheEntry
    maxSize int64 // e.g., 100MB
    curSize int64
}

type CacheEntry struct {
    data      []byte
    expiresAt time.Time
    size      int64
    lastUsed  time.Time
}
```

### Configuration

| Parameter      | Value     | Rationale                            |
| -------------- | --------- | ------------------------------------ |
| Max cache size | 100MB     | ~20 videos at 144p (5MB each)        |
| Entry TTL      | 5 minutes | Videos loop, users may rejoin        |
| Eviction       | LRU       | Remove least recently used when full |

### Pros

- Fast (memory speed)
- Simple implementation
- No external dependencies

### Cons

- Limited by RAM
- Lost on restart
- Single-node only

---

## Strategy 2: Nginx Caching Reverse Proxy

Use nginx as a caching layer in front of the Go service.

### How It Works

```
                    ┌─────────────────────────────────────┐
                    │            Nginx                    │
Clients ──────────▶ │  1. Check cache (disk/memory)      │
                    │  2. If miss: proxy to Go service   │
                    │  3. Store response in cache        │
                    │  4. Serve from cache on next hit   │
                    └─────────────────────────────────────┘
                                    │
                                    ▼
                             Go Proxy Service
                                    │
                                    ▼
                                YouTube
```

### Nginx Configuration Example

```nginx
# Define cache storage
proxy_cache_path /var/cache/nginx/video
    levels=1:2
    keys_zone=video_cache:10m
    max_size=1g
    inactive=10m
    use_temp_path=off;

server {
    listen 80;

    location /proxy/ {
        # Enable caching
        proxy_cache video_cache;

        # Cache key based on video ID
        proxy_cache_key "$request_uri";

        # Cache successful responses for 10 minutes
        proxy_cache_valid 200 206 10m;

        # Serve stale content while revalidating
        proxy_cache_use_stale error timeout updating;

        # Add header to show cache status
        add_header X-Cache-Status $upstream_cache_status;

        # Support range requests (seeking)
        proxy_cache_lock on;
        slice 1m;
        proxy_cache_key "$uri$is_args$args$slice_range";
        proxy_set_header Range $slice_range;

        proxy_pass http://go-service:8081;
    }
}
```

### Key Nginx Directives Explained

| Directive                   | Purpose                                                  |
| --------------------------- | -------------------------------------------------------- |
| `proxy_cache_path`          | Where to store cached files                              |
| `levels=1:2`                | Directory structure (prevents too many files in one dir) |
| `keys_zone=video_cache:10m` | Shared memory zone for cache keys (10MB = ~80k keys)     |
| `max_size=1g`               | Maximum disk space for cache                             |
| `inactive=10m`              | Remove items not accessed in 10 minutes                  |
| `proxy_cache_valid`         | How long to cache responses                              |
| `slice`                     | Break large files into chunks for better caching         |
| `proxy_cache_lock`          | Prevent thundering herd (only one request fetches)       |

### Pros

- Battle-tested, production-ready
- Handles large files efficiently
- Disk-backed (survives restarts)
- Built-in LRU eviction
- Supports range requests (video seeking)

### Cons

- Another component to manage
- Requires nginx configuration knowledge
- Disk I/O latency (vs in-memory)

---

## Strategy 3: Fan-out Streaming

When multiple clients request the same video simultaneously, share a single upstream connection.

### How It Works

```
                    ┌─────────────────────────────────────┐
                    │         Fan-out Manager             │
Client A ──────────▶│                                     │
Client B ──────────▶│  Single YouTube connection ────────▶│── YouTube
Client C ──────────▶│  Broadcasts chunks to all clients  │
                    └─────────────────────────────────────┘
```

### Implementation Concept

```go
type FanoutManager struct {
    mu       sync.RWMutex
    sessions map[string]*FanoutSession
}

type FanoutSession struct {
    videoID    string
    clients    []chan []byte  // Each client gets a channel
    upstream   io.ReadCloser  // Single YouTube connection
    buffer     *RingBuffer    // Keep recent chunks for late joiners
}

func (fm *FanoutManager) Subscribe(videoID string, w http.ResponseWriter) {
    fm.mu.Lock()
    session, exists := fm.sessions[videoID]

    if !exists {
        // First client - create session and start upstream fetch
        session = fm.createSession(videoID)
        go session.fetchAndBroadcast()
    }

    // Add this client to the broadcast list
    clientChan := make(chan []byte, 100)
    session.clients = append(session.clients, clientChan)
    fm.mu.Unlock()

    // Stream chunks to this client
    for chunk := range clientChan {
        w.Write(chunk)
        w.(http.Flusher).Flush()
    }
}
```

### Pros

- Minimum upstream bandwidth (1 fetch for N clients)
- Real-time (no caching delay)
- Great for synchronized playback (all clients see same frame)

### Cons

- Complex implementation
- Clients must start at same point (or use ring buffer for catch-up)
- Doesn't help if requests are staggered

---

## Strategy 4: Pre-fetch on Queue

When a video is added to the DJ queue, pre-fetch it before playback starts.

### Flow

```
1. DJ adds video to queue
2. Server sends pre-fetch hint to Go service
3. Go service resolves URL and caches first 30s of video
4. When playback starts, video is already cached
```

### Implementation

```go
// New endpoint: POST /prefetch/{videoId}
func (s *Server) handlePrefetch(w http.ResponseWriter, r *http.Request) {
    videoID := r.PathValue("videoId")

    go func() {
        // Resolve URL
        resolved, err := s.resolveWithYtDlp(videoID, true)
        if err != nil {
            return
        }

        // Fetch first 30 seconds (estimated ~2MB at 144p)
        resp, _ := http.Get(resolved.URL)
        defer resp.Body.Close()

        data, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
        s.videoCache.Set(videoID, data, 10*time.Minute)
    }()

    w.WriteHeader(http.StatusAccepted)
}
```

### Colyseus Integration

```typescript
// When video is added to playlist
room.onMessage('ROOM_PLAYLIST_ADD', async (client, data) => {
  // ... existing logic ...

  // Trigger pre-fetch
  fetch(`${YOUTUBE_SERVICE_URL}/prefetch/${data.videoId}`, { method: 'POST' })
})
```

---

## Recommended Implementation Order

1. **In-memory cache** (simplest, immediate benefit)
2. **Pre-fetch on queue** (eliminates cold-start latency)
3. **Nginx cache** (if scaling to multiple nodes or need disk persistence)
4. **Fan-out** (only if synchronized playback becomes a requirement)

## Memory Budget Calculation

For in-memory caching:

| Resolution | Bitrate   | 1 min  | 5 min   | 10 videos |
| ---------- | --------- | ------ | ------- | --------- |
| 144p       | ~100 kbps | 750KB  | 3.75MB  | 37.5MB    |
| 240p       | ~250 kbps | 1.9MB  | 9.4MB   | 94MB      |
| 360p       | ~500 kbps | 3.75MB | 18.75MB | 187.5MB   |

**Recommendation:** 100MB cache budget supports ~25 videos at 144p or ~10 at 240p.

---

## Open Questions

1. Should cache be shared across Fly.io instances? (Would need Redis/S3)
2. Should we cache the full video or just the first N seconds?
3. How to handle cache invalidation when YouTube URL expires?
4. Should pre-fetch be opt-in or automatic for all queued videos?
