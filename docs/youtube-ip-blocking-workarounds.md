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

### Residential Proxy (Expensive)

Use a residential proxy service for YouTube requests.

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
