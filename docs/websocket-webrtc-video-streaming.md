# WebSocket/WebRTC Video Streaming

## The Question

Can we stream YouTube videos over WebSocket or WebRTC instead of HTTP to leverage existing connections?

---

## WebSocket Approach

### How It Would Work

```
Client                    Colyseus Server              YouTube API Service
  |                              |                              |
  |------ WS: play video ------->|                              |
  |                              |------ HTTP: fetch video ---->|
  |                              |<----- video chunks ----------|
  |                              |                              |
  |<----- WS: video chunk -------|                              |
  |<----- WS: video chunk -------|                              |
  |<----- WS: video chunk -------|                              |
```

### Implementation

```typescript
// Server
room.onMessage('REQUEST_VIDEO_CHUNK', (client, { videoId, offset, length }) => {
  const chunk = await fetchVideoChunk(videoId, offset, length)
  client.send('VIDEO_CHUNK', { 
    videoId, 
    offset, 
    data: chunk.toString('base64') // Binary data as base64
  })
})

// Client
room.onMessage('VIDEO_CHUNK', ({ videoId, offset, data }) => {
  const buffer = base64ToArrayBuffer(data)
  mediaSource.appendBuffer(buffer)
})
```

### Pros

✅ **Reuses existing connection** - no new TCP handshake  
✅ **Bidirectional** - server can push chunks proactively  
✅ **Lower latency** - connection already established  

### Cons

❌ **No browser caching** - HTTP cache doesn't work with WS  
❌ **Base64 overhead** - 33% larger payload (binary → text encoding)  
❌ **Memory pressure** - all chunks must go through JS heap  
❌ **No range requests** - must implement custom chunking protocol  
❌ **Colyseus bottleneck** - all video traffic goes through game server  
❌ **No CDN benefits** - can't leverage edge caching  

### Performance Impact

**Current (HTTP):**
- 10MB video = 10MB transferred
- Browser handles chunking/buffering automatically
- Can use HTTP/2 multiplexing

**WebSocket:**
- 10MB video = 13.3MB transferred (base64 overhead)
- Manual chunking/buffering required
- Single TCP connection (no multiplexing)
- Colyseus server becomes video proxy (high CPU/memory)

---

## WebRTC Approach

### How It Would Work

```
Client A                  Client B (DJ)                YouTube
  |                              |                         |
  |<---- WebRTC Data Channel --->|                         |
  |                              |------ fetch video ----->|
  |                              |<----- video chunks -----|
  |<----- video chunks ----------|                         |
```

This is **peer-to-peer** video streaming where the DJ fetches the video and broadcasts it to all viewers.

### Implementation

```typescript
// DJ (broadcaster)
const peerConnection = new RTCPeerConnection()
const dataChannel = peerConnection.createDataChannel('video')

fetch(`/youtube/proxy/${videoId}`)
  .then(response => response.body.getReader())
  .then(reader => {
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) return
      dataChannel.send(value) // Send chunk to all peers
      pump()
    })
    pump()
  })

// Viewer (receiver)
dataChannel.onmessage = (event) => {
  const chunk = event.data
  mediaSource.appendBuffer(chunk)
}
```

### Pros

✅ **Peer-to-peer** - reduces server bandwidth  
✅ **Low latency** - direct connection between clients  
✅ **Binary transfer** - no base64 overhead  
✅ **Scalable** - server doesn't proxy video data  

### Cons

❌ **Complex setup** - STUN/TURN servers, signaling, NAT traversal  
❌ **DJ bandwidth** - DJ must upload video to all viewers  
❌ **Unreliable** - if DJ disconnects, stream dies  
❌ **No browser caching** - same as WebSocket  
❌ **Firewall issues** - corporate networks often block WebRTC  
❌ **Mobile data costs** - DJ pays for upload bandwidth  

### Performance Impact

**Bandwidth (DJ side):**
- 5 viewers = DJ uploads 5x the video size
- 10MB video × 5 viewers = 50MB upload from DJ's device

**Latency:**
- Best case: 50-100ms (direct peer connection)
- Worst case: 500ms+ (TURN relay server)

---

## Why HTTP is Better for Your Use Case

### 1. **Browser Video Element Optimization**

