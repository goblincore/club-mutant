# client-3d: PSX-Style 3D Multiplayer Client

## Overview

A new client that replaces the existing Phaser 2D top-down view with a **3D PSX-style renderer** using Three.js / react-three-fiber. Same multiplayer concept as club-mutant: players in a room together, chatting, listening to music via synced YouTube playlists.

Characters are **paper-doll rigs** exported from the rig editor (`tools/paper-rig-editor/`): flat textured quads on a bone hierarchy, animated with preset clips, rendered with PSX post-processing (vertex snapping, dithering, color reduction).

## Architecture

### Reuse from existing repo

| Component                  | Reuse strategy                                                  |
| -------------------------- | --------------------------------------------------------------- |
| **Colyseus server**        | Connect to the same server — no server changes needed           |
| **@club-mutant/types**     | Import via pnpm workspace (Messages, IOfficeState, Dtos, Rooms) |
| **YouTube search/resolve** | Same server endpoints (`/youtube/*`)                            |
| **Room system**            | Join PUBLIC / CUSTOM rooms with same protocol                   |

### New in client-3d

| Component            | Tech                                                              |
| -------------------- | ----------------------------------------------------------------- |
| **3D renderer**      | Three.js via `@react-three/fiber` + `@react-three/drei`           |
| **PSX shaders**      | Ported from rig editor (`PsxMaterial.ts`)                         |
| **Character system** | Load JSON manifests + PNGs, build bone hierarchy, play animations |
| **State management** | Zustand (replaces Redux from old client)                          |
| **UI overlays**      | React + TailwindCSS (chat, playlist, DJ queue)                    |
| **Networking**       | `@colyseus/sdk` — same protocol, cleaner implementation           |

### Key difference from old client

The old client uses Phaser (2D tile-based) with React overlays for UI. The new client is **pure React + r3f** — the 3D scene is a React component tree, no separate game engine. This means:

- No Phaser event bus — use Zustand stores directly
- No sprite sheets — paper-doll PNGs on 3D planes
- Camera: isometric or 3/4 view (adjustable) instead of top-down
- Player position: 3D world coords (x, z ground plane, y up) mapped to server's 2D (x, y)

## Project structure

