# HLS Proxy Design Document

## Overview

This document explores implementing HLS (HTTP Live Streaming) proxy support for YouTube video backgrounds, as an alternative to the current direct MP4 streaming approach.

## Current Architecture (Direct MP4)

```
Browser (Phaser Video)
    ↓ GET /youtube/proxy/{videoId}
Colyseus Server
    ↓ Proxy request
YouTube API Service (Go)
    ↓ Resolve via yt-dlp → direct MP4 URL
    ↓ Stream bytes from googlevideo.com
    ← Stream bytes back
← Single continuous stream to browser
```

**Characteristics:**

- Single HTTP connection per video
- ~5-25 MB per 3-minute video (at 144-360p)
- No adaptive bitrate
- Simple implementation

## Proposed Architecture (HLS Proxy)

```
Browser (hls.js + Phaser)
    ↓ GET /youtube/hls/{videoId}/master.m3u8
YouTube API Service
    ↓ Resolve via yt-dlp → HLS manifest URL
    ↓ Fetch original manifest
    ↓ Rewrite segment URLs → /youtube/hls/{videoId}/segment/{segmentId}
    ← Return rewritten manifest
Browser parses manifest, requests segments
    ↓ GET /youtube/hls/{videoId}/segment/{segmentId}
YouTube API Service
    ↓ Proxy segment from googlevideo.com
    ← Return segment bytes
```

## Components Required

### 1. Client-Side: hls.js Integration

```typescript
import Hls from 'hls.js'

// Check if native HLS is supported (Safari) or use hls.js
if (Hls.isSupported()) {
  const hls = new Hls({
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
  })
  hls.loadSource(`${apiBase}/youtube/hls/${videoId}/master.m3u8`)
  hls.attachMedia(videoElement)
} else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
  // Native HLS (Safari)
  videoElement.src = `${apiBase}/youtube/hls/${videoId}/master.m3u8`
}
```

**Considerations:**

- hls.js adds ~60KB to bundle (gzipped)
- Need to handle quality switching UI (or let hls.js auto-select)
- Phaser's Video object may need wrapping or replacement

### 2. Server-Side: Manifest Proxy with URL Rewriting

```go
func (s *Server) handleHLSManifest(w http.ResponseWriter, r *http.Request) {
    videoID := r.PathValue("videoId")

    // Resolve to get HLS manifest URL
    hlsURL := resolveHLSManifest(videoID)

    // Fetch original manifest
    resp, _ := http.Get(hlsURL)
    manifest := parseM3U8(resp.Body)

    // Rewrite all segment URLs
    for i, segment := range manifest.Segments {
        // Original: https://rr5---sn-xxx.googlevideo.com/videoplayback/...
        // Rewritten: /youtube/hls/{videoId}/segment/{base64(originalUrl)}
        manifest.Segments[i].URI = fmt.Sprintf(
            "/youtube/hls/%s/segment/%s",
            videoID,
            base64.URLEncoding.EncodeToString([]byte(segment.URI)),
        )
    }

    w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
    w.Write(manifest.Encode())
}
```

### 3. Server-Side: Segment Proxy

```go
func (s *Server) handleHLSSegment(w http.ResponseWriter, r *http.Request) {
    segmentURLEncoded := r.PathValue("segmentId")
    segmentURL, _ := base64.URLEncoding.DecodeString(segmentURLEncoded)

    // Proxy the segment from googlevideo.com
    resp, _ := http.Get(string(segmentURL))

    w.Header().Set("Content-Type", "video/mp2t")
    io.Copy(w, resp.Body)
}
```

## HLS Manifest Structure

YouTube HLS manifests have this structure:

```
master.m3u8 (variant playlist)
├── 144p.m3u8 (media playlist)
│   ├── segment0.ts
│   ├── segment1.ts
│   └── ...
├── 240p.m3u8
├── 360p.m3u8
└── 720p.m3u8
```

Each segment is typically 2-10 seconds of video.

## Advantages of HLS Proxy

| Advantage             | Description                                                |
| --------------------- | ---------------------------------------------------------- |
| **Adaptive Bitrate**  | Automatically switches quality based on network conditions |
| **Better Buffering**  | Smaller chunks = faster initial playback                   |
| **Seeking**           | More efficient seeking (jump to segment, not re-stream)    |
| **Resilience**        | Failed segment can be retried without restarting stream    |
| **Lower Memory**      | Only buffers a few segments at a time                      |
| **Progress Accuracy** | Duration known upfront from manifest                       |