The `<video>` element is **highly optimized** for HTTP streaming:

```typescript
// Browser automatically handles:
<video src="https://youtube-api.fly.dev/proxy/abc123">
```

- **Adaptive buffering** - requests chunks as needed
- **Range requests** - seeks without re-downloading
- **Hardware decoding** - GPU acceleration
- **Memory management** - discards old chunks
- **Error recovery** - retries failed chunks

With WebSocket/WebRTC, you'd have to **reimplement all of this** using MediaSource Extensions.

### 2. **HTTP/2 Multiplexing**

Modern HTTP/2 already solves the "multiple connections" problem:

```
Single TCP Connection
├── Stream 1: /resolve/abc123
├── Stream 2: /proxy/abc123
├── Stream 3: /prefetch/xyz789
└── Stream 4: WebSocket (Colyseus)
```

All requests share one connection, no handshake overhead.

### 3. **CDN & Edge Caching**

HTTP responses can be cached at multiple layers:

```
Client → Fly.io Edge → Your Go Service → YouTube
         ↑ Cache here
```

Fly.io can cache popular videos at edge locations, reducing latency for all users.

WebSocket/WebRTC bypass this entirely.

### 4. **Bandwidth Efficiency**

| Method | Overhead | Caching | Multiplexing |
|--------|----------|---------|--------------|
| **HTTP** | 0% | ✅ Yes | ✅ HTTP/2 |
| **WebSocket** | +33% (base64) | ❌ No | ❌ No |
| **WebRTC** | 0% | ❌ No | ✅ Yes |

---

## When WebSocket/WebRTC Makes Sense

### ✅ Good Use Cases

1. **Live streaming** - DJ's webcam/screen share
2. **Real-time audio** - voice chat, DJ commentary
3. **Interactive controls** - synchronized playback controls
4. **Low-latency events** - chat, reactions, presence

### ❌ Bad Use Cases

1. **Pre-recorded video** - HTTP is better
2. **Large file transfer** - HTTP is better
3. **Seekable media** - HTTP range requests are better

---

## Hybrid Approach (Best of Both Worlds)

Keep HTTP for video, use WebSocket for control:

```typescript
// Video: HTTP (optimized, cached, efficient)
<video src="https://youtube-api.fly.dev/proxy/abc123">

// Control: WebSocket (real-time, bidirectional)
room.send('SYNC_PLAYBACK', { 
  timestamp: video.currentTime,
  paused: video.paused 
})
```

This is **exactly what you're doing now**, and it's the right architecture.

---

## Potential Optimization: Service Worker

If you want to leverage WebSocket for **control** while keeping HTTP for **data**, use a Service Worker:

```typescript
// Service Worker intercepts HTTP requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  
  if (url.pathname.startsWith('/proxy/')) {
    // Check if video is in IndexedDB cache (from WS prefetch)
    event.respondWith(
      caches.match(event.request)
        .then(cached => cached || fetch(event.request))
    )
  }
})

// Prefetch via WebSocket, store in cache
room.onMessage('PREFETCH_VIDEO', async ({ videoId, data }) => {
  const cache = await caches.open('video-cache')
  const response = new Response(data, {
    headers: { 'Content-Type': 'video/mp4' }
  })
  await cache.put(`/proxy/${videoId}`, response)
})
```

This lets you:
- Use WebSocket for **prefetch** (push-based, proactive)
- Use HTTP for **playback** (browser-optimized, cached)

But this adds significant complexity for marginal benefit.

---

## Recommendation

**Stick with HTTP for video streaming.**

Your current architecture is optimal:
- ✅ HTTP for video (cached, efficient, browser-optimized)
- ✅ WebSocket for game state (real-time, bidirectional)
- ✅ Prefetch for next video (proactive caching)
- ✅ 500MB cache (keeps videos warm)

The 10.8s initial load is **YouTube's download time**, not your architecture. No amount of WebSocket/WebRTC will make YouTube's servers faster.

Focus optimization efforts on:
1. ✅ Prefetch (done)
2. ✅ Cache size (done)
3. 🔄 CDN/edge caching (Fly.io already does this)
4. 🔄 Video quality selection (144p loads faster than 360p)
