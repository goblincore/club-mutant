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

The service defaults to yt-dlp only. No `.env` changes needed.

To experiment with rusty-ytdl (broken, not recommended):

```
USE_RUSTY_YTDL=true
```

## Current Status (Feb 2026)

### ⚠️ DISABLED BY DEFAULT

rusty-ytdl is **disabled by default** because n-parameter transformation is broken for current YouTube players. The service defaults to yt-dlp only.

To enable (experimental): `USE_RUSTY_YTDL=true`

### What Works

- ✅ rusty-ytdl-hybrid binary compiles and runs
- ✅ Integrated with Go youtube-api service
- ✅ Fallback to yt-dlp when rusty-ytdl fails
- ✅ Local fork of rusty_ytdl with configurable `client_type` (WEB)
- ✅ WEB client returns URLs locally

### What's Broken

- ❌ **n-parameter transformation fails** - Both rusty_ytdl's internal `ncode` and ytdlp-ejs fail to extract/transform n-params from current YouTube player.js
- ❌ **URLs get 403s** - Without proper n-param transform, YouTube throttles/blocks requests
- ❌ **ytdlp-ejs outdated** - Its AST patterns don't match current player.js structure (player `4e51e895` fails, older `3d3ba064` works)

### Root Cause

YouTube's player.js structure changed. Both:

1. **rusty_ytdl's `extract_ncode`** - Uses regex patterns that don't match current player
2. **ytdlp-ejs's `sig::extract`/`n::extract`** - Uses SWC AST matching that doesn't find functions

The n-parameter in URLs remains scrambled (e.g., `n=2EYSg6cdZ643DVKGD`) instead of being transformed to a shorter value.

### Previous Attempts

1. **ANDROID → WEB client** - Fixed client type but n-param still broken
2. **ytdlp-ejs integration** - Library works with old players, fails with current
3. **Standalone ytdlp-ejs test** - Confirmed issue is with current player.js parsing

### To Fix (Future Work)

1. Update ytdlp-ejs patterns to match current YouTube player.js structure
2. Or update rusty_ytdl's `extract_ncode` regex patterns
3. Both require tracking YouTube's player.js changes over time

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
| `USE_RUSTY_YTDL` | `false` | Enable Rust resolver (experimental, broken) |
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

1. **Use yt-dlp** - Current default, works reliably
2. **Monitor ytdlp-ejs** - Watch for updates that fix current player support
3. **Future** - If ytdlp-ejs or rusty_ytdl update n-param extraction, re-enable
4. **Consider** - Upstreaming `client_type` to rusty_ytdl if it becomes useful

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