## Disadvantages of HLS Proxy

| Disadvantage           | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| **Complexity**         | More code, more failure points                       |
| **Request Volume**     | 10x-100x more HTTP requests per video                |
| **Server Load**        | Each segment is a separate proxy request             |
| **Latency**            | Manifest fetch + first segment fetch before playback |
| **Caching Complexity** | Need to cache manifests AND segments separately      |
| **URL Expiration**     | Segment URLs expire; manifest may need refresh       |

## Open Questions

### 1. Caching Strategy

**Question:** How do we cache HLS segments efficiently?

- Segments are typically 2-10 seconds, 50-500KB each
- A 3-minute video at 360p might have 30-90 segments
- Segment URLs contain expiration timestamps

**Options:**

- **In-memory cache:** Fast but limited by RAM
- **Redis:** Shared across instances, but adds latency
- **Don't cache segments:** Just proxy every request (simpler, but more load)

### 2. Manifest Expiration

**Question:** How do we handle manifest/segment URL expiration?

YouTube URLs typically expire in 6 hours. Options:

- Re-resolve manifest periodically
- Client-side error handling + retry with fresh manifest
- Cache manifest with shorter TTL than expiration

### 3. Quality Selection

**Question:** Who decides the quality level?

- **hls.js auto (ABR):** Automatic based on bandwidth estimation
- **Server-forced:** Only return 144p/240p manifest variants
- **User preference:** Let user choose quality

For background video, forcing low quality makes sense to save bandwidth.

### 4. Phaser Video Compatibility

**Question:** Does Phaser's Video object work with HLS?

- Phaser wraps HTML5 `<video>` element
- Native HLS works on Safari
- hls.js requires access to underlying video element
- May need to bypass Phaser's Video and manage element directly

### 5. Fallback Strategy

**Question:** What happens when HLS fails?

- Fall back to direct MP4 proxy?
- Fall back to iframe embed?
- How do we detect HLS failure vs. transient network issue?

### 6. IP Locking

**Question:** Are YouTube segment URLs IP-locked?

YouTube may lock stream URLs to the IP that resolved them. If so:

- Client can't fetch segments directly (even if CORS allowed)
- All segments MUST go through server proxy
- This is actually our current assumption, so should be fine

## Performance Comparison

| Metric              | Direct MP4                   | HLS Proxy                                  |
| ------------------- | ---------------------------- | ------------------------------------------ |
| Time to first frame | ~3-6s (resolve + buffer)     | ~2-4s (resolve + manifest + first segment) |
| Requests per video  | 2 (resolve + stream)         | 30-100+ (resolve + manifest + segments)    |
| Server CPU          | Low (just proxy bytes)       | Low (same, but more requests)              |
| Server bandwidth    | Same total bytes             | Same total bytes                           |
| Client memory       | Buffers full video           | Buffers few segments                       |
| Seeking             | Re-request with Range header | Jump to segment                            |

## Implementation Phases

### Phase 1: Basic HLS Proxy (MVP)

- Add `/youtube/hls/{videoId}/master.m3u8` endpoint
- Rewrite manifest URLs
- Add `/youtube/hls/{videoId}/segment/{id}` endpoint
- Force single quality (144p or 240p)
- No caching

### Phase 2: Client Integration

- Add hls.js to client bundle
- Create HLS-aware video wrapper
- Integrate with Phaser scene
- Handle errors + fallback

### Phase 3: Optimization

- Add segment caching (Redis or in-memory)
- Add manifest caching with refresh
- Add quality selection

### Phase 4: Monitoring

- Add metrics: segments served, cache hit rate, errors
- Add latency tracking
- Add bandwidth usage tracking

## Recommendation

**For the current use case (low-res background video), direct MP4 is sufficient.**

HLS would make sense if:

- Videos are long (10+ minutes)
- Users have variable network conditions
- You want quality selection
- You're seeing buffering issues with direct MP4

The implementation effort is significant (~2-4 days) and adds operational complexity. I'd only pursue this if the current direct MP4 approach shows problems at scale.

## References

- [hls.js Documentation](https://github.com/video-dev/hls.js)
- [HLS Specification](https://datatracker.ietf.org/doc/html/rfc8216)
- [yt-dlp format selection](https://github.com/yt-dlp/yt-dlp#format-selection)