```
client-3d/
├── public/
│   ├── characters/         # Exported character manifests + PNGs
│   │   ├── parappa/
│   │   │   ├── manifest.json
│   │   │   ├── body.png
│   │   │   ├── head.png
│   │   │   └── ...
│   │   └── default/
│   ├── rooms/              # Room layout data (later)
│   └── index.html
├── src/
│   ├── main.tsx            # Entry point
│   ├── App.tsx             # Root: lobby → room flow
│   ├── network/
│   │   ├── NetworkManager.ts   # Colyseus client, room join/leave
│   │   └── useNetwork.ts      # React hook for network state
│   ├── stores/
│   │   ├── gameStore.ts        # Players, local player, room state
│   │   ├── chatStore.ts        # Chat messages
│   │   ├── musicStore.ts       # Music stream, playlist, DJ queue
│   │   └── uiStore.ts          # UI panel visibility, settings
│   ├── scene/
│   │   ├── GameScene.tsx        # Main r3f Canvas + scene setup
│   │   ├── Room.tsx             # Ground plane, walls, furniture
│   │   ├── PlayerEntity.tsx     # Single player: character + nametag + chat bubble
│   │   ├── MusicBooth.tsx       # 3D music booth object
│   │   └── Camera.tsx           # Isometric / follow camera
│   ├── character/
│   │   ├── CharacterLoader.ts   # Load manifest JSON + textures
│   │   ├── PaperDoll.tsx        # r3f component: bone hierarchy + animation
│   │   └── AnimationMixer.ts    # Keyframe interpolation (from rig editor)
│   ├── shaders/
│   │   ├── PsxMaterial.ts       # PSX vertex snap + dithering + color reduction
│   │   └── PsxPostProcess.tsx   # Full-screen PSX post-processing pass
│   ├── ui/
│   │   ├── ChatPanel.tsx
│   │   ├── PlaylistPanel.tsx
│   │   ├── DJQueuePanel.tsx
│   │   ├── NowPlaying.tsx
│   │   ├── YouTubePlayer.tsx
│   │   ├── LobbyScreen.tsx      # Room selection / create
│   │   └── Toolbar.tsx          # Settings, PSX toggle, etc.
│   ├── input/
│   │   └── usePlayerInput.ts    # WASD / click-to-move
│   └── index.css
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

## Player position mapping

Server uses 2D coords `(x, y)` for player position. The 3D client maps:

- Server `x` → Three.js `x` (horizontal)
- Server `y` → Three.js `-z` (depth, negative because Three.js Z points toward camera)
- Three.js `y` = 0 (ground plane)

Movement: WASD sends position updates to server. Server broadcasts to all clients. Each client renders other players at their synced positions.

## Character system

1. **Load**: Fetch `manifest.json` → get part list, hierarchy, animations
2. **Build**: Create `THREE.Group` tree matching bone hierarchy, textured `PlaneGeometry` per part
3. **Animate**: Apply keyframe tracks from manifest (same system as rig editor's `CharacterRenderer`)
4. **Render**: PSX material for the retro look, billboard-optional (parts always face camera or fixed orientation)

Characters face the direction they're moving (left/right flip via scale.x = -1).

## PSX rendering pipeline

1. **Per-object**: `PsxMaterial` on character quads (vertex snapping, affine texture warp)
2. **Post-process**: Full-screen pass for dithering, color reduction, optional scanlines
3. **Resolution**: Render at reduced internal resolution (e.g., 320×240) then upscale with nearest-neighbor

## Milestones

### M1: Walking around (MVP) ✅ Complete

- [x] Project scaffold (Vite + React + r3f + TailwindCSS + Zustand + @colyseus/sdk)
- [x] Added to pnpm workspace, imports @club-mutant/types
- [x] Colyseus connection with correct `getStateCallbacks` pattern
- [x] 3D room with ground plane, grid, walls (yellow floor, red-orange walls)
- [x] Paper-doll character rendering from rig editor export (manifest.json + PNGs)
- [x] WASD movement synced via server
- [x] Click-to-move (raycast ground plane, walk to click point)
- [x] Other players visible + moving (smooth lerp interpolation)
- [x] Nametags (Html overlay from drei)
- [x] Chat panel (bottom-left overlay)
- [x] Lobby screen (name input + join)

### M1.5: Camera + Feel ✅ Complete

- [x] Orbit camera: hold-drag to rotate, scroll to zoom (spherical coords)
- [x] Idle camera sway (±15° slow oscillation when not interacting)
- [x] Camera-to-player occlusion: walls fade out when blocking view
- [x] PaRappa-style vertex distortion on characters (twist, lean, squash-stretch, wobble, bounce)
- [x] Smooth movement interpolation (exponential lerp, no snapping)
- [x] Stable walk/idle animation (grace period prevents flicker)

### M2: Chat + Music ✅ Complete

- [x] Chat panel moved to right side (full-height, matching 2D client style)
- [x] In-world chat bubbles (Html overlay above players, auto-clear after 5s)
- [x] YouTube audio player (hidden ReactPlayer, late-join seek sync)
- [x] Now-playing mini bar (top-left, spinning disc, DJ name, track title)
- [x] Music stream wiring (START_MUSIC_STREAM, STOP_MUSIC_STREAM, late-join state sync)
- [x] Debug logging cleaned up from CharacterLoader + NetworkManager

### M2.5: DJ Booth + Playlist + Video Background ✅ Complete

- [x] Playlist panel (left side) with YouTube search, link paste, queue management
- [x] DJ booth placeholder (geometric desk + turntables + speakers + mixer)
- [x] DJ booth interaction: press R near booth → connect + join queue + open playlist
- [x] DJ queue wiring (DJ_QUEUE_UPDATED, ROOM_QUEUE_PLAYLIST_UPDATED messages)
- [x] DJ controls: play, stop, skip turn, leave queue
- [x] Per-player queue playlist with add/remove tracks
- [x] YouTube video background toggle (fullscreen behind 3D scene, pointer-events: none)
- [x] Bottom toolbar with playlist/chat/PSX toggle buttons
- [x] Booth store (boothStore.ts): booth connection, DJ queue, queue playlist, video background

### M3: Polish (in progress)

- [x] VHS + PSX post-processing pass (bloom, chroma bleed, brightness lift, film grain, ¾-res render)
  - Ported from 2D client's `VhsPostFxPipeline.ts`, rewritten for Three.js
  - Toggle button in bottom toolbar ("VHS on/off")
- [x] DJ booth interaction: double-click booth mesh → confirmation popup → teleport behind booth + join queue
  - Replaced R-key interaction with proximity-based double-click
  - `BoothPrompt.tsx` confirmation modal
- [x] Character select screen in lobby (username + character picker grid)
  - Two characters: PaRappa (default), Ramona (default2) + coming-soon placeholder
  - `selectedCharacterPath` in gameStore, used by GameScene for local player
- [x] Auto-scale characters to consistent height via `computeCharacterScale` in PaperDoll
- [x] Renderer resolution cap at 540p (`MAX_HEIGHT` dpr calculation in GameScene)
- [x] Fisheye barrel distortion in VHS shader (`BARREL_STRENGTH = 0.5`)
- [x] TV static floor shader (animated noise when no video playing, ported from 2D client)
- [x] Skybox — Windows 95-style blue sky with procedural fluffy clouds (FBM noise, drifting)
- [x] 3D chat bubbles — native Three.js geometry (troika text + rounded-rect bg + tail)
  - Replaces HTML overlay `<Html>` for consistent look
  - Layer-based rendering: layer 0 (scene + VHS), layer 1 (UI bubbles, rendered clean)
  - Smart positioning (above head vs beside head based on character height)
  - Distance scaling, pop-in/fade-out animations, bubble stacking
- [x] PaperDoll layout metrics — `headTopY`, `visualTopY` for smart bubble/nametag positioning
- [x] Nametags moved below character (smaller, subtler)
- [ ] Textured DJ booth (custom texture via `useTexture` from drei)
- [ ] Room furniture / decoration
- [ ] Sound effects
- [ ] Mobile touch controls

## Resolved questions

- **Camera style**: Player-controlled orbit camera with idle sway. Hold-drag to rotate, scroll to zoom. Spherical coordinates with configurable polar/azimuth/distance.
- **Room layout**: Hardcoded flat room with 4 walls. Walls auto-fade when occluding camera-to-player ray.
- **Character facing**: Direction-based left/right flip via `scale.x = -1`, computed from visual velocity.

## Learnings & gotchas (Feb 2026)

### Colyseus 0.17 `getStateCallbacks` pattern

The correct pattern for listening to state changes in client-3d:

```typescript
const $ = getStateCallbacks(this.room)
const stateProxy = $(this.room.state) as any
const playersProxy = stateProxy.players
playersProxy.onAdd((player, sessionId) => {
  const playerProxy = $(player) as any
  playerProxy.listen('x', (value) => { ... })
}, true) // true = trigger for existing items
```

- Must wrap `this.room.state` first, then access `.players` on the proxy
- `CollectionCallback` and `CallbackProxy` types are NOT exported from `@colyseus/schema` in this version — use `any` casts
- The `true` flag on `onAdd` is critical for processing players already in the room when you join

### Character texture loading

- Texture filenames in `manifest.json` must exactly match files on disk
- `loadCharacter()` is resilient — skips individual failed textures instead of failing everything
- Cache is cleared on each load during dev to avoid stale failed promises

### Movement & animation stability

- Local player uses fast exponential lerp (`1 - e^(-18*dt)`) instead of snap for smooth movement
- `isMoving` must be computed from visual velocity inside `useFrame`, not from store prop deltas (which cause flicker)
- A 150ms grace period prevents walk↔idle animation toggling during deceleration
- Animation name is stored in `useState` — only changes when truly needed to avoid PaperDoll's `useEffect` resetting the clock

### Vertex distortion shader

- Uses `onBeforeCompile` to patch MeshBasicMaterial's vertex shader
- Geometry needs subdivisions (8×8) for smooth warping
- Speed/velocity uniforms are smoothed with exponential filtering to avoid jitter
- Y bounds per geometry are set via `setDistortBounds()` for proper height normalization

### Camera occlusion

- Raycast from camera to player each frame; any wall intersection closer than the player fades that wall
- Opacity is smoothly lerped (not snapped) for natural transitions
- Wall materials need `transparent: true` set on ref callback

### Click-to-move vs camera drag

- Both use left mouse — differentiated by drag threshold (5px)
- `wasCameraDrag` is exported from Camera and checked in ClickPlane
- WASD input cancels any active click-to-move target

### In-world chat bubbles (3D geometry + layer rendering)

- Per-player bubble array in `chatStore.bubbles` (Map<sessionId, ChatBubble[]>) with auto-clear timers
- Rendered as native Three.js geometry (not HTML overlays) for consistent PSX aesthetic:
  - `Text` from drei (troika) for text, `ShapeGeometry` rounded-rect background, triangular tail
  - Pop-in/shrink-out animations, multiple bubbles stack vertically
- Smart positioning: above head for short characters, beside head for tall characters (flips left/right based on screen position)
- Distance-based scaling so bubbles stay readable at all zoom levels
- **Layer 1 rendering**: all bubble meshes on Three.js layer 1, rendered clean (no VHS post-processing)
- `PsxPostProcess` renders layer 0 with VHS, then layer 1 clean — camera enables both layers for non-VHS mode
- Nametags moved below character (`y = -0.15`), smaller text

### DJ booth interaction

- Booth moved 2.5 world units from back wall; position exported as `BOOTH_WORLD_X/Z` from `Room.tsx`
- Double-click on booth mesh (within 1.8 world units) → `BoothPrompt` confirmation popup → teleport behind booth + join queue + open playlist
- Spawn position fix: `NetworkManager` syncs `localX/localY` to server position on `onAdd` so players spawn inside the room
- Booth state in `boothStore.ts`: `isConnected`, `boothIndex`, `djQueue[]`, `currentDjSessionId`, `isInQueue`, `queuePlaylist[]`, `videoBackgroundEnabled`

### YouTube integration

- `react-player` added as dependency; uses `react-player/youtube` import for smaller bundle
- Hidden ReactPlayer for audio-only; fullscreen `z-[-1]` + `pointer-events: none` for video background mode
- Late-join seek: `useEffect` on `[currentLink, startTime, isPlaying]` computes offset and calls `seekTo`
- Video background is local-only state (not synced to server yet — would need `SET_VIDEO_BACKGROUND` message)

### Server HTTP URL for YouTube search

- `NetworkManager` stores `httpBaseUrl` computed from the WebSocket URL (`ws→http` replace)
- YouTube search: `GET {httpBaseUrl}/youtube/{query}` — server proxies to Go youtube-api service
- Search results have inconsistent field casing from Go service (`Title` vs `title`) — mapped in PlaylistPanel

### UI layout (M2.5)

- Chat: right side, full height, `bg-black/[0.35] backdrop-blur-md border-l border-white/[0.25]`
- Playlist: left side, same style, with DJ queue status bar + search + link paste + queue list + results
- Now-playing: top-left, compact bar with spinning disc, DJ name, title, video toggle button
- Bottom toolbar: centered, playlist/chat/PSX toggle buttons
