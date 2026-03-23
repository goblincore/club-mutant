# Dream Video Dreamscape — Planning Doc

## Concept

Replace the current dream feature (a separate Phaser 2D app loaded in an iframe) with a music-connected visual experience. When a player sleeps on the futon in My Room, instead of launching a 2D mini-game, the dream pulls random cached music videos from the youtube-api service's in-memory LRU cache and plays them overlaid and warped on top of each other in a psychedelic, dreamy way.

The vibe: layered music videos dissolving into each other through kaleidoscope filters, hue shifts, and audio-reactive distortion. Like falling asleep at a VJ show.

---

## Current State (what we're working with)

### Dream feature

- **Trigger**: Futon interaction in My Room (`JapaneseRoom.tsx`) → `isDreaming = true` → `DreamIframe.tsx` mounts
- **Current implementation**: Loads `client-dream/` (standalone Phaser 2D app) in an iframe
- **Communication**: PostMessage bridge between client-3d and client-dream
- **NPCs**: Dream NPC conversations via `dream-npc-go` Go service (The Watcher, etc.)
- **Server state**: `DREAM_SLEEP` / `DREAM_WAKE` messages, `player.isDreaming` flag

### Video cache system

- **Service**: `services/youtube-api/main.go` — Go service on port 8081
- **Cache type**: In-memory LRU with `sync.RWMutex`
- **Default size**: 100 MB (dev), **1000 MB** (production via `VIDEO_CACHE_SIZE_MB`)
- **Per-entry cap**: Videos > 10 MB are NOT cached (streamed only)
- **Entry format**: `data []byte` — complete video file bytes stored in memory
- **Cache key**: `{videoId}:video` or `{videoId}:audio`
- **TTL**: Based on YouTube URL expiry (~6 hours), with 5-minute safety buffer
- **Eviction**: LRU — least-recently-used entries removed when cache is full
- **Cleanup**: Background goroutine every 1 minute removes expired entries
- **Video quality**: 144p–360p, video-only (no audio track)
- **Average entry size**: ~350 KB → ~2800 videos fit in 1GB production cache
- **Request coalescing**: Singleflight pattern prevents duplicate yt-dlp calls

### Existing video playback in client-3d

- **`useVideoBackground.ts`**: `HTMLVideoElement` → `THREE.VideoTexture` pipeline
- **`AudioReactiveVideoMaterial.tsx`**: GLSL shader with chromatic aberration, scanlines, saturation — driven by `uBass`, `uMid`, `uHigh`, `uEnergy` uniforms
- **`useAudioAnalyser.ts`**: Module-level exports (`audioBass`, `audioMid`, `audioHigh`, `audioEnergy`) available globally
- **Proxy endpoint**: `GET /proxy/{videoId}?videoOnly=true` — serves cached bytes instantly or streams from YouTube

### Dream NPC service

- **Service**: `services/dream-npc-go/` — Fiber HTTP framework on port 4000
- **Endpoints**: `/dream/npc-chat`, `/bartender/npc-chat`, `/health`
- **NPC personalities**: Defined in `client-dream/src/npc/npcPersonalities.ts`

---

## Design Decisions

### D1: Audio-reactive dream visuals

Dream visuals pulse and warp with whatever music is playing in the room. Reuses the existing audio analysis pipeline (`useAudioAnalyser.ts` module-level exports). Bass drives warp amplitude, mids drive hue shift speed, highs drive grain/noise, energy drives brightness pulse. If no music is playing, the dream defaults to slow ambient distortion.

### D2: NPC chat preserved as overlay

