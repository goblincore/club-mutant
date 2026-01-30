# YouTube IP Blocking Workarounds

YouTube blocks or rate-limits requests from datacenter IPs (AWS, GCP, Fly.io, etc.) with "Sign in to confirm you're not a bot" errors.

## Current Status

| Approach                       | Status         | Notes                                                     |
| ------------------------------ | -------------- | --------------------------------------------------------- |
| **Go library (kkdai/youtube)** | ⚠️ Partial     | Works for some videos, fails for age-restricted/bot-check |
| **yt-dlp fallback**            | ⚠️ Partial     | Same issue - blocked from datacenter IPs                  |
| **iframe mode**                | ✅ Working     | Current production solution                               |
| **PO Token Provider**          | 🔧 In Progress | Plugin installed but not loading                          |

## Solutions

### 1. iframe Mode (Current - Working)

The simplest solution. Uses YouTube's official embed which isn't blocked.

```typescript
// client/src/scenes/Game.ts
const BACKGROUND_VIDEO_RENDERER: BackgroundVideoRenderer = 'iframe'
```

**Trade-off:** No WebGL shader effects on video, but reliable playback.

### 2. PO Token Provider (In Progress)

PO (Proof of Origin) tokens prove requests come from legitimate clients.

**Architecture:**

```
YouTube API Service → PO Token Provider → yt-dlp → YouTube
       (Go)              (Node.js)
```

**Services deployed:**

- `club-mutant-pot-provider` - Generates PO tokens
- `club-mutant-youtube-api` - Has yt-dlp with plugin installed

**Issue:** The `bgutil-ytdlp-pot-provider` plugin is pip-installed but yt-dlp isn't loading it. May need manual plugin directory setup.

**To debug:**

```bash
fly ssh console -a club-mutant-youtube-api
yt-dlp --verbose https://www.youtube.com/watch?v=dQw4w9WgXcQ 2>&1 | grep -i plugin
```

### 3. Cloudflare WARP (Not Implemented)

Routes traffic through Cloudflare's IPs which YouTube doesn't block.

**Setup (for VPS):**

```bash
# Install WARP CLI
curl -fsSL https://pkg.cloudflarewarp.com/cloudflare-warp-ascii.repo | sudo tee /etc/yum.repos.d/cloudflare-warp.repo
sudo yum install cloudflare-warp

# Register and connect
warp-cli register
warp-cli connect
```

For Docker/Fly.io, need to use [warproxy](https://github.com/kingcc/warproxy) container.

### 4. Residential Proxy (Expensive)

Use a residential proxy service for YouTube requests.

| Service     | Cost    |
| ----------- | ------- |
| Bright Data | ~$15/GB |
| IPRoyal     | ~$7/GB  |

### 5. Home Server / VPS with Clean IP

Host on residential IP (home server) or find a VPS provider with less-flagged IPs.

## Technical Details

### Why Datacenter IPs Are Blocked

1. **Bot detection** - YouTube uses BotGuard to verify clients
2. **PO Tokens** - Required proof that request is from legitimate app
3. **IP reputation** - Datacenter IPs are flagged for abuse

### What yt-dlp Does

1. Impersonates different YouTube clients (Android, iOS, TV, Web)
2. Can use PO token plugins for attestation
3. Actively maintained to handle YouTube changes

### What the Go Library Does

- Uses `kkdai/youtube` which calls YouTube's Innertube API
- Doesn't support PO tokens natively
- Works from residential IPs, often blocked from datacenters

## Files Modified

- `client/src/scenes/Game.ts` - `BACKGROUND_VIDEO_RENDERER` setting
- `services/youtube-api/main.go` - yt-dlp fallback function
- `services/youtube-api/Dockerfile` - Added yt-dlp + plugin
- `services/pot-provider/` - PO token provider service
- `server/youtubeResolver.ts` - PO token provider URL config

## Next Steps

1. Fix yt-dlp plugin loading in container
2. Or: Set up Cloudflare WARP proxy
3. Or: Keep using iframe mode (works reliably)
