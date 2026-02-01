# YouTube IP Blocking Workarounds

YouTube blocks or rate-limits requests from datacenter IPs (AWS, GCP, Fly.io, etc.) with "Sign in to confirm you're not a bot" errors.

## Current Status (Jan 2026)

| Approach                       | Status     | Notes                                                |
| ------------------------------ | ---------- | ---------------------------------------------------- |
| **Go library (kkdai/youtube)** | ❌ Removed | Signature parsing broken, always fails               |
| **yt-dlp + PO Token**          | ✅ Primary | Now the only resolver (with cookies + optimizations) |
| **Cookie authentication**      | ✅ Working | For age-restricted content                           |
| **iframe mode**                | ✅ Working | Ultimate fallback for restricted content             |

## Architecture (Simplified Jan 2026)

The Go library was removed because it consistently failed with "error parsing signature tokens". Now yt-dlp is the only resolver:

```
Client Request
      ↓
Colyseus Server
      ↓
YouTube API (Go service)
      ↓
yt-dlp (with cookies + PO tokens)
      ↓
Return stream URL ✅
      │
      └─ Fails? → Client uses iframe mode
```

**Note:** The Colyseus server no longer has a local yt-dlp fallback. All resolution goes through the YouTube API service.

## Services

| Service                    | URL                                             | Purpose                |
| -------------------------- | ----------------------------------------------- | ---------------------- |
| `club-mutant-youtube-api`  | `https://club-mutant-youtube-api.fly.dev`       | Video search + resolve |
| `club-mutant-pot-provider` | `http://club-mutant-pot-provider.internal:4416` | PO token generation    |

## Cookie Workaround (Implemented ✅)

YouTube cookies are now supported for age-restricted content.

**How it works:**

1. Cookies stored as Fly.io secret (`YOUTUBE_COOKIES`)
2. Written to `/tmp/youtube_cookies.txt` at startup
3. Passed to yt-dlp with `--cookies` flag

**To update cookies:**

```bash
# Export cookies from browser (use "Get cookies.txt LOCALLY" extension)
# Then set as Fly.io secret:
fly secrets set YOUTUBE_COOKIES="$(cat path/to/cookies.txt)" -a club-mutant-youtube-api
```

**Trade-offs:**

- Cookies expire and need periodic refreshing
- Account could get flagged for automated access
- Some videos with embedding disabled still won't work

## Alternative Solutions

### ISP Proxy (Recommended)

ISP proxies (static residential) are datacenter IPs registered to consumer ISPs. YouTube trusts them more than pure datacenter IPs, potentially allowing you to skip PO token generation entirely.

| Type                | YouTube Trust | Cost       | Speed    |
| ------------------- | ------------- | ---------- | -------- |
| Datacenter (Fly.io) | Low ❌        | ~$1-2/GB   | Fast     |
| **ISP Proxy**       | Medium ✅     | ~$2-5/GB   | Fast     |
| Residential         | High ✅✅     | ~$10-15/GB | Variable |

**Providers:**

- **Bright Data** - ISP proxy option
- **Oxylabs** - "Datacenter Proxies from ISPs"
- **IPRoyal** - Static residential
- **Smartproxy** - ISP option

**Integration in Go service:**

1. Set proxy URL as Fly.io secret:

```bash
fly secrets set PROXY_URL="http://user:pass@proxy.example.com:port" -a club-mutant-youtube-api
```

2. Add to yt-dlp args in `main.go`:

```go
// In resolveWithYtDlpInternal(), add before running command:
if proxyURL := os.Getenv("PROXY_URL"); proxyURL != "" {
    args = append(args, "--proxy", proxyURL)

    // With ISP proxy, try WITHOUT PO token first (faster if it works)
    // YouTube may not require PO token from trusted IPs
}
```

3. **Test without PO token first:**

```bash
# If this works without bot detection, you can skip PO token entirely
yt-dlp --proxy "http://user:pass@isp-proxy:port" \
  "https://youtube.com/watch?v=dQw4w9WgXcQ" -g -f "bv[height<=360]"
```

**Expected improvement:** 6-7s → 2-3s (if PO token can be skipped)

### Residential Proxy (Expensive)

Use a residential proxy service for YouTube requests. Higher trust than ISP proxies but more expensive and slower.

| Service     | Cost    |
| ----------- | ------- |
| Bright Data | ~$15/GB |
| IPRoyal     | ~$7/GB  |

### Home Server / VPS with Clean IP

Host on residential IP (home server) or find a VPS provider with less-flagged IPs.

## Files

- `services/youtube-api/main.go` - yt-dlp resolver with singleflight + semaphore
- `services/youtube-api/fly.toml` - Fly.io config (performance CPU, RAM disk)
- `services/youtube-api/Dockerfile` - Alpine with yt-dlp, Node.js, PO token plugin
- `services/pot-provider/` - PO token provider service
- `server/index.ts` - Colyseus YouTube routes (no more local yt-dlp fallback)
- `server/youtubeService.ts` - Client wrapper for YouTube API service
- `client/src/scenes/Game.ts` - `BACKGROUND_VIDEO_RENDERER` setting

## Performance Optimizations (Jan 2026)

The YouTube API service was heavily optimized for Fly.io:

### Fly.io VM Configuration

```toml
# fly.toml
[env]
  TMPDIR = '/dev/shm'           # RAM disk for temp files
  XDG_CACHE_HOME = '/dev/shm'   # RAM disk for cache

[[vm]]
  cpu_kind = 'performance'      # Dedicated CPU (no steal)
  cpus = 1
  memory_mb = 2048
```

### Code Optimizations

1. **Singleflight** - Coalesces duplicate requests for same video
2. **Semaphore** - Limits concurrent yt-dlp to 2 processes
3. **Skip Go library** - Goes straight to yt-dlp (Go lib broken)

### Monitoring

Watch these Fly.io metrics:

- **CPU Steal**: Should be 0% with performance CPU
- **Disk Throttled Events**: Should be minimal with RAM disk
- **Network recv vs sent**: If recv >> sent, proxy isn't working

## Next Steps

1. ✅ PO token provider working
2. ✅ Cookie authentication implemented
3. ✅ Performance optimizations (singleflight, RAM disk, perf CPU)
4. ✅ Removed broken Go library
5. (Future) Add Redis caching for resolved URLs across instances
