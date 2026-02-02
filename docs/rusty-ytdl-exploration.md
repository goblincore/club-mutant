# Rust YouTube Resolver Exploration (rusty-ytdl)

## Overview

This document explores using `rusty-ytdl` as a potential future replacement for yt-dlp in the YouTube API service. The primary motivation is **built-in FFmpeg filtering support**, which could enable server-side audio processing (EQ, normalization, visualizers) before proxying to clients.

## Current State (yt-dlp)

The current Go-based YouTube API service (`services/youtube-api/`) uses:
- **yt-dlp** (Python) for stream URL extraction via ISP proxy
- ~2-3s resolve time with warm cache
- PO token fallback for non-proxy paths
- In-memory LRU cache for video bytes

## rusty-ytdl Potential Benefits

### 1. Built-in FFmpeg Filters

```rust
// Example: Apply audio EQ before streaming
use rusty_ytdl::{Video, VideoOptions, Filter};

let options = VideoOptions {
    filters: Some(vec![
        Filter::AudioEq {
            bands: vec![
                (31.0, 3.0),   // +3dB at 31Hz (bass boost)
                (8000.0, 2.0), // +2dB at 8kHz (brightness)
            ],
        },
        Filter::Volume(1.5), // 1.5x volume boost
    ]),
    ..Default::default()
};
```

**Use cases for Club Mutant:**
- **Booth audio processing**: Normalize audio across different YouTube videos
- **Visualizers**: Generate waveform/FFT data server-side for WebGL visualization
- **Crossfade**: Server-side crossfade between DJ tracks
- **EQ presets**: "Club mode", "Chill mode", etc.

### 2. Performance

- **Native Rust**: No Python interpreter overhead (~800ms cold start eliminated)
- **Async/await**: Better concurrent request handling
- **Memory safety**: No GIL contention issues

### 3. Single Binary Deployment

- No Python runtime needed in Docker image
- Smaller container (~10MB vs ~150MB with Python + yt-dlp)
- Faster cold starts on Fly.io

## Challenges & Risks

### 1. YouTube Player JS Complexity

YouTube's stream URL extraction requires:
- Parsing obfuscated player JavaScript
- Deciphering signature ciphers (`s` parameter)
- Handling `n` parameter throttling tokens
- Tracking player version changes (breaks every 1-3 months)

**yt-dlp advantage**: 50+ contributors, updates within hours of YouTube changes
**rusty-ytdl risk**: Smaller community, may lag behind breaking changes

### 2. PO Token Requirements

YouTube now requires **PO (Proof of Origin) tokens** for most requests:
- Generated via WebGL/JS challenge in browser
- Currently handled by `pot-provider-rust` service
- yt-dlp has `bgutil` plugin for PO token injection
- rusty-ytdl PO token support status: **TBD** (needs verification)

### 3. ISP Proxy + rust-ytdl

The current ISP proxy bypass works because:
1. Proxy has "residential" IP reputation
2. YouTube trusts it without PO tokens
3. yt-dlp can use `--proxy` flag

**Unknown**: Does rusty-ytdl support proxy configuration for stream extraction?

## Evaluation Plan

### Phase 1: Feasibility Test

```bash
# Create test service
mkdir services/youtube-api-rust
cd services/youtube-api-rust
cargo init
```

**Test cases:**
1. [ ] Resolve video URL through ISP proxy (no PO token)
2. [ ] Extract signature decipher logic works
3. [ ] FFmpeg filter chain applies successfully
4. [ ] Compare resolve latency vs yt-dlp

### Phase 2: Feature Parity

Verify support for:
- [ ] Video-only format selection (itag 160, 133, 134)
- [ ] Combined audio+video formats
- [ ] Age-restricted content (with cookies)
- [ ] Livestream HLS extraction
- [ ] Expiry time extraction from URL

### Phase 3: FFmpeg Filter POC

Build prototype that:
1. Resolves YouTube stream URL
2. Downloads first 30 seconds via FFmpeg
3. Applies audio filter (e.g., high-pass filter)
4. Streams result to client

```rust
// Pseudo-code for POC
use rusty_ytdl::Video;
use ffmpeg_next::{filter, format};

async fn stream_with_filter(video_id: &str) -> Result<Vec<u8>> {
    let video = Video::new(video_id)?;
    let stream_url = video.get_best_audio().url;
    
    // FFmpeg filter graph
    let mut filter = filter::Graph::new();
    filter.add(&format!("highpass=f=200"))?;
    
    // Process and return
    ffmpeg::process(&stream_url, &filter).await
}
```

## Architecture Options

### Option A: Full Replacement

Replace yt-dlp entirely with rusty-ytdl

```
┌─────────────────┐
│   Colyseus      │
│   Server        │
└────────┬────────┘
         │
┌────────▼────────┐
│  youtube-api    │  (Rust - rusty-ytdl)
│  (rusty-ytdl)   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼──┐   ┌──▼────┐
│ ISP  │   │ FFmpeg│
│Proxy │   │Filters│
└──────┘   └───────┘
```

**Pros**: Single service, direct FFmpeg integration
**Cons**: Risk of breakage, maintenance burden

### Option B: Hybrid (Recommended)

Keep yt-dlp as primary, add rusty-ytdl as fast-path

```
┌─────────────────┐
│   youtube-api   │
│   (Go)          │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼──┐   ┌──▼──────────┐
│yt-dlp│   │rusty-ytdl   │
│(slow │   │(fast-path)  │
│path) │   │FFmpeg ready │
└──────┘   └─────────────┘
```

**Flow:**
1. Try rusty-ytdl first (fast, with filters)
2. On failure, fall back to yt-dlp (reliable)
3. Cache results from both paths

**Pros**: Best of both worlds, graceful degradation
**Cons**: More complex, two codebases to maintain

### Option C: FFmpeg Sidecar

Keep yt-dlp, add separate FFmpeg processing service

```
Client ──► youtube-api ──► yt-dlp ──► stream
                              │
                              ▼
                    ┌─────────────────┐
                    │ FFmpeg Service  │
                    │ (Rust + ffmpeg) │
                    └────────┬────────┘
                             │
                             ▼
                    Processed stream
```

**Pros**: yt-dlp reliability + FFmpeg power
**Cons**: Extra hop adds latency, more infrastructure

## Decision Criteria

| Factor | Weight | yt-dlp | rusty-ytdl |
|--------|--------|--------|------------|
| Reliability | High | ✅ Excellent | ⚠️ Unknown |
| FFmpeg filters | Medium | ❌ None | ✅ Built-in |
| Performance | Medium | ⚠️ OK | ✅ Fast |
| Maintenance | High | ✅ Low | ⚠️ High |
| Binary size | Low | ❌ 150MB | ✅ 10MB |

**Recommendation**: 
- **Short term**: Stay with yt-dlp + warmup optimization (completed)
- **Medium term**: Evaluate rusty-ytdl via Option B (hybrid)
- **Trigger**: If rusty-ytdl proves stable for 3+ months

## Next Steps

1. [ ] Create `services/youtube-api-rust/` prototype
2. [ ] Test with ISP proxy (no PO token path)
3. [ ] Build FFmpeg filter POC
4. [ ] Compare resolve success rate vs yt-dlp over 1 week
5. [ ] Decision: adopt, reject, or hybrid

## References

- [rusty-ytdl GitHub](https://github.com/Mithronn/rusty_ytdl)
- [yt-dlp YouTube extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/youtube.py) (~3000 lines)
- [YouTube player JS reverse engineering notes](https://github.com/yt-dlp/yt-dlp/blob/master/devscripts/youtube_player_script.py)
