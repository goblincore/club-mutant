# HTTP/2 Server Push for Video Streaming

## What is HTTP/2 Server Push?

HTTP/2 Server Push allows the server to proactively send resources to the client **before** the client requests them. Instead of the traditional request-response cycle, the server can "push" data it predicts the client will need.

## Traditional Flow (HTTP/1.1 or HTTP/2 without Push)

```
Client                          Server
  |                               |
  |------ GET /video/abc123 ----->|
  |                               |
  |<----- 200 OK (metadata) ------|
  |                               |
  | (browser parses, realizes     |
  |  it needs video data)         |
  |                               |
  |------ GET /proxy/abc123 ----->|
  |                               | (10s delay while
  |<----- 200 OK (video data) ----| downloading from YouTube)
  |                               |
```

**Problem:** The client must wait for the initial response, parse it, then make a second request. This adds latency.

## HTTP/2 Server Push Flow

```
Client                          Server
  |                               |
  |------ GET /video/abc123 ----->|
  |                               |
  |                               | (server immediately starts
  |                               |  pushing video data)
  |                               |
  |<----- PUSH_PROMISE ----------| "I'm sending /proxy/abc123"
  |<----- 200 OK (metadata) ------|
  |<----- 200 OK (video data) ----| (pushed, no request needed)
  |                               |
```

**Benefit:** Video data arrives **before** the browser even knows it needs it.

---

## How It Works Technically

### 1. PUSH_PROMISE Frame

When the server receives a request for `/video/abc123`, it sends a `PUSH_PROMISE` frame:

```
PUSH_PROMISE
  Promised Stream ID: 4
  :method: GET
  :path: /proxy/abc123
  :scheme: https
  :authority: youtube-api.fly.dev
```

This tells the client: "I'm about to send you `/proxy/abc123` on stream 4, even though you didn't ask for it yet."

### 2. Pushed Response

The server then sends the video data on the promised stream:

```
HEADERS (stream 4)
  :status: 200
  content-type: video/mp4
  content-length: 10485760

DATA (stream 4)
  [video bytes...]
```

### 3. Client Cache

The browser stores the pushed response in its HTTP cache. When the `<video>` element later requests `/proxy/abc123`, the browser uses the cached push instead of making a network request.

---

## Implementation in Go

```go
// Detect if client supports HTTP/2 push
func (s *Server) handleResolve(w http.ResponseWriter, r *http.Request) {
    videoID := r.PathValue("videoId")
    
    // Resolve video URL
    result, err := s.resolveWithYtDlp(videoID, true)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    // Check if HTTP/2 push is available
    if pusher, ok := w.(http.Pusher); ok {
        // Push the video proxy URL
        proxyPath := fmt.Sprintf("/proxy/%s", videoID)
        
        err := pusher.Push(proxyPath, &http.PushOptions{
            Method: "GET",
            Header: http.Header{
                "Accept": []string{"video/*"},
            },
        })
        
        if err != nil {
            log.Printf("[push] Failed to push %s: %v", proxyPath, err)
        } else {
            log.Printf("[push] Pushed %s", proxyPath)
        }
    }
    
    // Send resolve response
    json.NewEncoder(w).Encode(result)
}
```

---

## Challenges & Limitations

### 1. **Cache Coordination**

The pushed resource must match **exactly** what the client will request later:
- Same URL
- Same headers (especially `Range` requests)
- Same cache keys

**Problem for video streaming:** Browsers request video in chunks using `Range: bytes=0-1048575`. If we push the entire video, the browser may ignore it and request ranges anyway.

### 2. **Bandwidth Waste**

If the user doesn't actually play the video (e.g., skips to next song), we've wasted bandwidth pushing data they never used.

**Mitigation:** Only push the first 1-2MB (enough for metadata + initial playback).

### 3. **HTTP/2 Only**

Server Push requires HTTP/2. Fly.io supports this, but:
- Client must also support HTTP/2 (most modern browsers do)
- HTTPS required (HTTP/2 over TLS)

### 4. **Browser Support**

Chrome/Edge removed support for HTTP/2 Push in 2022 due to complexity and limited real-world benefit. Firefox and Safari still support it.

**Current browser support:**
- ✅ Firefox
- ✅ Safari
- ❌ Chrome/Edge (removed in v106)

---

## Alternative: 103 Early Hints

Since Chrome removed push support, a newer approach is **103 Early Hints**:

```go
func (s *Server) handleResolve(w http.ResponseWriter, r *http.Request) {
    videoID := r.PathValue("videoId")
    
    // Send 103 Early Hints before resolving
    w.WriteHeader(103) // StatusEarlyHints
    w.Header().Set("Link", fmt.Sprintf("</proxy/%s>; rel=preload; as=video", videoID))
    
    // Now resolve video
    result, err := s.resolveWithYtDlp(videoID, true)
    // ... send 200 response
}
```

The browser sees the `Link` header and starts fetching `/proxy/{videoId}` in parallel with the resolve request.

**Pros:**
- Works in Chrome/Edge
- Less complex than Server Push
- No risk of pushing unwanted data

**Cons:**
- Browser still makes a separate request (not truly "pushed")
- Slightly higher latency than true push

---

## Recommendation for Your Use Case

**Don't use HTTP/2 Server Push** because:

1. **Chrome doesn't support it** (50%+ of users)
2. **Range requests complicate caching** - videos are streamed in chunks, not as a single blob
3. **Prefetch is simpler and works** - your current approach (prefetch on playlist add) achieves similar results without push complexity

**Better approach:**

```typescript
// When video starts playing, prefetch next video in queue
onVideoStart(currentVideoId: string) {
  const nextVideo = this.getNextInQueue()
  if (nextVideo) {
    // Prefetch resolve + first 2MB of video
    fetch(`/youtube/prefetch/${nextVideo.id}`)
  }
}
```

This gives you 90% of the benefit with 10% of the complexity.

---

## Summary

| Approach | Latency | Browser Support | Complexity | Bandwidth Waste |
|----------|---------|-----------------|------------|-----------------|
| **HTTP/2 Push** | Lowest | Firefox/Safari only | High | Medium |
| **103 Early Hints** | Low | All modern | Medium | Low |
| **Prefetch API** | Medium | All | Low | Low |
| **Current (on-demand)** | High | All | Lowest | None |

**Your current prefetch strategy is the right choice.** Focus on:
1. ✅ Increased cache size (500MB) - done
2. ⏳ Prefetch next video when current starts playing
3. Consider 103 Early Hints only if you need to squeeze out more performance
