# Rusty YouTube Hybrid: Faster Video Resolution

Replace yt-dlp with a Rust-based hybrid approach combining `rusty_ytdl` (YouTube API client) + `ytdlp-ejs` (signature solver) to cut video resolution time from ~4s to ~1s.

## Background

Current YouTube video URL resolution uses `yt-dlp` (Python), which takes ~4s per resolve (with ISP proxy) or ~6-7s (with PO token). The bottleneck is:

1. Python interpreter startup
2. Fetching video info from YouTube
3. Fetching and parsing `player.js` for signature decryption
4. Running JavaScript to decrypt sig/n parameters

## The Hybrid Approach

Combine two Rust libraries that each solve part of the problem:

| Library                                              | Role               | Handles                                              |
| ---------------------------------------------------- | ------------------ | ---------------------------------------------------- |
| [rusty_ytdl](https://github.com/Mithronn/rusty_ytdl) | YouTube API client | Innertube API, format selection, proxy support       |
| [ytdlp-ejs](https://github.com/ahaoboy/ytdlp-ejs)    | Signature solver   | sig/n decryption (the hard/frequently-breaking part) |

**Why this works:**

- `rusty_ytdl` handles 80% of yt-dlp's functionality but its sig/n solver breaks when YouTube updates
- `ytdlp-ejs` is a Rust port of yt-dlp's signature solver, actively maintained
- Both are Rust, so they compile together cleanly into a single fast binary

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Go youtube-api service                   │
│                                                             │
│  resolveWithYtDlp()  ──or──  resolveWithRustyYtdl()        │
│         │                           │                       │
│         ▼                           ▼                       │
│    yt-dlp (Python)         rusty_ytdl_hybrid (Rust)        │
│         │                           │                       │
│         │                    ┌──────┴──────┐               │
│         │                    │             │               │
│         │              rusty_ytdl    ytdlp-ejs             │
│         │              (innertube)   (sig/n decrypt)       │
│         │                    │             │               │
│         │                    └──────┬──────┘               │
│         │                           │                       │
│         ▼                           ▼                       │
│    ~4s resolve                 ~1s resolve                  │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Build Hybrid Rust Binary

Create `services/rusty-ytdl-hybrid/`:

- Use `rusty_ytdl` as dependency for YouTube API
- Use `ytdlp-ejs` as dependency for sig/n decryption
- Patch to route sig/n through ytdlp-ejs instead of rusty_ytdl's built-in solver
- CLI that outputs JSON for easy Go integration

```bash
rusty_ytdl_hybrid --resolve dQw4w9WgXcQ --quality 360 --video-only
# Output:
{
  "url": "https://rr5---sn-....googlevideo.com/videoplayback?...",
  "expires_at": 1738900000,
  "quality": "360p",
  "video_only": true
}
```

### Phase 2: Integrate with Go Service

Add `resolveWithRustyYtdl()` to `services/youtube-api/main.go`:

- Feature flag to switch between yt-dlp and rusty_ytdl paths
- Same response format as existing resolver
- Fallback to yt-dlp if rusty_ytdl fails

### Phase 3: Benchmark & Decide

Compare both approaches:
| Metric | yt-dlp | rusty_ytdl_hybrid |
|--------|--------|-------------------|
| Cold resolve | ~4s | target: ~1s |
| Binary size | ~50MB | target: ~10MB |
| Memory | ? | ? |

**Decision criteria:**

- If >2x speedup: Plan migration to full Rust service
- If <1.5x speedup: Keep yt-dlp, explore other optimizations

## File Structure

```
services/
├── youtube-api/              # Existing Go service
│   └── main.go              # Add resolveWithRustyYtdl()
└── rusty-ytdl-hybrid/       # NEW
    ├── Cargo.toml
    ├── src/
    │   ├── main.rs          # CLI entry point
    │   └── lib.rs           # Core logic
    └── Dockerfile
```

## Benchmark Results (2026-02-05)

### Direct (no proxy)

| Metric       | yt-dlp | rusty-ytdl-hybrid |
| ------------ | ------ | ----------------- |
| Resolve time | ~4s    | **1.43s**         |
| Speedup      | —      | **2.8x faster**   |

### With ISP Proxy

| Metric       | yt-dlp | rusty-ytdl-hybrid |
| ------------ | ------ | ----------------- |
| Resolve time | 5.4s   | **3.4s**          |
| Quality      | 144p   | **360p**          |
| Speedup      | —      | **1.6x faster**   |

rusty-ytdl is faster AND gets better quality formats.

### Usage

```bash
# Direct test
./target/release/rusty-ytdl-hybrid --resolve dQw4w9WgXcQ --quality 360 --video-only --timing

# With Go service
export PATH="/path/to/rusty-ytdl-hybrid/target/release:$PATH"
USE_RUSTY_YTDL=true go run .
```

### Deploy to Hetzner

Add to `.env`:

```
USE_RUSTY_YTDL=true
```

## Current Status (Feb 2026)

### Working

- ✅ rusty-ytdl-hybrid binary compiles and runs
- ✅ Integrated with Go youtube-api service
- ✅ Fallback to yt-dlp when rusty-ytdl fails
- ✅ ytdlp-ejs wired up for n-parameter transformation
- ✅ Local fork of rusty_ytdl with configurable `client_type`

### Issue: ANDROID client 403s on Hetzner

rusty_ytdl hardcodes the **ANDROID** innertube client, but URLs resolved with ANDROID get 403 errors when streamed through the proxy. yt-dlp uses **WEB** client by default and works fine.

**Root cause**: Different YouTube clients return different URL formats. ANDROID URLs appear to have different access restrictions.

### Solution: Fork with WEB client support

Created `services/rusty_ytdl_fork/` - a local fork that adds `client_type` to `RequestOptions`:

```rust
// In RequestOptions (structs.rs)
pub client_type: Option<String>,  // "web", "android_sdkless", "ios", "tv_embedded"

// Usage in resolver.rs
options.request_options.client_type = Some("web".to_string());
```

**Files modified in fork:**

- `services/rusty_ytdl_fork/src/structs.rs` - Added `client_type` field
- `services/rusty_ytdl_fork/src/info.rs` - Use configurable client instead of hardcoded `android_sdkless`

### Deploy Commands

```bash
# On Hetzner VPS
cd ~/apps/club-mutant && git pull
cd deploy/hetzner && docker compose build --no-cache youtube-api
docker compose up -d --force-recreate youtube-api

# Check logs
docker compose logs -f youtube-api
```

### Key Log Messages

**Success indicators:**

- `[rusty-ytdl] Completed <videoId> in X.XXs` - Rust resolver ran
- `[prefetch] Successfully prefetched <videoId>` - URL works
- Look for `c=WEB` in URLs (WEB client) vs `c=ANDROID` (old)

**Failure indicators:**

- `[prefetch] Bad status for <videoId>: 403` - URL access denied
- `[rusty-ytdl] n-param transform failed` - ytdlp-ejs couldn't decrypt (may still work)
- Fallback: `[yt-dlp] Completed <videoId>` means it fell back to Python

### Environment Variables

| Variable         | Default | Description                                 |
| ---------------- | ------- | ------------------------------------------- |
| `USE_RUSTY_YTDL` | `true`  | Enable Rust resolver (disable with `false`) |
| `PROXY_URL`      | -       | ISP proxy URL for resolution                |

### File Structure

```
services/
├── youtube-api/           # Go service
│   ├── main.go           # resolveWithRustyYtdl() + resolveWithYtDlp()
│   └── Dockerfile        # Multi-stage: Rust + Go build
├── rusty-ytdl-hybrid/     # Rust CLI binary
│   ├── Cargo.toml        # Uses path = "./rusty_ytdl_fork"
│   └── src/
│       ├── main.rs       # CLI args
│       └── resolver.rs   # Core resolve logic + ytdlp-ejs integration
└── rusty_ytdl_fork/       # Local fork of rusty_ytdl
    └── src/
        ├── structs.rs    # Added client_type to RequestOptions
        └── info.rs       # Configurable client selection
```

### Next Steps

1. **Test WEB client on Hetzner** - Pull latest, rebuild, check if 403s are gone
2. **If WEB works** - Done! Monitor for regressions
3. **If WEB still 403s** - May need signature/n-param handling improvements
4. **Future** - Consider upstreaming `client_type` to rusty_ytdl

## Risks

| Risk                                 | Mitigation                                 |
| ------------------------------------ | ------------------------------------------ |
| rusty_ytdl's innertube client breaks | Test multiple videos; fall back to yt-dlp  |
| Proxy support differs                | Verify ISP proxy works with rusty_ytdl     |
| Age-restricted/live videos fail      | Test edge cases; fall back to yt-dlp       |
| ytdlp-ejs integration issues         | It's a Rust lib, should be straightforward |
| ANDROID client 403s                  | Use WEB client via fork (implemented)      |

## References

- [rusty_ytdl](https://github.com/Mithronn/rusty_ytdl) - Pure Rust YouTube library
- [ytdlp-ejs](https://github.com/ahaoboy/ytdlp-ejs) - Rust port of yt-dlp's signature solver
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Current Python-based resolver
