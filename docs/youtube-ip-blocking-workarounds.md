# YouTube IP Blocking Workarounds

YouTube blocks or rate-limits requests from datacenter IPs (AWS, GCP, Fly.io, etc.) with "Sign in to confirm you're not a bot" errors.

## Current Status

| Approach                       | Status     | Notes                                              |
| ------------------------------ | ---------- | -------------------------------------------------- |
| **Go library (kkdai/youtube)** | ✅ Working | Works for normal videos                            |
| **yt-dlp + PO Token fallback** | ✅ Working | Fallback when Go library fails                     |
| **iframe mode**                | ✅ Working | Ultimate fallback for restricted content           |
| **Age-restricted content**     | ❌ Blocked | Requires YouTube cookies (not currently supported) |

## What Works

### Normal Videos (e.g., Rick Astley)

Most videos resolve successfully via the Go library or yt-dlp with PO tokens:

```bash
curl "https://club-mutant-youtube-api.fly.dev/resolve/dQw4w9WgXcQ"
# Returns stream URL ✅
```

### What Doesn't Work

**Age-restricted or embedding-disabled videos** fail because they require actual YouTube authentication (cookies), not just PO tokens:

- Age-restricted content → "login required to confirm your age"
- Embedding disabled → "embedding of this video has been disabled"

These restrictions are enforced **before** PO tokens come into play.

## Architecture

```
Client Request
      ↓
YouTube API (Go) ─────────────────────┐
      │                               │
      ├─ Go library works? ──────────→ Return stream URL ✅
      │
      ├─ Go library fails?
      │         ↓
      │    yt-dlp fallback
      │         ↓
      │    PO Token Provider ← Generates attestation tokens
      │         ↓
      ├─ yt-dlp works? ──────────────→ Return stream URL ✅
      │
      └─ Both fail? ─────────────────→ Client uses iframe mode
```

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

- `services/youtube-api/main.go` - Go library + yt-dlp fallback
- `services/youtube-api/Dockerfile` - Alpine with yt-dlp, Node.js, PO token plugin
- `services/pot-provider/` - PO token provider service
- `client/src/scenes/Game.ts` - `BACKGROUND_VIDEO_RENDERER` setting

## Next Steps

1. ✅ PO token provider working for normal videos
2. Switch to WebGL mode for production (currently using iframe)
3. (Optional) Implement cookie workaround for age-restricted content
4. (Future) Add Redis caching for resolved URLs