Keep the dream NPC conversations (The Watcher, etc.) but ditch the Phaser 2D world. Render a lightweight text chat overlay floating on top of the video dreamscape. Communicates directly with `dream-npc-go` via HTTP (no PostMessage bridge needed since it's all in client-3d now).

### D3: Generative shader fallback

When the video cache is empty (no one has played music yet), render pure generative shader visuals — fractal noise fields, slow color cycling, audio-reactive distortion. The dream always works, even with no cached content.

### D4: Bump per-video cache limit to 15MB

The current 10 MB per-entry cap works for most 3-5 minute videos at 144p-360p, but slightly longer ones (5-7 min) fall through. Bumping to 15 MB catches these without meaningfully impacting total cache capacity (worst case: ~68 max-size entries in 1GB vs ~100 at 10MB — still plenty).

### D5: Plain HTML admin interface

Simple admin UI for cache management, embedded directly in the youtube-api Go binary via `//go:embed`. Plain HTML + vanilla JS, no build step, no dependencies. Token-based auth via `ADMIN_TOKEN` env var for testing.

### D6: Infrastructure reuse

| Component | Reuse |
|-----------|-------|
| Video proxy endpoint | Same `/proxy/{videoId}` — already serves cached bytes |
| `THREE.VideoTexture` | Same pattern from `useVideoBackground.ts` |
| Audio analysis | Same module-level exports from `useAudioAnalyser.ts` |
| Dream trigger | Same futon interaction → `isDreaming` state |
| Server messages | Same `DREAM_SLEEP` / `DREAM_WAKE` |
| WakePrompt | Same UI for exiting the dream |
| dream-npc-go service | Same NPC chat service, just called via HTTP instead of PostMessage |

---

## Implementation Plan

### Phase 1: Cache Infrastructure

#### 1a. Bump per-video cache limit

**File:** `services/youtube-api/main.go`

Change the max cacheable video size constant from 10 MB to 15 MB.

#### 1b. New API endpoint — `GET /cache/list`

**File:** `services/youtube-api/main.go`

Add a handler that returns currently cached video-only entry IDs:

```
GET /cache/list?limit=6&random=true
Response: { "videoIds": ["dQw4w9WgXcQ", "abc123", ...], "total": 142 }
```

- Filter to video-only entries (keys ending in `:video`)
- If `random=true`, shuffle before slicing to `limit`
- Return `total` count so the client knows if cache has content

### Phase 2: Dream Video Scene

**New file:** `client-3d/src/ui/DreamScene.tsx`

Fullscreen R3F component that replaces `DreamIframe.tsx` when `isDreaming === true`:

- On mount: fetch `/cache/list?limit=6&random=true` from youtube-api
- If videos available → load 2-3 simultaneously as `HTMLVideoElement` → `THREE.VideoTexture`
- If cache empty → skip to generative shader mode (Phase 4)
- Render stacked fullscreen `<mesh>` planes, each with its own video + dream shader
- Cycle: every 20-30s, fade out oldest layer, load a new random video from the fetched list
- Periodically re-fetch `/cache/list` (every 60s) for fresh video IDs
- On unmount: dispose all video elements and textures properly

### Phase 3: Dream Shader

**New file:** `client-3d/src/shaders/DreamMaterial.tsx`

Custom `shaderMaterial` for the dreamy overlay effect. Each video layer gets this shader with different parameter offsets.

**Vertex shader:** Standard UV pass-through with optional wave displacement.

**Fragment shader effects:**

- **UV warp**: Slow sine-wave distortion (frequency/amplitude driven by `uTime`)
- **Kaleidoscope**: Optional mirror/fold effect on UV space
- **Hue rotation**: Slow continuous hue shift per layer (each layer offset differently)
- **Blend opacity**: Per-layer alpha for crossfading, plus additive/screen blend between layers
- **Audio reactivity**: `uBass` drives warp amplitude, `uMid` drives hue shift speed, `uHigh` drives grain/noise intensity, `uEnergy` drives overall brightness pulse
- **Vignette + film grain**: Atmosphere
- **Crossfade uniform**: `uFade` (0→1) for smooth layer transitions

### Phase 4: Generative Shader Fallback

**New file:** `client-3d/src/shaders/DreamGenerativeMaterial.tsx`

When no videos are cached, render a single fullscreen plane with a purely generative shader:

- Fractal Perlin noise fields
- Slow color cycling through dreamlike palettes
- Audio-reactive distortion (same uniforms as video shader)
- This becomes the "ambient dream" when the server has no video content

### Phase 5: Dream NPC Chat Overlay

**New file:** `client-3d/src/ui/DreamChatOverlay.tsx`

Lightweight chat panel overlaid on the dream visuals:

- Direct HTTP calls to dream-npc-go service (`/dream/npc-chat` endpoint)
- Import/duplicate NPC personality data from `client-dream/src/npc/npcPersonalities.ts`
- Simple text input + message bubbles, semi-transparent background
- On dream entry, auto-trigger a greeting from The Watcher (or randomly selected dream NPC)
- No Phaser, no sprite world — just text conversation floating over the dreamscape

### Phase 6: Wire Up Dream Trigger

**Modify:** `client-3d/src/ui/DreamIframe.tsx` (or parent component)

- When `isDreaming === true`: render `<DreamScene />` + `<DreamChatOverlay />` instead of the iframe
- Keep the WakePrompt — user clicks to exit, same flow as before
- Keep server `DREAM_SLEEP` / `DREAM_WAKE` messages for multiplayer state (`player.isDreaming`)
- Remove iframe PostMessage bridge (no longer needed)

### Phase 7: Admin API Endpoints

**File:** `services/youtube-api/main.go`

Add endpoints under `/admin` prefix:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /admin/cache` | GET | List all cached entries with metadata (videoId, size, expiresAt, type) |
| `DELETE /admin/cache/{key}` | DELETE | Remove a specific entry from cache |
| `POST /admin/cache/add` | POST | Add a video by YouTube URL/ID (triggers prefetch + cache) |
| `POST /admin/cache/clear` | POST | Clear entire cache |

Auth: Simple middleware checking `Authorization: Bearer <ADMIN_TOKEN>` header against `ADMIN_TOKEN` env var.

### Phase 8: Admin Web UI

**New directory:** `services/youtube-api/admin/` (static HTML/JS/CSS)

Serve via Go's `//go:embed`. Single-page app:

- **Login screen**: Password input → stored as bearer token in sessionStorage
- **Cache list view**: Table showing videoId, size (KB), expires in, type (video/audio). Auto-refreshes.
- **Preview**: Click a row → inline `<video>` player loading from `/proxy/{videoId}` (already exists)
- **Delete**: Button per row, confirm dialog
- **Add video**: Input field for YouTube URL/ID → POST to `/admin/cache/add`
- **Stats bar**: Total cached count, total size, cache capacity

Tech: Plain HTML + vanilla JS + minimal CSS. No build step, no dependencies. Embedded in the Go binary.

### Phase 9: Wire Admin Route

**File:** `services/youtube-api/main.go`

- `GET /admin` → serve the static admin UI
- Add `ADMIN_TOKEN` env var to docker-compose configs (dev + production)
- Add CORS for admin if accessed from different origin

---

## Browser Constraints (all manageable)

- **Simultaneous videos**: 2-3 of Chrome's ~6-16 `<video>` element limit. Safe.
- **GPU memory**: At 360p (640x360), each video texture is ~900KB VRAM. 3 videos = ~2.7MB. Fine.
- **Video TTL**: YouTube URLs expire in ~6hrs. Dream sessions last minutes. Fine.
- **Mobile**: Detect and reduce to 1-2 layers with simpler shaders.

---

## Technical Notes

### Dream shader approach (fragment shader sketch)

```glsl
uniform sampler2D uVideoTex;
uniform float uTime;
uniform float uFade;        // 0→1 crossfade
uniform float uHueOffset;   // per-layer offset
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uEnergy;

varying vec2 vUv;

vec3 hueShift(vec3 color, float shift) {
  // RGB → HSV → shift H → HSV → RGB
  ...
}

vec2 warpUV(vec2 uv, float time, float bassIntensity) {
  float warpAmp = 0.03 + bassIntensity * 0.05;
  float warpFreq = 2.0;
  uv.x += sin(uv.y * warpFreq + time * 0.3) * warpAmp;
  uv.y += cos(uv.x * warpFreq + time * 0.2) * warpAmp;
  return uv;
}

vec2 kaleidoscope(vec2 uv, float folds) {
  vec2 centered = uv - 0.5;
  float angle = atan(centered.y, centered.x);
  float radius = length(centered);
  float segment = 3.14159 * 2.0 / folds;
  angle = mod(angle, segment);
  angle = abs(angle - segment * 0.5);
  return vec2(cos(angle), sin(angle)) * radius + 0.5;
}

void main() {
  vec2 uv = warpUV(vUv, uTime, uBass);

  // Optional kaleidoscope (toggle per layer)
  // uv = kaleidoscope(uv, 6.0);

  vec4 video = texture2D(uVideoTex, uv);

  // Hue rotation (slow drift + audio mid influence)
  float hue = uHueOffset + uTime * 0.05 + uMid * 0.3;
  video.rgb = hueShift(video.rgb, hue);

  // Energy brightness pulse
  video.rgb *= 0.8 + uEnergy * 0.4;

  // Film grain (driven by highs)
  float grain = (fract(sin(dot(vUv + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
  video.rgb += grain * uHigh * 0.1;

  // Vignette
  float vignette = 1.0 - smoothstep(0.3, 0.9, length(vUv - 0.5));
  video.rgb *= vignette;

  // Crossfade alpha
  video.a = uFade;

  gl_FragColor = video;
}
```

### Video lifecycle management

```
Mount DreamScene
  └→ fetch /cache/list?limit=6&random=true
  └→ if total > 0:
       load videos[0..2] as HTMLVideoElement
       create THREE.VideoTexture per element
       render 3 stacked planes with DreamMaterial
       every 20-30s:
         fade out oldest layer (uFade 1→0)
         replace with next video from list
         fade in (uFade 0→1)
       every 60s:
         re-fetch /cache/list for fresh IDs
     else:
       render single plane with DreamGenerativeMaterial

Unmount
  └→ pause all videos
  └→ dispose all textures
  └→ remove all video elements
```

### Per-layer parameter offsets

Each of the 2-3 video layers gets different shader parameters to create visual separation:

```typescript
const LAYER_CONFIGS = [
  { hueOffset: 0.0, warpSpeed: 0.3, blendMode: 'normal', opacity: 1.0 },
  { hueOffset: 0.33, warpSpeed: 0.2, blendMode: 'additive', opacity: 0.6 },
  { hueOffset: 0.66, warpSpeed: 0.15, blendMode: 'screen', opacity: 0.4 },
]
```

### Constants (starting point, tune to taste)

```typescript
const MAX_VIDEO_LAYERS = 3
const VIDEO_CYCLE_INTERVAL = 25_000   // ms — swap out a layer
const CROSSFADE_DURATION = 3_000       // ms — fade transition time
const CACHE_REFRESH_INTERVAL = 60_000  // ms — re-fetch /cache/list
const WARP_BASE_AMPLITUDE = 0.03       // UV distortion at rest
const WARP_AUDIO_SCALE = 0.05          // additional distortion from bass
const HUE_DRIFT_SPEED = 0.05           // radians/sec base hue rotation
```

---

## What Gets Lost

The current dream has NPCs with sprites, 2D worlds, collectibles, and a full Phaser game loop. This redesign is a complete conceptual pivot — from "explore a 2D dream world" to "immersive music video dreamscape." The Phaser app and its world/collectible systems would no longer be used for this feature (NPC chat is preserved as an overlay). The `client-dream/` directory could be archived or repurposed.

---

## File Change Map

| Action | File |
|--------|------|
| **Modify** | `services/youtube-api/main.go` — bump 10MB→15MB, add `/cache/list` endpoint, admin endpoints, auth middleware, static file serving |
| **Create** | `services/youtube-api/admin/index.html` — admin SPA (plain HTML/JS) |
| **Create** | `client-3d/src/ui/DreamScene.tsx` — fullscreen video dreamscape component |
| **Create** | `client-3d/src/shaders/DreamMaterial.tsx` — dream video shader |
| **Create** | `client-3d/src/shaders/DreamGenerativeMaterial.tsx` — generative fallback shader |
| **Create** | `client-3d/src/ui/DreamChatOverlay.tsx` — NPC chat overlay |
| **Modify** | `client-3d/src/ui/DreamIframe.tsx` — swap iframe for DreamScene |
| **Modify** | `services/youtube-api/docker-compose.yml` — add `ADMIN_TOKEN` env var |
| **Modify** | `deploy/hetzner/docker-compose.yml` — add `ADMIN_TOKEN` env var |
| **Reference** | `client-3d/src/shaders/AudioReactiveVideoMaterial.tsx` — reuse shader patterns |
| **Reference** | `client-3d/src/hooks/useVideoBackground.ts` — reuse video loading pattern |
| **Reference** | `client-3d/src/hooks/useAudioAnalyser.ts` — reuse audio data exports |
| **Reference** | `client-dream/src/npc/npcPersonalities.ts` — NPC personality data |

---

## Verification

### Dream feature

1. Start youtube-api service, play some music to populate cache
2. Enter My Room, interact with futon, confirm dream loads video dreamscape (not Phaser iframe)
3. Verify 2-3 video layers render with warp/blend effects
4. Verify audio reactivity works when music is playing in room
5. Test empty cache → confirm generative shader fallback renders
6. Test NPC chat overlay — send messages, receive responses from dream-npc-go
7. Test wake up flow — WakePrompt appears, exiting returns to My Room
8. Test video cycling — videos swap smoothly every 20-30s

### Admin interface

9. Navigate to `http://localhost:8081/admin` → see login screen
10. Enter wrong password → rejected. Enter correct password → see cache dashboard.
11. Add a video by YouTube URL → appears in list after caching
12. Click a video row → preview plays inline
13. Delete a video → removed from list and cache
14. Verify stats bar shows correct totals

---

## Open Questions

- **Layer count**: 2-3 feels right for overlap depth. More = more psychedelic but heavier on GPU. Test on target hardware.
- **Kaleidoscope toggle**: Always on, or cycle between warp modes (straight warp → kaleidoscope → mirror)?
- **Dream duration limit**: Should dreams auto-end after X minutes, or let the player sleep indefinitely?
- **Curated vs random**: Always random from cache, or weight toward videos from the current room's recently-played tracks?
- **Audio source in dream**: Use the room's current music stream, or play a separate ambient audio track during dreaming?
