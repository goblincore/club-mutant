# Club Mutant (SkyOffice fork) — Project Context

This file is a high-signal, “get back up to speed fast” reference for the `goblincore/club-mutant` codebase.

## What this project is

-
- A multiplayer 2D top-down Phaser game (client) with a Colyseus authoritative server that is about playing and listening to music together in the form of playlists and 'dj' sessions. Kind of like turntable.fm (now defunct).
- React/Redux overlays provide UI (playlist, YouTube player, chat UI, etc.).
- Real-time player state sync is done via Colyseus Schema (`OfficeState`) + `player.onChange` events.

## Repo layout

- `client/`
  - Has its own `package.json` and `node_modules`
  - Phaser game code: `client/src/scenes`, `client/src/characters`, `client/src/items`
  - React UI: `client/src/components`
  - Redux stores: `client/src/stores`
  - Client networking: `client/src/services/Network.ts`
  - Assets: `client/public/assets`
- `client-3d/` **(new — Feb 2026)**
  - PSX-style 3D multiplayer client replacing Phaser 2D. Same server, same protocol.
  - Tech: Vite + React + r3f + drei + TailwindCSS + Zustand + @colyseus/sdk + react-player
  - Dev server: port 5175 (`cd client-3d && pnpm dev`)
  - Characters: paper-doll rigs (flat textured planes on bone hierarchy) from rig editor export
  - Key dirs:
    - `src/scene/` — Room (walls + DJ booth + wall occlusion with `depthWrite` fix for attachments), **JukeboxRoom** (vintage 50s diner with checkerboard floor, burgundy walls, stage + mic stand; see **Jukebox Room** below), **JapaneseRoom** (cozy nighttime bedroom; see **MyRoom** below), Camera (orbit + sway + **follow lerp delay** `FOLLOW_LERP=4` for trailing camera feel, exports `cameraDistance` + `cameraAzimuth` for fisheye scaling + camera-relative WASD), PlayerEntity (lerp + 3D chat bubbles + troika Text nametags on layer 1), GameScene (Canvas + ClickPlane + debug keyboard shortcuts: `` ` `` for FPS, `-`/`=` for render scale cycle), InteractableObject (proximity + hover highlight + cursor + click; see **Interactable object outline** below), **GLBModel** (reusable GLB loader component via drei's `useGLTF`, clones scene per instance, supports preload; see **GLB model pipeline** below)
    - `src/character/` — PaperDoll (bone hierarchy rendering + **group-level lean** + per-bone distortion info; see **Character Distortion System** below), CharacterLoader (manifest loading + `distortion`/`distortionOverrides` support), DistortMaterial (PaRappa vertex warp: squash-stretch, twist, wobble, bounce, billboard twist + clip-space vertex fisheye via `uVertexFisheye`; lean moved to group transforms — see **Character Distortion System**), AnimationMixer, **characterRegistry** (auto-discovers characters by probing `default`..`default20` folders at startup, parallel fetch, singleton cache, preloads all, `characterPathForTextureId()` for sync lookup by remote players)
    - `src/network/` — NetworkManager (Colyseus client, player/chat/music/DJ queue wiring, YouTube search, late-join sync for music + DJ queue from **schema-only callbacks** — `onAdd`/`onRemove`/`listen`, no separate `DJ_QUEUE_UPDATED` message handler; **reconnection**: `room.onDrop` → status `'reconnecting'`, `room.onReconnect` → status `'connected'` + TimeSync restart, `room.onLeave` → status `'disconnected'`; reconnection config: `maxRetries=10`, `maxDelay=8000`), TimeSync (client-server clock sync with `onReady` callback for deferred operations)
    - `src/stores/` — gameStore (+ `connectionStatus`: `'disconnected'` | `'connected'` | `'reconnecting'`, `selectedCharacterPath`, `lobbyJoined`, `availableRooms`, `roomType`, `musicMode`), chatStore (+ bubbles), musicStore, uiStore (+ debug: `showFps`, `renderScale` [0.75/0.5/0.35], `fisheyeOverride`, `vertexFisheye`, `vortexOob`; + RightPanel states, `computerIframeOpen`, `magazineReaderOpen`), boothStore (DJ booth + queue + video bg, `videoBackgroundEnabled` defaults `true`), **jukeboxStore** (shared jukebox playlist synced from server schema)
    - `src/hooks/` — useVideoBackground (loads video via Go YouTube service proxy → `<video>` → `THREE.VideoTexture`; 15s load timeout, retries up to 3 attempts with 30s delay, falls back to iframe mode after all retries exhausted), **useSlideshowTexture** (cycles through `/textures/slideshow/` images when no video playing, shown on wall display)
    - `src/shaders/` — PsxPostProcess (VHS+bloom+fisheye post-processing, **dynamic fisheye** via `u_fisheye` uniform scaled by camera zoom distance [closer = stronger], configurable `renderScale` from uiStore [0.75/0.5/0.35] replaces hardcoded `RES_SCALE`; **half-res bloom**: scene RT downsampled to `BLOOM_SCALE=0.5` RT with LinearFilter, 16-tap bloom sampling (4 iterations × 4 cardinal); **layer-based rendering**: layer 0 for scene with VHS, layer 1 for UI/chat bubbles/nametags rendered clean, layer 2 for highlight mask; **screen-space outline**: mask RT + dilation in VHS shader, see **Interactable object outline** below), TvStaticFloor (animated TV noise floor material, `FLOOR_SEGMENTS=48`, samples baked displacement texture + PSX integer stepping via `DISP_STEPS=10`), TrampolineGrid (`GRID_SEGMENTS=48`, same displacement texture sampling + integer stepping), **DisplacementBaker.ts** (bakes ripple displacement from `getDisplacementAt` into 64×64 Float32 `DataTexture` each frame, frame-deduplicated, short-circuits when no ripples active; sampled by floor+grid vertex shaders instead of per-vertex ripple loops), TrippySky (Win95-style blue sky + animated procedural clouds skybox, drift speed 0.4), **VortexGridSky** (spinning polar grid vortex on dark cloudy FBM background — not currently used in scene, kept for future skybox option), BrickWallMaterial (procedural brick wall shader), **TatamiFloorMaterial** (procedural herringbone tatami floor for MyRoom), **StripedWallMaterial** (vertical stripe wallpaper with uOpacity for wall occlusion), **OceanViewMaterial** (animated ocean window view — moonlit nighttime), **NightSky** (dark dusk/night skybox with stars and faint clouds). **Vortex OOB** in PsxPostProcess: renders a spinning green polar grid to a tiny 128×128 offscreen RT with NearestFilter for chunky pixels; fills fisheye barrel distortion out-of-bounds areas when `vortexOob` toggle is on (default off, toggle in FpsCounter debug panel); RT rendering completely skipped when disabled
    - `src/scene/TrampolineRipples.ts` — Module-level ripple state manager (max 16 analytical ripples). Has its own `performance.now()`-based clock (`getTime()`) — no dependency on r3f clock or useFrame ordering. Provides CPU-side `getDisplacementAt(x,z)` used by DisplacementBaker (baked to texture) and directly by PlayerEntity/Room furniture for Y offset. `getRippleVec4s()`/`getRippleCount()` still available but no longer used by shaders (replaced by texture sampling). Shared by DisplacementBaker, PlayerEntity, Room furniture, and NetworkManager (remote jump ripples).
    - `src/input/` — usePlayerInput (WASD camera-relative + click-to-move + spacebar jump with cooldown + **collision detection**: room boundary clamp at ±580 server px + AABB push-out via `clampPosition()` for DJ booth, old Dell desk, and magazine rack — add new furniture by appending to `COLLISION_BOXES` array)
    - `src/ui/` — ChatInput (center-bottom chat field), ChatMessages (right panel chat view), DjQueuePanel (search + queue + YouTube search within Left queue view), MyPlaylistsPanel (personal playlists in Right Panel), RightPanel (navigation tabs for chat, playlist, settings), SettingsPanel (mute, graphics), NowPlaying (mini bar + video bg toggle), LobbyScreen (two-screen lobby flow: Screen 1 character carousel + name input, Screen 2 two-column room select with character preview; see **Lobby Custom Room System** below), **CharacterSidePreview** (compact character preview card with r3f Canvas + PaperDoll + arrow nav + dynamic camera centering via `onLayout`), **CustomRoomBrowser** (lists available custom rooms from lobby, join with optional password), **CreateRoomForm** (create custom room with name/description/password), BoothPrompt (click available egg → confirmation), FpsCounter (debug overlay: FPS readout + render scale display + post-process fisheye slider [0–15, purple, with auto/reset] + vertex fisheye slider [0–3, pink] + vortex OOB checkbox), **DisconnectedOverlay** (reconnecting spinner overlay + disconnected screen with Refresh button), **WarpCheckBg** (WebGL warping checkerboard shader background for lobby), **ComputerBrowser** (640×480 iframe overlay opened by clicking old computer desk, shows Wikipedia, dark browser chrome with traffic light dots + URL bar), **MagazineReader** (responsive modal overlay opened by clicking magazine rack — cover grid + page viewer with arrow key/click navigation; see **Magazine rack** section)
  - Planning doc: `docs/ideas/client-3d-psx-multiplayer.md`
  - Status: M1 + M1.5 + M2 + M2.5 + M3 mostly complete. VHS shader, character select (**12 characters** discovered via `characterRegistry`, per-manifest scale override), auto-scaling, TV static floor, animated Win95 cloud skybox, full DJ queue UI (playlist panel + NowPlaying mini player), ambient stream filtering all done. **DJ booth 3-slot egg system** (Feb 2026): 3 colored orbs (green/pink/cyan spotted eggs) behind the booth, each mapped to a `slotIndex` (0–2); orbs disappear when occupied; click available orb → BoothPrompt → teleport to slot position + join queue with `slotIndex`; `MAX_DJ_SLOTS=3`, `DJ_SLOT_OFFSETS_X`, `getDJSlotWorldX()` exported from Room.tsx; server enforces `MAX_DJ_QUEUE_SIZE=3` and slot uniqueness. **Video wall display** (Feb 2026): 4×2.25 (16:9) screen with dark bezel on back wall above DJ booth, shows WebGL video texture when playing or slideshow texture when idle; video removed from floor (TrampolineVideoMaterial deleted). **Wall attachment occlusion**: wall-mounted objects (VideoDisplay, picture frames, door) grouped per wall and faded alongside their parent wall opacity. **Trampoline floor** (Feb 2026): spacebar jump with moon-bounce physics, ripple vertex displacement on floor+grid, double jump, chain reaction launches, furniture bobbing, multiplayer sync via PLAYER_JUMP message. **Rendering optimizations** (Feb 2026): displacement baking (64×64 Float32 texture replaces per-vertex ripple loops), segment reduction (96→48 for floor+grid), PSX integer-stepped displacement (`DISP_STEPS=10`), dynamic fisheye (zoom-linked + debug slider), vertex fisheye (clip-space barrel distortion on characters), configurable render scale (75%/50%/35%), debug FPS overlay with shader sliders. **Interactable object outline** (Feb 2026): screen-space silhouette glow system. `InteractableObject` component wraps any scene object with props: `interactDistance`, `onInteract`, `hitboxPad` (default 0.15, eggs use 0.1), `occludeHighlight` (default false). Requires **both hover AND proximity** to highlight (not hover-from-anywhere). Exports module-level `highlightIntensity` and `highlightNeedsOcclusion` — only written by the actively highlighted object (race condition fix: non-hovered objects don't touch globals). Hitbox uses `useFrame` polling (not `useEffect`+`setTimeout` — fragile in production). Children separated into `childrenGroupRef` so `Box3.setFromObject` doesn't include the invisible hitbox mesh. `updateWorldMatrix(true, true)` called before Box3 for correct bounds in nested transforms. `PsxPostProcess` mask render: two paths based on `highlightNeedsOcclusion` — (a) `occludeHighlight=true`: depth pre-pass with full scene, then layer 2 with `depthTest: true` (desk), (b) `occludeHighlight=false`: just layer 2 with `depthTest: false` for full silhouette through geometry (eggs behind booth table). `outlineGlow()` dilates mask (3 radii × 8 directions = 24 taps, cardinal + diagonal with 0.707 weight for round outlines). Applied to OldComputerDesk (`occludeHighlight`) and DJ eggs (no occlusion, `hitboxPad=0.1`) in Room.tsx. DJ booth built facing room directly (no 180° rotation — removed to fix stale `matrixWorld` issues). **GLB models** (Feb 2026): DJ booth and old computer desk converted to `.glb` files via `scripts/build-models.mjs`, loaded with `GLBModel` component. Computer desk is clickable via `InteractableObject` → opens `ComputerBrowser`. Remaining: sound, mobile, trampoline polish (screen shake, particles, sound).
- `client-dream/` **(new — Feb 2026)**
  - Phaser 3 dream mode app embedded via iframe in client-3d. Yume Nikki-inspired surreal exploration with freeform AI NPC chat.
  - Tech: Vite + Phaser 3 + React + Zustand
  - Dev server: port 5176 (`cd client-dream && pnpm dev`)
  - Key dirs:
    - `src/phaser/scenes/` — BootScene (preload mutant_ripped atlas + world JSONs), DreamScene (main gameplay: tile rendering, player, NPCs, collectibles, world transitions)
    - `src/phaser/entities/` — DreamPlayer (8-dir continuous movement, collision), NPC (mutant sprite + FSM behavior + chat bubbles), Collectible (animated glow pickup)
    - `src/phaser/systems/` — NpcBehavior (FSM: idle, wander, face_player, conversing, following, fleeing)
    - `src/phaser/anims/` — DreamAnims (register mutant idle/walk from multi-atlas)
    - `src/bridge/` — iframeBridge (postMessage listener/sender), bridgeTypes (message type definitions + sendToParent helper)
    - `src/stores/` — dreamClientStore (init state, collected items, world), dreamChatStore (active NPC, message history, bubbles, thinking)
    - `src/npc/` — npcService (HTTP client for /dream/npc-chat), npcPersonalities (client-side greeting pools + fallback phrases)
    - `src/ui/` — DreamChatPanel (chat input + message history), DreamHUD (wake button + collectible count)
  - Assets: `public/assets/character/mutant_ripped.*` (multi-atlas), `public/data/worlds/*.json` (world definitions)
- `server/`
  - **Has its own `package.json` with `"type": "module"`** (required for Colyseus 0.17 decorator support)
  - Server code lives in `server/src/`
  - Entry point: `server/src/index.ts`
  - Colyseus rooms: `server/src/rooms/*`
  - Main room: `server/src/rooms/ClubMutant.ts`
  - Schema state: `server/src/rooms/schema/OfficeState.ts`
  - Commands: `server/src/rooms/commands/*`
- `services/`
  - `dream-npc-go/` — Standalone Express 4 microservice for Dream NPC AI chat. Separated from Colyseus server to avoid uWebSockets transport conflicts with Express middleware.
    - Tech: Express 4 + cors + tsx
    - Dev server: port 4000 (`cd services/dream-npc-go && GEMINI_API_KEY=... npm start`)
    - Key files: `src/index.ts` (Express server + CORS), `src/dreamNpc.ts` (Gemini API, rate limiting, caching, NPC personalities)
    - Endpoint: `POST /dream/npc-chat`
    - Production: `dream.mutante.club` (Caddy reverse proxy → dream-npc-go:4000)
  - `youtube-api/` — Go microservice for YouTube search + video URL resolution + proxy. Called directly by client-3d (no Colyseus proxy). See `services/youtube-api/README.md`. Key endpoints: `GET /search?q=...`, `GET /resolve/{videoId}`, `GET /proxy/{videoId}` (streams video to avoid CORS), `GET /browse?url=...` (proxies arbitrary URLs for iframe embedding — server-side only, client disabled), `POST /prefetch/{videoId}` (server-initiated cache warming). Deployed via Docker in `deploy/hetzner/docker-compose.yml`.
  - `pot-provider-rust/` — PO token provider for YouTube auth
- `tools/`
  - `paper-rig-editor/` — Vite + React + r3f character rig editor for building paper-doll characters. See `tools/paper-rig-editor/README.md` for full docs.
    - Two modes: **Slicer** (drop full image → auto BG removal → draw polygon regions → slice into parts) and **Rig** (arrange parts, set pivots/offsets/parents, preview animations, export zip)
    - Export: `manifest.json` + PNGs, format matches `client-3d/src/character/CharacterLoader.ts`
    - Run: `cd tools/paper-rig-editor && npm run dev` (port 5174)
    - Roadmaps: `docs/ideas/custom-character-system.md`, `docs/ideas/editor-image-slicer.md`
- `types/`
  - Shared types workspace package (`@club-mutant/types`)
  - Imported via pnpm workspace (no copying needed)

## GLB model pipeline (Feb 2026)

Hybrid approach: procedural JSX geometry for simple/structural things, **GLB files** for detailed objects.

### Loading in the scene

```tsx
import { GLBModel } from './GLBModel'

// Preload at module level to avoid pop-in
GLBModel.preload('/models/old-computer-desk.glb')

// In JSX — same props as <group>
<GLBModel src="/models/old-computer-desk.glb" position={[x, y, z]} rotation={[0, r, 0]} />
```

`GLBModel` uses drei's `useGLTF` (cached after first fetch) and clones the scene so multiple instances are independent.

### Creating models

**Option A: Blender** (preferred for artist-made models)

1. Model in Blender with low-poly PSX style (50–200 faces, flat shading)
2. Export as `.glb` (File → Export → glTF 2.0, format GLB)
3. Drop into `client-3d/public/models/`

**Option B: Programmatic** (code → GLB via `@gltf-transform/core`)

1. Define geometry in `scripts/build-models.mjs` using helper functions (`boxGeometry`, `cylinderGeometry`, `sphereGeometry`)
2. Run `pnpm build:models` → outputs to `client-3d/public/models/`
3. Useful for converting existing procedural JSX to static assets

### Key files

- `scripts/build-models.mjs` — Node.js script that programmatically builds GLB files using `@gltf-transform/core`
- `client-3d/src/scene/GLBModel.tsx` — Reusable loader component (useGLTF + clone + preload)
- `client-3d/public/models/` — GLB asset directory (served statically by Vite)
- Currently converted: `old-computer-desk.glb` (38 KB), `dj-booth.glb` (43 KB), `magazine-rack.glb` (10 KB), `wooden-shelf.glb` (8 KB), `retro-computer.glb` (22 KB), `trophy.glb` (7 KB), `low-table-vase.glb` (16 KB), `zabuton.glb` (5 KB), `toy-car.glb` (12 KB), `shoji-door.glb` (12 KB), `low-computer-desk.glb` (6 KB), `futon.glb` (5 KB), `candle.glb` (11 KB), `floor-lamp.glb` (10 KB), `ceiling-lamp.glb` (10 KB)
- Optimization pipeline: `dedup` (merge duplicate materials) → `flatten` (collapse hierarchy) → `join` (merge meshes by material). Runs automatically in `buildAndWrite()`.

## Magazine rack (Feb 2026)

Wooden 4-tier display shelf on the right wall. Loads a manifest-driven set of magazines with cover textures and an optional page reader.

### How it works

- **GLB model** (`magazine-rack.glb`): static wood structure built in `build-models.mjs` via `buildMagazineRack()`
- **`MagazineRack.tsx`**: scene component — loads GLB + overlays textured cover planes on each shelf slot (3 per row × 4 rows = 12 max). Falls back to colored rectangles when covers aren't available.
- **`MagazineReader.tsx`**: responsive modal UI overlay (same chrome as ComputerBrowser). Cover grid → click → page viewer with arrow key / click navigation. Window scales to `85vw × 85vh` (max 900px wide).
- **Collision**: AABB in `usePlayerInput.ts` (`RACK_BOX`) prevents walking through the rack.
- **Manifest**: `client-3d/public/textures/magazines/magazines.json`
- **Textures**: `client-3d/public/textures/magazines/covers/` and `pages/`

### Adding content

```json
// client-3d/public/textures/magazines/magazines.json
{
  "magazines": [
    {
      "id": "zine1",
      "title": "Club Mutant Zine #1",
      "cover": "covers/zine1.png",
      "pages": ["pages/zine1-p1.png", "pages/zine1-p2.png"]
    }
  ]
}
```

Drop images into the `covers/` and `pages/` folders, update the manifest, and they appear automatically on the rack and in the reader.

## Fisheye auto-scale experiment (reverted, revisit later)

At extreme fisheye values (10–15), barrel distortion shrinks the visible frame into a small bubble. Attempted fix in commit `cf9b336` (reverted `510856d`): normalize `barrelDistort()` output by the distortion factor at the edge midpoint so the frame always fills the screen.

```glsl
// In barrelDistort() — after computing distort:
float edgeR2 = 0.25;
float edgeScale = 1.0 + edgeR2 * k1 + edgeR2 * edgeR2 * k2;
return centered * (distort / edgeScale) + 0.5;
```

Works mathematically but visual feel needs more tuning. **Alternatives to explore**:

- Use a reference point between edge and corner (e.g., `r²=0.3`) for partial fill that keeps some vignette
- Only apply compensation above a threshold (e.g., `u_fisheye > 3`), blend smoothly
- Render the scene at a wider camera FOV when fisheye is cranked, instead of post-process compensation
- Combine with a circular vignette mask for a cleaner globe border

## r3f / Three.js pitfalls (learned the hard way)

- **Never use inline `uniforms={{...}}` on `<shaderMaterial>`** — creates a new object every render, r3f reapplies it and resets values set by `useFrame`. Always `useMemo` the uniforms object.
- **Zustand selectors returning objects trigger re-renders** — `useMusicStore((s) => s.stream)` re-renders on ANY stream property change (new object ref). Use granular selectors: `(s) => s.stream.isPlaying`.
- **useFrame execution order is not guaranteed** — hooks run in component mount order. Don't rely on one component's useFrame running before another's. For shared state (like ripple timing), use a self-contained time source (e.g., `performance.now()`) rather than passing values between useFrame hooks.
- **Colyseus `listen()` fires immediately** with the current value on registration. Guard against stale initial values (e.g., server 2D default positions) overriding client-side state.
- **Video background is local-only** — `boothStore.videoBackgroundEnabled` is a per-client toggle, NOT synced from server. The server's `musicStream.videoBackgroundEnabled` schema field is legacy (2D client only).
- **Global mutable variables shared across useFrame callbacks** — When multiple `InteractableObject` instances write to the same global (`highlightIntensity`), non-hovered objects can zero out an active highlight. Fix: only write when the object is actively highlighted or fading out (`shouldHighlight || isHighlighted.current`).
- **`depthWrite` on transparent objects** — When wall attachments (TV, speakers) are faded via wall occlusion, they still write to the depth buffer by default. Characters behind them become invisible. Fix: set `m.depthWrite = !faded` when `opacity < 0.99`.
- **`useEffect` + `setTimeout` for DOM/ref measurement is fragile in production** — Refs may not be populated within the timeout. Use `useFrame` polling that retries each frame until the ref is ready — robust against any timing.
- **`Box3.setFromObject` needs fresh world matrices** — In nested/rotated groups (like the old 180°-rotated DJ booth), `matrixWorld` can be stale. Always call `updateWorldMatrix(true, true)` before measuring bounding boxes.
- **Server `sanitizeTextureId` whitelist vs dynamic character discovery** — `AnimationCodec.ts` had a hardcoded `textureNamesById` map (IDs 0–4) used to validate textureIds. The 3D client discovers characters dynamically by probing `public/characters/default[N]` folders and assigns textureId by index. New characters (ID ≥ 5) got sanitized to 0 on the server, so other clients saw the wrong character. Fix: validate against a numeric range (`0..MAX_TEXTURE_ID`) instead of a name lookup. Keep `MAX_TEXTURE_ID` in sync with `characterRegistry.ts`'s `MAX_PROBE`.
- **Server speed validation rejects client-side teleports** — `UPDATE_PLAYER_ACTION` has a speed check (`maxSpeedPxPerSec * dt + buffer`). If the client teleports a player (e.g., behind the DJ booth on queue join), the large position jump gets rejected when `dtMs` is small. Fix: set position server-authoritatively in the relevant command (e.g., `DJQueueJoinCommand` sets `player.x`/`player.y` directly). This also ensures late-joining clients see the correct position.
- **`useState` inside `<Canvas>` wastes re-renders** — Inside r3f Canvas, rendering is `useFrame`-driven. `useState` triggers React reconciliation that does nothing visible. Use `useRef` for mutable state and read it imperatively in `useFrame`. Only use `useState` when you need React to add/remove JSX children.
- **Multiple `<Canvas>` elements = multiple WebGL contexts** — Each `<Canvas>` creates its own WebGL context, render loop, and scene graph. Two canvases rendering the same character means double the animation work, double the material updates, double the draw calls. Prefer CSS effects (drop-shadow, filters) on a single Canvas wrapper div instead of a second Canvas.
- **Geometry created in `onSync` callbacks leaks** — troika text's `onSync` fires whenever text metrics change. Creating new `ShapeGeometry` each time leaks unless explicitly disposed. Cache geometries by quantized dimensions (e.g., `Math.round(w * 100) / 100`) — only ~5 distinct sizes for short phrases.
- **uWebSockets transport + Express middleware incompatibility** — `@colyseus/uwebsockets-transport` invalidates `uWS.HttpRequest` after any async operation or route handler return. Express middleware that reads `req.headers` or calls `next()` (including `cors()`, body parsers, etc.) causes `uWS.HttpRequest must not be accessed after await` errors. Solution: don't add global middleware to the Express app inside `defineServer.express`. For CORS-needing endpoints, use a separate Express service (e.g., `dream-npc-go`), or use the Vite dev proxy in development. Matchmaker CORS is handled via `matchMaker.controller.getCorsHeaders`.
- **Vertex shader distortion on paper-doll parts causes z-clipping and joint gaps** — When vertex effects (lean, twist) are applied per-mesh, child groups (head on torso) don't follow because vertex displacement doesn't affect the scene graph. Fix: apply body-coherent effects (lean) as **group-level transforms** so children inherit through the hierarchy. Also: never displace Z in vertex shader twist effects on flat paper-doll planes — Z displacement causes parts to clip through each other with no visual benefit.

## How to run

- **Server**: `cd server && npm run start`
  - Runs `server/src/index.ts` via `tsx watch`
  - Uses `@colyseus/tools` `listen()` pattern
- **Client**: `cd client && npm run dev`
  - Runs Vite dev server
- **3D Client**: `cd client-3d && pnpm dev` (port 5175)
- **Dream NPC Service**: `cd services/dream-npc-go && GEMINI_API_KEY=... npm start` (port 4000)
  - Standalone Express service for AI NPC chat (separated from Colyseus to avoid uWS conflicts)
- **Dream Client**: `cd client-dream && pnpm dev` (port 5176)
  - For dream mode development, run all four: server + dream-npc-go + client-3d + client-dream

## Colyseus 0.17 Migration (Feb 2026)

### What changed

Migrated from Colyseus 0.16.x to 0.17.x. Key package upgrades:

- `colyseus` → `^0.17.8`
- `@colyseus/schema` → `^4.0.4`
- `@colyseus/sdk` (client, replaces `colyseus.js`) → `^0.17.22`
- `@colyseus/tools` → `^0.17.0`
- `@colyseus/monitor` → `^0.17.7`

### The core problem

`tsx` (the TypeScript executor) wasn't respecting `experimentalDecorators` when running from a project without `"type": "module"` in package.json. This caused `@colyseus/schema` v4's `@type` decorators to compile as TC39 standard decorators instead of legacy TypeScript decorators, resulting in:

```
TypeError: Cannot read properties of undefined (reading 'constructor')
```

### The solution: restructure to match official tutorial

Restructured the server to match the [colyseus/tutorial-phaser](https://github.com/colyseus/tutorial-phaser) pattern:

1. **Separate `server/package.json` with `"type": "module"`**
   - This tells Node.js to treat the server as an ESM module
   - `tsx` handles ESM + legacy decorators correctly in this configuration

2. **Server tsconfig with critical decorator settings**:

   ```json
   {
     "compilerOptions": {
       "experimentalDecorators": true,
       "useDefineForClassFields": false,
       "target": "ESNext",
       "module": "ESNext"
     }
   }
   ```

   - `experimentalDecorators: true` enables legacy TypeScript decorators
   - `useDefineForClassFields: false` is **critical** — without it, class field initialization breaks decorator metadata

3. **Self-contained server directory**
   - Own `package.json`, `node_modules`, and `tsconfig.json`
   - Types copied to `server/src/types/` to avoid cross-package ESM import issues

4. **Use `@colyseus/tools` `listen()` pattern**
   - Instead of manual `new Server()` + `server.listen()`
   - Handles CORS, matchmaker routes, and Express integration automatically

### Server API changes (0.16 → 0.17)

- **Room definition**: Use `defineServer()` + `defineRoom()` instead of `gameServer.define()`
- **Room lifecycle**: `onDrop(client, code)` + `onReconnect(client)` + `onLeave(client, code)` (see **Reconnection** below)
- **Room.onLeave signature**: `(client, consented: boolean)` → `(client, code: number)`
  - Check `code === CloseCode.CONSENTED` for intentional leaves
- **Client SDK**: Import from `@colyseus/sdk` instead of `colyseus.js`

### Type sharing via pnpm workspaces

Types are shared via pnpm workspaces - no more copying:

- **Package**: `@club-mutant/types` (in `types/` directory)
- **Import**: `import { Message } from '@club-mutant/types/Messages'`
- **Workspace config**: `pnpm-workspace.yaml` defines `client`, `server`, `types`

To add/modify types, edit files in `types/` directly. All packages share the same source.

### uWebSockets Transport

Server uses `@colyseus/uwebsockets-transport` for better performance:

```typescript
import { uWebSocketsTransport } from '@colyseus/uwebsockets-transport'

const server = defineServer({
  transport: new uWebSocketsTransport({
    maxPayloadLength: 1024 * 1024,
  }),
  // ...
})
```

CORS is handled via express middleware (not transport options):

```typescript
express: (app) => {
  app.use(
    cors({
      origin: ['https://mutante.club', 'http://localhost:5173', 'http://localhost:3000'],
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
    })
  )
}
```

### Deployment

- **Server (Hetzner VPS)**:
  - `Dockerfile.server`: Multi-stage build using pnpm workspaces
  - `deploy/hetzner/docker-compose.yml`: Orchestrates server + youtube-api + dream-npc-go + caddy
  - Deploy: `ssh vps "cd /path/to/club-mutant && git pull && docker-compose up -d --build server"`

- **Client (Cloudflare Pages)** — migrated from Netlify Feb 2026:
  - SPA routing: `client-3d/public/_redirects` (dream sub-app fallback + catch-all)
  - Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter club-mutant-dream build && mkdir -p client-3d/public/dream && cp -r client-dream/dist/* client-3d/public/dream/ && pnpm --filter club-mutant-3d build`
  - Build output dir: `client-3d/dist`
  - Root dir: `/` (project root, so pnpm workspaces resolve)
  - Env vars (Cloudflare Pages dashboard): `NODE_VERSION=22`, `VITE_WS_ENDPOINT`, `VITE_HTTP_ENDPOINT`, `VITE_YOUTUBE_SERVICE_URL`, `VITE_DREAM_SERVICE_URL`
  - Custom domain: `mutante.club` (CNAME → `club-mutant.pages.dev`, proxied)
  - The 3D client reads `VITE_WS_ENDPOINT` (not `VITE_SERVER_URL`) for the Colyseus server URL

## Reconnection (Feb 2026)

Uses Colyseus 0.17's `onDrop`/`onReconnect` lifecycle for graceful reconnection after network interruptions (e.g., laptop sleep).

### Server (`ClubMutant.ts`)

- **`onDrop(client, code)`** — Called on abnormal disconnection. Calls `allowReconnection(client, 60)` (60s window). Sets `player.connected = false` (synced to other clients via schema).
- **`onReconnect(client)`** — Called when client reconnects within the window. Sets `player.connected = true`.
- **`onLeave(client, code)`** — Called only for permanent leaves (consented or reconnection timeout). Cleans up player, booth, DJ queue.
- **`Player.connected`** — `@type('boolean')` schema field, default `true`. Can be used by other clients to dim/ghost disconnected players.

### Client (`NetworkManager.ts`)

- **`room.reconnection.maxRetries = 10`**, **`maxDelay = 8000`** — Stops retrying after 10 attempts with max 8s backoff (prevents infinite retry loops from the old behavior).
- **`room.onDrop`** → sets `gameStore.connectionStatus` to `'reconnecting'`
- **`room.onReconnect`** → sets status to `'connected'`, restarts `TimeSync`
- **`room.onLeave`** → sets status to `'disconnected'`, clears music/booth state

### Client UI (`DisconnectedOverlay.tsx` + `App.tsx`)

- **`connectionStatus`** in `gameStore`: `'disconnected'` | `'connected'` | `'reconnecting'`
- **App routing**: `disconnected` + no `mySessionId` → LobbyScreen (never connected). Otherwise renders game scene.
- **`DisconnectedOverlay`**: Renders on top of game (z-50) when status is not `'connected'`:
  - `'reconnecting'` → spinner + "Reconnecting..." message
  - `'disconnected'` (after having been connected) → "Disconnected" + "Refresh" button (`window.location.reload()`)

## YouTube Video Resolution

The `youtube-api` Go service resolves YouTube video URLs for streaming via yt-dlp.

### Key Files

| File                              | Purpose                                                         |
| --------------------------------- | --------------------------------------------------------------- |
| `services/youtube-api/main.go`    | Go service with `resolveWithYtDlp()`                            |
| `services/youtube-api/Dockerfile` | Go + yt-dlp runtime                                             |

### Environment Variables

| Variable           | Default | Description                                |
| ------------------ | ------- | ------------------------------------------ |
| `PROXY_URL`        | -       | ISP proxy for resolution                   |
| `POT_PROVIDER_URL` | -       | PO token provider fallback                 |

### Deployment

```bash
cd ~/apps/club-mutant && git pull
cd deploy/hetzner && docker compose build --no-cache youtube-api
docker compose up -d --force-recreate youtube-api
docker compose logs -f youtube-api  # Check logs
```

## Core runtime model

## Type model (Schema vs Interfaces vs DTOs)

This repo uses a **hybrid type model** to keep Colyseus runtime state (Schema) separate from the network payload contracts.

### 1) Server runtime state (Colyseus Schema classes)

- File: `server/src/rooms/schema/OfficeState.ts`
- These are the authoritative state containers.
- **Do not** make Schema classes `implement` shared `I*` interfaces (TypeScript structural mismatches with Colyseus internal Schema fields).

### 2) Client room state typing (Schema-shaped interfaces)

- File: `types/IOfficeState.ts`
- These interfaces extend `Schema` and are intended for typing `Room<IOfficeState>` on the client.
- Treat these as “Schema-shaped types”, not as network payload DTOs.

### 3) Wire payload contracts (DTOs)

- File: `types/Dtos.ts`
- DTOs are **plain JSON** (no Schema inheritance) and are used for:
  - `Room.send(...)` payloads
  - server `onMessage(...)` payload typing
  - dispatcher/command payload typing

Rule of thumb:

- Use **Schema** for authoritative room state.
- Use **`IOfficeState` interfaces** for client-side typing of `room.state`.
- Use **DTOs** for anything that crosses the network boundary.

### Colyseus state

- The authoritative room state is `OfficeState` (`server/rooms/schema/OfficeState.ts`).
- Relevant collections:
  - `players`: `MapSchema<Player>`
  - `musicBooths`: `ArraySchema<MusicBooth>`
  - `djQueue`: `ArraySchema<DJQueueEntry>`
  - `currentDjSessionId`: `string` (current DJ's session ID)
  - `musicStream`: `MusicStream`

### Client receives state

- `client/src/services/Network.ts`
  - Joins room, wires listeners.
  - `this.room.state.players.onAdd` registers `player.onChange` and emits Phaser events.
  - The Phaser scene listens to those events and updates in-world entities.

#### Chat bubbles (in-world)

- Chat history is stored in `state.chatMessages` (Colyseus schema) and is used for the chat log UI.
- In-world bubbles are driven by a Phaser event:
  - `Event.UPDATE_DIALOG_BUBBLE`
- Server broadcasts `Message.ADD_CHAT_MESSAGE` with `{ clientId, content }` to other clients.
- Client `Network.ts` listens for that broadcast and emits `Event.UPDATE_DIALOG_BUBBLE` so `Game.ts` can call `Player.updateDialogBubble(...)` on the correct entity.

### Player animation sync

- Server stores each player’s current animation state as compact numeric IDs:
  - `players[*].textureId` (`uint8`)
  - `players[*].animId` (`uint8`, packed kind+direction or special ids)
- The shared codec lives in:
  - `types/AnimationCodec.ts`
- Client `MyPlayer` still calls:
  - `network.updatePlayerAction(x, y, animKey)`
    but `Network.ts` encodes the string key into `{ textureId, animId }` before sending.
- Other clients render it by decoding ids back into an anim key:
  - `Network.ts` decodes `{ textureId, animId }` → `animKey` and emits `Event.PLAYER_UPDATED` with field `anim`.
  - `client/src/characters/OtherPlayer.ts` consumes that and plays `this.anims.play(animKey, true)`.

## Public lobby: skip login + force Mutant identity

Public lobby differs from custom/private rooms:

- **Goal**
  - Skip avatar/name selection UI
  - Always use the Mutant character
  - Auto-assign a unique username that contains `mutant`

- **Server enforcement (authoritative)**
  - Room id: `RoomType.PUBLIC = 'clubmutant'` (`types/Rooms.ts`).
  - `server/index.ts` passes `isPublic: true` to the public room create options.
  - `types/Rooms.ts` includes `isPublic?: boolean` on `IRoomData`.
  - `server/rooms/ClubMutant.ts`:
    - Stores `this.isPublic`.
    - On `onJoin`, if public:
      - Sets `player.name = mutant-${client.sessionId}` (unique per connection)
      - Sets `player.textureId = TEXTURE_IDS.mutant` + `player.animId = packDirectionalAnimId('idle', 'down')`
    - Ignores `Message.UPDATE_PLAYER_NAME` when public.
    - Forces `Message.UPDATE_PLAYER_ACTION` to `mutant` IDs when public.

- **Client behavior**
- Tracks `roomType` in Redux:
  - `client/src/stores/RoomStore.ts` adds `roomType` + `setJoinedRoomType`.
  - `client/src/services/Network.ts` dispatches `setJoinedRoomType(RoomType.PUBLIC|CUSTOM)`.
- Public auto-login is executed in Phaser (reliable timing):
  - `client/src/scenes/Game.ts` `create()` sets:
    - `myPlayer` texture to `mutant`
    - `myPlayer` name to `mutant-${sessionId}`
    - calls `network.readyToConnect()`
    - dispatches `setLoggedIn(true)` so Chat/Playlist UI renders
- `client/src/components/LoginDialog.tsx` returns empty for public rooms (no UI).

## DJ Queue Rotation System (Feb 2026)

A round-robin DJ queue system where multiple users can join the DJ booth and take turns playing one track each.

### Core Concept

- **Single DJ**: First person to enter the booth becomes the DJ automatically
- **Multiple DJs**: Additional users can join the queue; each gets one turn to play
- **Round Robin**: Each DJ plays exactly ONE track from their queue, then rotation moves to the next DJ
- **Track History**: Played tracks are marked and moved to bottom of queue (lower opacity), not deleted

### How It Works

1. **Entering the Booth**: User presses `R` near booth → Auto-joins DJ queue as current DJ (if first) or queued DJ
2. **Adding Tracks**: Click `+` on tracks in your playlist to add to your "Room Queue Playlist"
3. **Track Order**: New tracks insert after currently playing track; unplayed tracks play in order
4. **Playing**: First DJ must explicitly press play; all subsequent transitions autoplay
5. **Rotation**: After your track finishes (or you skip), next DJ in queue gets their turn
6. **Leaving**: Click "Leave Queue" to exit - if you were playing, rotation continues to next DJ

### Playback Control Model

- **Explicit first play**: The very first DJ in an empty/silent queue must press play to start. This is the ONLY case requiring explicit play.
- **Autoplay everywhere else**: All other transitions autoplay the next DJ's top track:
  - Track finishes → next DJ autoplays (`advanceRotation` → `playTrackForCurrentDJ`)
  - DJ skips turn → next DJ autoplays (`DJSkipTurnCommand` → `advanceRotation`)
  - DJ leaves queue → next DJ autoplays (`removeDJFromQueue` → `playTrackForCurrentDJ`)
- **Client auto-sync**: `usePlayerSync` effect sets `isPlaying = true` whenever `link` or `streamId` changes, ensuring the `<VideoPlayer>` starts playback when the server starts a new stream.
- **No auto-play on track add**: Adding a track to the queue does NOT start playback (`RoomQueuePlaylistAddCommand` removed auto-play logic).

### Playback Controls UI

- **`PlayerControls.tsx`**: Play/stop and next track buttons (no previous button, no pause — just play or stop).
- **Play**: Starts playback. For the first DJ in an empty room, this sends `DJ_PLAY` to the server.
- **Stop**: Stops playback and broadcasts `DJ_STOP` to all clients (everyone's stream stops).
- **Visibility**: Controls are only visible to the **current DJ** (`isCurrentDJ`). Non-current DJs see no playback controls.
- **Background video toggle**: TV icon (📺) button in the mini bar, next to playback controls. Toggles `videoBackgroundEnabled` (local-only Redux state). Only visible to current DJ, disabled when nothing is streaming.
- **Status text**: Track status shows "Now playing" when actively streaming, "Up next" when queued but not yet playing, "Played" for history.

### TV Static + Background Video Interaction

- **Fade out static**: When a background video starts playing (WebGL or iframe fallback), the TV static noise overlay (`TvStaticPostFxPipeline`) fades out over 650ms via `fadeOutBackgroundStatic()`.
- **Fade in static**: When the background video is disabled/stopped, the static fades back in over 650ms via `fadeInBackgroundStatic()` (tweens alpha from 0 → 0.45, restores pipeline intensity).
- **Both paths covered**: WebGL path already called `fadeOutBackgroundStatic` via `fadeInWebglBackgroundVideo`. Iframe path (`playIframeBackgroundVideo`) now also calls `fadeOutBackgroundStatic`. `stopBackgroundVideo` uses `fadeInBackgroundStatic` instead of the instant `setBackgroundStaticMode('idle')`.

### Data Model

- `OfficeState.djQueue`: `ArraySchema<DJQueueEntry>` (sessionId, name, position) — synced to clients
- `OfficeState.currentDjSessionId`: Who's currently playing — synced to clients
- `Player.roomQueuePlaylist`: Server-only plain `RoomQueuePlaylistItem[]` (not synced via schema — clients receive targeted `ROOM_QUEUE_PLAYLIST_UPDATED` messages via `client.send()`)
- `RoomQueuePlaylistItem`: Plain class (no `extends Schema`, no `@type` decorators) with `id`, `title`, `link`, `duration`, `addedAtMs`, `played`

### Key Files

- **Server**: `server/src/rooms/commands/DJQueueCommand.ts` - Join/leave/skip/play/stop/rotation logic
- **Server**: `server/src/rooms/commands/RoomQueuePlaylistCommand.ts` - Track management
- **Client UI**: `client/src/components/MyPlaylistPanel.tsx` - Unified playlist + DJ queue panel (tabbed)
- **Client UI**: `client/src/components/YoutubePlayer.tsx` - Mini player bar (no expanded view)
- **Client UI**: `client/src/components/PlayerControls.tsx` - Play/stop + next buttons
- **Client hook**: `client/src/components/usePlayerSync.ts` - Player sync + auto-play effect
- **Client scene**: `client/src/scenes/Game.ts` - Background video + TV static fade management

### UI States

- **In Queue (current DJ)**: Mini bar with play/stop + next + BG video toggle + track marquee
- **In Queue (waiting)**: Mini bar with queue position text ("You are Nth in the queue"), no playback controls
- **Currently Playing**: Track #1 locked (can't drag/remove) ONLY when actively streaming. When not yet playing, track #1 is fully interactive.
- **Played Tracks**: Greyed out at 40% opacity, shows "Played" label, at bottom of list
- **Booth Occupied (not in queue)**: Mini bar with track info + join button
- **No expanded player view**: The player only has a mini bar — no expandable panel (removed Feb 2026)

### Unified MyPlaylistPanel with DJ Queue (Feb 2026)

The DJ queue playlist and the user's personal playlists are now combined into a single unified component: `MyPlaylistPanel`. The old standalone `DJQueuePanel.tsx` has been deleted.

#### How it works

- **Outside DJ queue**: `MyPlaylistPanel` looks exactly as before — shows user playlists, search, link paste, track management
- **Inside DJ queue**: `MyPlaylistPanel` uses a **tabbed interface** on the home screen:
  - **"DJ Queue" tab** (default): Full-height queue playlist view with:
    - "DJ Queue" header + queue position (if not current DJ)
    - "My Queue Playlist (N tracks)" with full-height scrollable track list
    - Drag-to-reorder, delete, playing/played status per track
    - "Skip My Turn" button (if current DJ with others in queue)
    - "Leave Queue" button (also closes MyPlaylistPanel)
  - **"My Playlists" tab**: User's playlist list with:
    - Each playlist shows a "+" button to add ALL tracks from that playlist to the queue
    - Clicking a playlist navigates to the detail view for individual track management

#### CD button positioning

- The spinning CD button ("My Playlist") position is dynamic:
  - When a mini player bar is visible (in DJ queue or non-ambient stream playing): `top: 70px`
  - When no mini player is visible: `top: 0px` (flush upper-left corner)
- Uses `hasMiniPlayer` selector: `state.djQueue.isInQueue || (state.musicStream.link !== null && !state.musicStream.isAmbient)`
- The same `panelTop` value is used for both the closed CD button and the open panel

#### Booth entry behavior

- Sitting at the DJ booth auto-opens `MyPlaylistPanel` (via `openMyPlaylistPanel()` + `setFocused(true)` in `MusicBooth.openDialog()`)
- Joining the DJ queue via the "Join Queue" button in `YoutubePlayer.tsx` also opens `MyPlaylistPanel`
- The `DJQueueSection` component inside `MyPlaylistPanel` renders conditionally when `isInQueue` is true
- `YoutubePlayer.tsx` handles the mini player bar (play/stop/next, BG video toggle) but no longer renders queue playlist management

#### Key component: `DJQueueSection` (in `MyPlaylistPanel.tsx`)

- Reads from `state.roomQueuePlaylist.items` for the queue playlist
- Reads from `state.djQueue` for queue position, current DJ, entries
- Handles leave queue (including booth exit + closing MyPlaylistPanel), skip turn, track removal, drag-to-reorder
- Track #1 is only disabled/locked when `isActivelyStreaming` (not just because user is current DJ)
- Returns `null` when not in queue (invisible)

### Server Commands

- `DJ_QUEUE_JOIN`: Add user to queue; if first, set as current DJ (playback requires explicit `DJ_PLAY`)
- `DJ_QUEUE_LEAVE`: Remove from queue; if was current DJ, autoplay next DJ's track
- `DJ_SKIP_TURN`: Current DJ skips their turn, marks track as played, sends playlist update, rotates
- `DJ_TURN_COMPLETE`: Track finished naturally, marks track as played, sends playlist update, rotates
- `DJ_PLAY`: Explicit play command (only needed for first play in empty room)
- `DJ_STOP`: Current DJ stops playback, broadcasts `STOP_MUSIC_STREAM` to all clients
- `ROOM_QUEUE_PLAYLIST_ADD`: Add track to user's queue (inserts after current playing)
- `ROOM_QUEUE_PLAYLIST_REMOVE`: Remove track (can't remove currently playing)
- `ROOM_QUEUE_PLAYLIST_REORDER`: Reorder unplayed tracks only

### Booth Disconnect Isolation (critical gotcha)

When a player disconnects from the music booth (either via `onLeave` or `DISCONNECT_FROM_MUSIC_BOOTH` message), legacy booth music handling code (`clearRoomPlaylistAfterDjLeft`, `startAmbientIfNeeded`, `MusicStreamNextCommand`) must be **skipped** when the DJ queue is active. Otherwise it disrupts the DJ queue's music state management.

**Guard used in both `onLeave` and `DISCONNECT_FROM_MUSIC_BOOTH` handlers**:

```typescript
if (this.state.djQueue.length > 0 || this.state.currentDjSessionId !== null) return
```

This checks if the DJ queue system is active (not just if the specific player is in the queue), which avoids a race condition where `DJ_QUEUE_LEAVE` removes the player before `DISCONNECT_FROM_MUSIC_BOOTH` runs.

**Why not check the specific player**: The client sends `DJ_QUEUE_LEAVE` first, then `DISCONNECT_FROM_MUSIC_BOOTH`. By the time the booth disconnect runs, the player is already removed from the queue, so a per-player check (`isInDJQueue`) fails and legacy code runs, disrupting the stream that `removeDJFromQueue` just started.

### Styling

Dark transparent theme matching existing UI:

- Background: `rgba(0, 0, 0, 0.35)` with `backdrop-filter: blur(8px)`
- Borders: `1px solid rgba(255, 255, 255, 0.25)`
- Font: `'Courier New', Courier, monospace`
- Buttons: Lowercase text, transparent background with white borders

---

## Music + room playlist (legacy - being replaced by DJ Queue)

### The concept

~~There are two parallel playback modes:~~ (DJ Queue system replaces this)

1. **Per-DJ / per-player short queue** (legacy - replaced by DJ Queue)
   - ~~Uses `MusicStreamNextCommand` and the player's `nextTwoPlaylist`.~~
2. **Room playlist playback** (shared - deprecated)
   - ~~Uses `state.roomPlaylist` as a persistent list.~~
   - ~~Uses `musicStream.isRoomPlaylist` + `musicStream.roomPlaylistIndex` to indicate the active item.~~

> **Note**: The DJ Queue Rotation System (Feb 2026) replaces the legacy room playlist. Each user now has their own `roomQueuePlaylist` and the system rotates through DJs in a round-robin fashion.

### My playlists (client-side, local)

- The player also has a local playlist UI, stored in Redux and persisted to localStorage.
- Store: `client/src/stores/MyPlaylistStore.ts`
  - State uses a multi-playlist model:
    - `playlists: { id, name, items: PlaylistItem[] }[]`
    - `activePlaylistId: string | null`
  - Persistence key: `club-mutant:my-playlist:v1` (see `client/src/stores/index.ts`).
  - Migration: legacy persisted `PlaylistItem[]` arrays are migrated into a single playlist (`id: legacy`).

- UI: `client/src/components/MyPlaylistPanel.tsx`
  - Home view lists playlists and supports creating a new playlist.
  - Detail view has tabs:
    - `Tracks`: show tracks with remove + drag-and-drop reorder.
    - `Search`: search YouTube and add results to the active playlist.
    - `Link`: paste a YouTube URL, extract a video id client-side, and add a placeholder track (metadata resolution is pending).
  - Empty state: when a playlist has no tracks, `Tracks` shows a prompt to add via Search or Link.
  - Input safety: while the playlist panel is open, Phaser scene input is disabled to prevent movement/hotkeys while typing.

### Server-side room playlist behavior

- `server/rooms/ClubMutant.ts`
  - `ROOM_PLAYLIST_ADD`: append a `RoomPlaylistItem`.
  - `ROOM_PLAYLIST_REMOVE`: remove only if `addedBySessionId === client.sessionId`.
    - Also adjusts `musicStream.roomPlaylistIndex` so the cursor stays stable.
  - `ROOM_PLAYLIST_PLAY`: starts playback at current cursor (`roomPlaylistIndex`), DJ-only.
  - `ROOM_PLAYLIST_SKIP`: advances cursor by +1 and starts playback, DJ-only.
    - **Non-destructive:** does _not_ remove tracks from `roomPlaylist`.
  - `ROOM_PLAYLIST_PREV`: moves cursor by -1 and starts playback (clamped at 0), DJ-only.
  - Auto-start: on `CONNECT_TO_MUSIC_BOOTH`, if the room playlist has items and stream is idle, it starts playback.

### Client-side playback + UI

- Playback surface:
  - `client/src/components/YoutubePlayer.tsx` renders a `ReactPlayer`.
  - `onEnded`:
    - If `isRoomPlaylist` and you are the current DJ, it calls `skipRoomPlaylist()`.

- Minimized DJ bar:
  - `YoutubePlayer.tsx` renders a mini bar in the top-left corner (no expanded view).
  - DJ queue mode: Shows play/stop + next + BG video toggle + marquee track/queue status.
  - Join queue mode: Shows track info + join button.
  - The underlying `ReactPlayer` stays mounted (hidden off-screen, audio continues).

- Stream metadata flow:
  - Server broadcasts `Message.START_MUSIC_STREAM` with `musicStream`.
  - `client/src/services/Network.ts` forwards to Phaser via `Event.START_PLAYING_MEDIA`.
  - `client/src/scenes/Game.ts` handles it and dispatches to Redux:
    - `setMusicStream({ url, title, currentDj, startTime, isRoomPlaylist, roomPlaylistIndex, videoBackgroundEnabled })`

- UI rendering:
  - `YoutubePlayer.tsx` shows `Play` and `Skip` buttons.
  - The room playlist list highlights the active track when:
    - `musicStream.isRoomPlaylist === true` and `index === musicStream.roomPlaylistIndex`.

### DJ-synced fullscreen video background

The DJ can toggle the current YouTube stream as a fullscreen background for everyone:

- **Server state**: `musicStream.videoBackgroundEnabled` (Colyseus schema)
- **Message**: `Message.SET_VIDEO_BACKGROUND` (DJ-only; booth connected user)
- **Client rendering**:
  - Background video is rendered by Phaser using `phaser3-rex-plugins` YouTube player (`DOMElement`)
    - `client/src/scenes/Game.ts` creates `MyYoutubePlayer` and controls it on stream start/stop.
    - **Do not call** `setElement(...)` on the rex player (it interferes with internal DOM/iframe creation).
    - Autoplay reliability: call `setMute(true)` before `play()`.

- **Input safety**:
  - `pointer-events: none` is applied so the iframe never blocks gameplay input.

- **Event wiring / race condition fixes**:
  - `Event.VIDEO_BACKGROUND_ENABLED_CHANGED` was added so Phaser can react when the background toggle changes
    while a stream is already playing (no need to wait for the next `START_MUSIC_STREAM`).
  - `Game.create()` includes a late-join resync (delayed) to load the background for players who join
    after playback has already started.

- **Layering: video behind the game**
  - Phaser DOM Elements live in a DOM container overlay (not inside WebGL). To place the YouTube video
    behind game sprites, CSS sets the Phaser DOM container below the canvas:
    - `client/src/index.scss`: `canvas { z-index: 1 }` and `#phaser-container > div { z-index: 0 }`.
  - To avoid washed-out VHS visuals when the canvas is transparent, the VHS final pass uses a hard alpha
    mask (opaque where the game draws, fully transparent elsewhere).

Safari notes:

- Autoplay is not guaranteed even when muted; the background renderer provides a user-gesture fallback ("Enable background video").
- Background video does a light resync (seek + play) on enable and tab resume (visibility/focus/pageshow); it does not run the heavier drift-correction loop used for the main audio player.

## DJ booth (music booth) behavior

### Entering/leaving

- Item: `client/src/items/MusicBooth.ts`
  - `openDialog()` opens the playlist UI and sends `CONNECT_TO_MUSIC_BOOTH`.
  - `closeDialog()` closes UI and sends `DISCONNECT_FROM_MUSIC_BOOTH`.

- **Gotcha (server-side booth occupancy)**:
  - `MusicBooth.connectedUser` is a `@type('string')` schema field.
  - Treat both `null` and `''` as "empty".
  - Otherwise a booth can get stuck "occupied" after a disconnect and prevent anyone else from becoming DJ.

- Player interaction:
  - `client/src/characters/MyPlayer.ts`
  - Press `R` near booth:
    - Connects + opens playlist panel.
    - Switches player behavior to sitting.

### DJ “boombox” animation

- Asset:
  - `client/public/assets/character/MutantBoomboxTest2.gif`

- Bootstrapping:
  - `client/src/scenes/Bootstrap.ts` preloads the spritesheet with frame size `72x105`.

- Animation creation:
  - `client/src/anims/CharacterAnims.ts` creates `mutant_boombox` (frames 0–11), repeat `-1`, frameRate `animsFrameRate * 0.5`.

- Local + network sync:
  - When entering booth:
    - `MyPlayer` plays `mutant_boombox` and calls `network.updatePlayerAction(..., 'mutant_boombox')`.
  - When leaving booth:
    - `MyPlayer` plays idle and calls `network.updatePlayerAction(..., idleAnimKey)`.

- Other players:
  - `OtherPlayer` plays the synced anim key.
  - If `currentAnimKey === 'mutant_boombox'`, it forces high depth so the DJ renders above the booth.

### DJ “desk” / djmutant3 animation (public room)

- Asset:
  - `client/public/assets/character/djmutant3-solo-2.gif`
  - Dimensions: `376x704` (2 columns x 6 rows)
  - Frame size: `188x117`

- Desk (booth) asset:
  - `client/public/assets/items/thinkpaddesk.gif` (loaded under key `musicBooths`)

- Bootstrapping:
  - `client/src/scenes/Bootstrap.ts` preloads the spritesheet under key `mutant_djwip`.

- Animation creation:
  - `client/src/anims/CharacterAnims.ts` creates `mutant_djwip` (frames `0..4`), repeat `-1`.
  - Frame rate is intentionally slower than the base anim rate (`animsFrameRate * 0.25`).

- Local + network sync:
  - `MyPlayer` uses `mutant_djwip` when entering the booth in public rooms and calls `network.updatePlayerAction(..., 'mutant_djwip')`.

- Desk visibility:
  - The booth sprite is treated as a placeholder “desk”.
  - The desk stays visible even while a DJ is active.

### DJ transform transition (enter + exit)

- Asset:
  - `client/public/assets/character/dj-transform.png`
  - Frame size: `90x140` (3 columns x 2 rows)

- Animation keys:
  - `mutant_transform` (frames `0..5`, repeat `0`, frameRate `animsFrameRate * 0.5`)
  - `mutant_transform_reverse` (frames `5..0`, repeat `0`, frameRate `animsFrameRate * 0.5`)

- Entering the booth (press `R`):
  - `MyPlayer` snaps the player to a booth “stand spot” and forces facing down.
  - Plays `mutant_transform` once, then switches to the booth anim (`mutant_djwip` in public rooms, otherwise `mutant_boombox`).
  - Sync is done by calling `network.updatePlayerAction(..., animKey)` for both the transform and the final booth anim.

- Leaving the booth (press `R` again):
  - Plays `mutant_transform_reverse` once, then switches back to `${playerTexture}_idle_down` and restores movement.
  - Reverse transition is also synced via `network.updatePlayerAction`.

- Depth ordering:
  - DJ + transform animations render behind the desk:
    - `MyPlayer` uses `this.setDepth(musicBooth.depth - 1)` on booth entry.
    - `OtherPlayer` uses `this.setDepth(this.y - 1)` when `anim` is `mutant_djwip` / `mutant_transform` / `mutant_transform_reverse`.

### Player collision + DJ hitbox gotchas

- Player-vs-player collision is Arcade physics (`this.physics.add.collider(this.myPlayer, this.otherPlayers)` in `Game`).
- Remote players are `OtherPlayer` instances, driven by server-synced positions.
- The DJ animation frames include the whole desk/table, so collision cannot be frame-wide.
  - `client/src/characters/Player.ts` implements a special DJ-only “feet” hitbox in `updatePhysicsBodyForAnim()`.
  - It uses a narrow, low hitbox and anchors it using a right-edge reference so it can be widened leftward.

- The transform animations (`mutant_transform`, `mutant_transform_reverse`) are treated like DJ anims for collision sizing.

- Late-join collision mismatch:
  - When an `OtherPlayer` is spawned while already in a DJ/transform anim, `Game.handlePlayerJoined()` must ensure it applies the correct hitbox sizing immediately.
  - Current pattern: `Game.handlePlayerJoined()` decodes `textureId/animId` to an anim key and calls `otherPlayer.updateOtherPlayer('anim', animKey)`.

### DJ chat bubble scaling

- `Player.updateDialogBubble(content, scale)` supports scaling.
- The DJ bubble is rendered at `1.5x` scale (both for local and remote):
  - `client/src/scenes/Game.ts` determines whether a message sender is the DJ.
  - `client/src/components/ChatPanel.tsx` also scales the local immediate bubble (since it renders before the server echo).

## Recent learnings / gotchas (Jan 2026)

### Bandwidth + server correctness refactors

- **Compact player animation replication**
  - Migrated from string `players[*].anim` to `{ textureId:uint8, animId:uint8 }` using `types/AnimationCodec.ts`.
  - Server: `server/rooms/schema/OfficeState.ts` (`Player.textureId/animId`).
  - Client: `Network.ts` encodes outgoing anim keys and decodes incoming ids back to anim keys for `OtherPlayer`.

- **Movement validation + throttling**
  - `Message.UPDATE_PLAYER_ACTION` is throttled (min interval) and validates max travel distance based on dt.

- **Graceful leave / reconnection**
  - `ClubMutant.onLeave` uses `allowReconnection(...)` with a grace window so transient disconnects can recover.

- **MyPlayer movement/animation stability**
  - Mutant uses isometric `up_left/up_right` (no `*_run_up`).
  - Added snapping/advance for close waypoints and a small vx deadzone to prevent micro-jitter between `up_left` and `up_right`.

### VHS PostFX (Shadertoy port)

- **Implementation**
  - Post-process shader is implemented as a Phaser WebGL `PostFXPipeline`:
    - `client/src/pipelines/VhsPostFxPipeline.ts`
  - Pipeline registration happens once in:
    - `client/src/scenes/Bootstrap.ts`
  - Toggle hotkey lives in:
    - `client/src/scenes/Game.ts` (key: `V`)

- **Key WebGL gotchas encountered**
  - **Render targets do not have mipmaps**
    - The Shadertoy source uses `texture(iChannelX, uv, bias)` (LOD bias).
    - Sampling Phaser render targets with LOD bias can return black.
    - Fix: in the port, `tex2DBias(...)` always samples LOD0 via `texture2D(...)`.
  - **Framebuffer / texture feedback loops**
    - Symptom: black output and console spam like:
      - `GL_INVALID_OPERATION: glDrawArrays: Feedback loop formed between Framebuffer and active Texture.`
    - Cause: rendering into a framebuffer whose attached texture is also bound as the active sampler.
    - Fix: copy the incoming `renderTarget` into `fullFrame1` at the start of `onDraw` and use that copy (`inputFrame`) as the pipeline input (and as the “original” reference texture in the final pass).

### VHS Optimization (completed Jan 2026)

The VHS pipeline has been optimized for performance:

- **Pass combining**: Merged Pass A (luma/chroma shrink) + Pass B (levels/tint/saturation) into single Pass AB
  - Reduced from 5 shader passes to 4
  - Reduced from 4 render targets to 3
  - Removed UnsharpMask (required separate texture sample)

- **Half-resolution rendering**: Pass AB runs at 0.5x resolution using Phaser's built-in `halfFrame1`
  - Toggle: `Shift+V`
  - Passes C, D, and Image run at full resolution

- **Frame skipping**: Can skip 1-3 frames, reusing cached result
  - Toggle: `Ctrl/Cmd+V` (cycles 1→2→3)
  - Fixed ping-pong buffer and interlacing to work correctly with frame skipping
  - Fixed alpha transparency issue by forcing `fragColor.a = 1.0` in all shader outputs

- **FPS logging**: Console logs FPS when toggling VHS settings
  - Format: `[VHS] <setting> | FPS: <value>`

- **Pipeline flow**: `input → AB → C → D → Image`
  - AB: luma/chroma shrink + levels + tint + saturation (half-res optional)
  - C: interlacing + noise (uses ping-pong buffer for temporal effect)
  - D: tracking + wave + warp + white noise
  - Image: vignette + final output

### OtherPlayer Update Optimizations (reverted Feb 2026)

Attempted optimizations to reduce `OtherPlayer.preUpdate()` cost were reverted because they made the game feel slower:

- **Frame skipping (every 2nd frame)**: Added `frameCounter % 2 !== 0` early return
  - **Problem**: Delta compensation was wrong. Multiplied `dt * 2` but Phaser's `dt` is time since last `preUpdate` call, not last _processed_ frame. This caused jerky, inconsistent movement.

- **Viewport culling + animation pause/resume**: Skipped processing for off-screen players and called `anims.pause()`/`anims.resume()`
  - **Problem**: Players near viewport edge constantly toggled pause/resume as camera moved. `anims.pause()` and `anims.resume()` have overhead and cause stuttering.

- **Depth threshold (only update when Y changes >2px)**: Added `lastDepthY` tracking
  - **Problem**: Minor overhead savings, but added complexity without noticeable benefit.

**Lesson**: These micro-optimizations add branching/state overhead that can exceed the cost they're trying to avoid, especially for small player counts. The original simple loop was already efficient enough.

**Kept**: Pathfinding cache in `Game.ts` (`cachedBlockedGrid` + `blockedGridDirty`) is a valid optimization—no per-frame cost, just caches on demand.

### Follow-up tasks (per-track metadata)

- **Broadcast track metadata**: when a track starts playing, broadcast `visualUrl` and `trackMessage` so all clients see the same background/message.
  - Likely requires:
    - Extending the server stream payload (schema/message) to include these fields.
    - Client: `App.tsx` background renderer uses `visualUrl` when present; UI uses `trackMessage` as an on-screen overlay.

### Mutant character animations (atlas)

- **Assets**
  - Texture atlas: `client/public/assets/character/mutant.png`
  - Atlas JSON: `client/public/assets/character/mutant.json`
  - Animation definitions: `client/src/anims/CharacterAnims.ts`

- **Animation key convention**
  - Local player drives animation via `network.updatePlayerAction(x, y, animKey)`.
  - Keys are strings like:
    - `mutant_idle_<dir>`
    - `mutant_run_<dir>`
    - `mutant_burn_<dir>`
    - `mutant_flamethrower_<dir>`
    - `mutant_punch_<dir>`

- **Walk direction order is sprite-dependent**
  - The mutant walk sheet is ordered:
    - `NE(0-9)`, `E(10-19)`, `SE(20-29)`, `SW(30-39)`, `W(40-49)`, `NW(50-59)`
  - This does not include a true `S`/`N` direction; code maps gameplay directions onto the closest available sprite-facing.

- **Movement directions added (NW/NE)**
  - `MyPlayer` now supports diagonal-up facings:
    - `up_right` (NE)
    - `up_left` (NW)
  - These drive `mutant_run_up_right` / `mutant_run_up_left` animations.

- **Debug animation interruption fix**
  - Debug keys `1/2/3` (burn/flamethrower/punch) were getting interrupted by the idle transition logic.
  - Fix: guard the idle transition while a debug anim is playing via `playingDebugAnim` in `client/src/characters/MyPlayer.ts`.
  - Additional hardening:
    - Only lock debug mode if `scene.anims.exists(animKey)`.
    - Track the active debug anim key in `debugAnimKey` and clear the lock if the current anim changes (e.g. movement interrupts the debug anim).

- **Punch direction keys**
- Added explicit keys for diagonal-up punch:
  - `mutant_punch_up_right` (frames `0..10`)
  - `mutant_punch_up_left` (frames `55..65`)

### Punching (click-to-punch + server-authoritative hit)

- **UX / control**
  - **Double-click** another player to auto-walk toward them and punch when in range.
  - Single-click on a player delays action (waits for potential double-click).
  - Cursor changes to `pointer` when hovering over clickable players.
  - Client tracks a pending target via `pendingPunchTargetId`.

- **Client implementation**
  - Target acquisition + approach + range check lives in:
    - `client/src/scenes/Game.ts`
  - When in range, the attacker plays a local action anim:
    - `MyPlayer.playActionAnim('mutant_punch_<dir>')`
  - Then the request is sent to the server:
    - `Network.punchPlayer(targetId)` → `Message.PUNCH_PLAYER`

- **Server authority (validation + effect)**
  - `server/rooms/ClubMutant.ts` dispatches `Message.PUNCH_PLAYER` into a command:
    - `server/rooms/commands/PunchPlayerCommand.ts`
    - Rejects invalid targets / self-target.
    - Re-checks range server-side:
      - `punchRange = 50` (circular, slightly larger than client for latency forgiveness)
    - Applies a small knockback after an impact delay:
      - `punchImpactDelayMs = 370`
      - `punchKnockbackDelayMs = 150`
      - `punchKnockbackPx = 6`
    - Victim hit animation is randomly selected:
      - `mutant_hit1_<dir>` or `mutant_hit2_<dir>`
    - Currently only applies to victims whose `textureId` is `mutant`.

- **How the victim sees the hit**
  - Server sets `victim.textureId/animId` to the hit animation (so late joiners see it), and also:
    - Broadcasts `Message.UPDATE_PLAYER_ACTION` to everyone except the victim.
    - Sends `Message.PUNCH_PLAYER` _to the victim only_ with `{ anim, x, y }`.
  - Client receives the victim-only `Message.PUNCH_PLAYER` in:
    - `client/src/services/Network.ts`
    - Emits `Event.MY_PLAYER_FORCED_ANIM`
  - `client/src/scenes/Game.ts` handles that event by:
    - Canceling movement
    - Resetting Arcade body position (if `x/y` included)
    - Playing the hit animation via `MyPlayer.playHitAnim(...)`

- **Animation defs**
  - Punch anims: `mutant_punch_*`
  - Hit anims: `mutant_hit1_*`, `mutant_hit2_*`
  - Defined/overridden in `client/src/anims/CharacterAnims.ts`.

### Melee Punch System (Feb 2026 Redesign)

The punch system was redesigned to be more skill-based and visually satisfying:

- **Melee range requirement**: You must be within **60px circular range** to punch
  - Previous system auto-approached and punched; new system requires positioning first
  - Double-clicking a player when **outside** melee range just moves toward them
  - Double-clicking a player when **inside** melee range executes the punch immediately
- **Collision handling**: Player-to-player collision is disabled when within 80px of punch target
  - Allows sprites to overlap visually for satisfying punch connection
  - Collision re-enabled after punch completes
- **Melee range detection**:
  - Client: `meleeRange = 60px` (circular)
  - Server: `punchRange = 65px` (slightly larger for latency forgiveness)
  - Diagonal threshold: `0.3` (more forgiving for diagonal punches)
- **Implementation details**:
  - `Game.ts` click handler checks `inMeleeRange` before allowing punch
  - If in range: sets `pendingPunchTargetId` and executes punch
  - If out of range: just moves toward target using `setMoveTarget()`
  - Update loop handles punch execution when `pendingPunchTargetId` is set
  - Direction calculation uses diagonal threshold of 0.3 for better diagonal detection

### Punch System Optimizations (Feb 2026)

Key optimizations made during the punch system iteration:

- **Collision box reduction**: Reduced from 50% width × 20% height → 15% width × 8% height
  - Allows sprites to overlap significantly during punches
  - Maintains enough physics presence for normal movement
  - Positioned at feet for natural movement feel

- **Circular range vs elliptical**: Changed from 30x/20y ellipse → 60px circle
  - Elliptical ranges made diagonal punches frustrating (distance varied by angle)
  - Circular range provides consistent feel from all directions
  - Visual distance matches player expectations better

- **Diagonal threshold optimization**: Reduced from 0.5 → 0.3
  - Original threshold required nearly equal x/y components to count as diagonal
  - Lower threshold makes diagonal punches trigger more reliably
  - Players don't have to be perfectly aligned for diagonal attacks

- **Collision disabling at 80px**: Dynamically disable player-to-player collision when close
  - Allows sprites to overlap for visual punch connection
  - Re-enabled after punch completes
  - Solves "can't get close enough" issue without removing collision entirely

### Punch System Final Parameters (Feb 2026)

After extensive iteration, the final punch system parameters:

- **Melee range**: `60px` circular
  - Initial attempts used elliptical ranges (e.g., 30x/20y) but diagonal punches were frustrating
  - Circular range feels more consistent from all angles
  - Lowered diagonal threshold from 0.5 to 0.3 for better diagonal punch detection

- **Collision box size**: 15% width × 8% height of sprite
  - Tiny hitbox allows sprites to overlap significantly during punches
  - Positioned at feet: `offsetY = this.height * 0.5 - collisionHeight`
  - Collision disabled within 80px to allow visual overlap

- **Double-click system**: 300ms threshold
  - Single-click: move toward target
  - Double-click in range: punch
  - Double-click out of range: just move (no auto-punch)

- **Key insight**: Melee combat needs "commitment"
  - Auto-approach + auto-punch felt disconnected
  - Manual positioning + deliberate double-click feels more skill-based
  - Players learn the 60px range through trial and error

- **Step-in experiment** (reverted):
  - Tried adding a 15-20px "step-in" movement before punching
  - Intended to guarantee sprite overlap for visual connection
  - Result: Not noticeably better than collision-disabled approach
  - Lesson: Simple is often better; extra movement step adds complexity without clear benefit

### Punch system debugging learnings (Feb 2026)

- **Camera zoom affects distance calculations**
  - Camera zoom is `1.5x` (`this.cameras.main.zoom = 1.5`).
  - World distance of 50px appears as ~75px on screen.
  - Punch range values must account for this: use smaller world-space values so visual distance looks correct.

- **Double-click to punch (avoiding accidental movement)**
  - Problem: Single-click to punch caused accidental movement when trying to attack.
  - Solution: Require double-click (300ms threshold) to initiate punch.
  - Single-click on a player is delayed; if no second click comes, character walks toward player without attacking.
  - Properties used: `lastOtherPlayerClickTime`, `lastOtherPlayerClickId`, `pendingSingleClickTimer`.

- **Click detection on overlapping sprites**
  - Problem: When your sprite overlaps the target's sprite, clicking the target was unreliable.
  - Solution: Use **elliptical proximity detection** instead of sprite bounds.
  - Detection radii: `clickRadiusX = 40`, `clickRadiusY = 70` (taller to match sprite height).
  - Normalized distance formula: `(dx²/rx²) + (dy²/ry²) <= 1`.
  - Falls back to sprite bounds check if elliptical detection misses.

- **Hover cursor for UX feedback**
  - `handlePointerMove()` checks `getHoveredOtherPlayer()` using same elliptical detection.
  - Sets `this.game.canvas.style.cursor = 'pointer'` when hovering over a player.

- **Sprite overlap for visual punch connection (Feb 2026)**
  - Problem: Physics collision prevented characters from getting close enough for punches to look visually connected.
  - Solution: **Dynamically disable player-to-player collision during punch approach**:
    - Store reference to `playerCollider` (the collider between `myPlayer` and `otherPlayers`).
    - When within 80px of punch target: `this.playerCollider.active = false`.
    - Re-enable collision when punch completes or is cancelled.
  - This allows sprites to overlap for visual punch connection while maintaining collision for general movement.
  - **Punch range tuning**:
    - Client: `punchRange = 48px` (circular distance check).
    - Server: `punchRange = 50px` (slightly larger to account for position sync latency).
    - Character approaches target feet directly (no offset) since collision is disabled.
  - **South approach issue**: When approaching from below, physics bodies prevent getting closer than ~44-47px even with collision disabled. Solution: Set punch range to 48px to fire reliably from this distance.

- **Player hitbox positioning (Feb 2026)**
  - Hitboxes moved up 15px from feet for better body centering.
  - Applied in both `Player.ts` and `OtherPlayer.ts`.
  - Improves visual alignment of collision boxes with sprite bodies.

- **Auto-approach when not in range**
  - Problem: Character stops at pathfinding destination but may still be outside punch range.
  - Solution: In the update loop, if `pendingPunchTargetId` is set and character is stopped but not in range:
    - Walk directly to target feet position (collision is disabled when close).
    - Call `setMoveTarget()` to continue moving closer.
  - This ensures the character keeps approaching until punch can execute.

- **Debugging tips**
  - Add `console.log` for: `canMove`, `normDist`, `isDoubleClick`, `timeSinceLastClick`, `inRange`, `distToTarget`, `colliderActive`.
  - Check if click handler even runs (`canMove=true`).
  - Check if player is detected (`normDist < 1`).
  - Check if double-click registers (`isDoubleClick=true`).
  - Check if in punch range (`inRange=true`, compare distance vs `punchRange`).
  - Check if collision is being disabled (`colliderActive=false` when close).

### Click-to-move pathfinding

- **Camera zoom breaks `pointer.worldX/Y`**
  - With camera zoom (e.g. `this.cameras.main.zoom = 1.5`), `pointer.worldX` and `pointer.worldY` give WRONG coordinates.
  - **Always use `this.cameras.main.getWorldPoint(pointer.x, pointer.y)`** to convert screen coords to world coords.
  - This affects both click-to-move and hover detection.

- **UI click-through prevention**
  - React UI overlays on top of the Phaser canvas can receive clicks that also propagate to Phaser.
  - Fix: In `isPointerOverCanvas()`, check that `event.target === canvas` before allowing movement.
  - This prevents clicking playlist icons, chat, etc. from moving the character.

- **Pathfinding coordinate flow**
  - Click screen position → `camera.getWorldPoint()` → world coords
  - World coords → `map.worldToTileX/Y()` → tile coords
  - A\* pathfinding on tile grid → tile path
  - Tile path → `map.tileToWorldX/Y() + tileWidth/2` → world waypoints
  - Player follows waypoints via `setMovePath()`

- **Arrival threshold matters**
  - Original 10px threshold caused noticeable "stopping short" of destination.
  - Reduced to 4px and added snap-to-target on final arrival for precise positioning.

- **Blocked tile expansion**
  - `buildBlockedGrid()` expands blocked tiles by 1 in all directions to prevent player from hugging walls.
  - If clicked tile is in the expanded zone, `findNearestOpenTile()` finds the closest walkable tile.

### DJ booth interaction

- **Single-click activation when highlighted**
  - When a MusicBooth is the `highlightedInteractable` (via hover or keyboard selector), single-click triggers auto-walk + enter.
  - No double-click needed for highlighted items.

- **Booth approach point**
  - When auto-entering booth, character paths to `boothBounds.bottom + 8` (just below the desk).
  - Uses `queueAutoEnterMusicBooth()` to enter DJ mode upon arrival.

- **Booth occupancy must be replayed on join**
  - `Network.onItemUserAdded()` replays any already-occupied `musicBooths[*].connectedUser` when registering the listener.
  - This prevents late joiners from seeing the placeholder desk when the booth is already occupied.

- **Colyseus 0.16 state listeners: use the root callback proxy**
  - Colyseus `0.16.x` replaced the old `onChange` ergonomics with `getStateCallbacks(room)`.
  - To avoid “connected but not syncing” / missed events, prefer:
    - `const stateCallbacks = getStateCallbacks(room)(room.state)`
    - `stateCallbacks.players.onAdd(...)`, `stateCallbacks.chatMessages.onAdd(...)`, etc.
  - Avoid wiring listeners directly off `callbacks(room.state.players)` during `initialize()`. On first join, the initial patch can land after listeners are registered, and the underlying collection reference can be in an incomplete/transition state.

- **Colyseus 0.16/0.17 timing: don't read nested schema fields during join**
  - Right after `joinOrCreate`, `room.state.musicStream` may be temporarily incomplete before the first patch. Additionally, `TimeSync` needs ~1s to complete probe burst before `toClientTime()` is accurate.
  - Fix pattern (3D client):
    - DJ queue: read from schema immediately on join (no TimeSync needed)
    - Music stream: defer via `TimeSync.onReady()` callback — ensures correct seek offset. `streamId` dedup prevents double-set if `START_MUSIC_STREAM` message arrives first.
    - Default Zustand state to safe values

- **Avoid “toggle debug anim” drift**
  - Keeping a single authoritative DJ anim key (`mutant_djwip`) avoids hitbox/asset confusion.

- **Fullscreen YouTube background styling lives in React (not Phaser)**
- **YouTube background is now Phaser-managed (not React portal)**
  - The old React portal background renderer was removed in favor of Phaser-managed background video.
  - Any styling/cropping should be done either via rex player sizing or via CSS affecting the Phaser DOM container.

### YouTube resolve endpoint (yt-dlp) (Jan 2026)

To support a future "true WebGL video background" (Phaser `Video` texture), the server can resolve a
YouTube ID into a direct playable video URL:

- **Endpoint**: `GET /youtube/resolve/:videoId`
  - File: `server/index.ts` (route registered before `/youtube/:search`)
  - Implementation: `server/youtubeResolver.ts`
  - Calls the `yt-dlp` binary (configured via `YT_DLP_PATH`, defaults to `yt-dlp` in PATH)
  - Returns:
    - `url` (direct `googlevideo.com` URL)
    - `expiresAtMs` (parsed from `expire=` query param when present)
    - `resolvedAtMs`

- **Caching**:
  - In-memory cache with short TTL and in-flight de-dupe to avoid repeated `yt-dlp` calls.
  - TTL respects expiry by refreshing before `expiresAtMs` using a skew.

- **Local dev install (macOS)**:
  - Recommended: `brew install yt-dlp`
  - Alternative: `pipx install yt-dlp`

- **Expiry refresh strategy (client)**:
  - If `expiresAtMs` is provided, refresh ~60s before expiry.
  - Also refresh on playback error (403/410 / media error) and resume at the current playback time.

- **Schema collections: mutate in-place (don’t replace) to preserve `$changes`**
  - Avoid assigning a new array to a Schema collection (e.g. `state.musicBoothQueue = state.musicBoothQueue.filter(...)`).
  - Use in-place ops instead (reverse loop + `splice`, `shift()` + `push()`) so Colyseus change tracking stays intact.
  - Replacing collections can lead to server crashes like `Cannot read properties of undefined (reading '$changes')`.

- **Vite + colyseus.js: force browser httpie implementation**
  - Without an alias, Vite may pull `@colyseus/httpie/node` which depends on Node-only `url.parse` and breaks the client build.
  - Fix in `client/vite.config.ts`:
    - `resolve.alias['@colyseus/httpie'] = '@colyseus/httpie/xhr'`

## Important files (high touch)

- **Networking**: `client/src/services/Network.ts`
- **Main Phaser scene**: `client/src/scenes/Game.ts`
- **Player entities**:
  - `client/src/characters/MyPlayer.ts`
  - `client/src/characters/OtherPlayer.ts`
- **Music server logic**: `server/rooms/ClubMutant.ts`
- **Server state schema**: `server/rooms/schema/OfficeState.ts`
- **Client UI playback**: `client/src/components/YoutubePlayer.tsx`
- **My Playlists + DJ Queue UI**: `client/src/components/MyPlaylistPanel.tsx` (unified panel with DJ Queue section)
- **DJ Queue logic**: `server/src/rooms/commands/DJQueueCommand.ts`
- **DJ helpers (shared)**: `server/src/rooms/commands/djHelpers.ts` (`playTrackForCurrentDJ`)
- **Debug mode config**: `client/src/config.ts`
- **Room Queue Playlist**: `server/src/rooms/commands/RoomQueuePlaylistCommand.ts`
- **Clock sync**: `client-3d/src/network/TimeSync.ts` (client-server clock sync with `onReady` callback)
- **Jukebox commands**: `server/src/rooms/commands/JukeboxCommand.ts`
- **Jukebox room scene**: `client-3d/src/scene/JukeboxRoom.tsx`
- **Jukebox store**: `client-3d/src/stores/jukeboxStore.ts`
- **Shared message enum**: `types/Messages.ts`
- **Room types + music modes**: `types/Rooms.ts`
- **Dream NPC chat handler**: `services/dream-npc-go/src/dreamNpc.ts`
- **Dream NPC service entry**: `services/dream-npc-go/src/index.ts`
- **Dream iframe bridge (3D client)**: `client-3d/src/ui/DreamIframe.tsx`
- **Dream store (3D client)**: `client-3d/src/dream/dreamStore.ts`
- **Dream scene (Phaser)**: `client-dream/src/phaser/scenes/DreamScene.ts`
- **Dream player (Phaser)**: `client-dream/src/phaser/entities/DreamPlayer.ts`
- **NPC entity**: `client-dream/src/phaser/entities/NPC.ts`
- **NPC behavior FSM**: `client-dream/src/phaser/systems/NpcBehavior.ts`
- **NPC chat service**: `client-dream/src/npc/npcService.ts`
- **Dream chat store**: `client-dream/src/stores/dreamChatStore.ts`
- **Lily NPC character assets**: `client-3d/public/npc/denkiqt/` (PaperDoll manifest + PNGs)

## Conventions / tips

- Animation keys are plain strings like `mutant_idle_down`, `mutant_boombox`.
- If you change a player animation locally and want others to see it, call `Network.updatePlayerAction(...)` with the anim key.
  - The network layer encodes it into compact ids.
- For shared state, prefer adding explicit fields to the server schema + shared interfaces in `types/` and use those on the client.

## Spritesheet extraction / atlas workflow (Mutant / `adam`)

Preferred pipeline is **TexturePacker atlas** rather than loading many individual spritesheets.

### Inputs and script

- Source sheets: `conversion/base/*`
- Extractor: `conversion/scripts/extract_anim_blocks.py`
- Usage notes: `docs/spritesheet-extraction.md`

### Mapping blocks to animations

The extractor can export per-block label crops and auto-generate a starter map:

- `--export-labels`
- `--write-frames-map <path>`

This produces:

- `labels/block_XXX.png` (cropped label text)
- `frames-map.json` with `blocks.block_XXX.labelFile` entries

OCR is optional:

- `--label-ocr` will only work if `tesseract` is installed.

### Exporting frames for atlas packing

Core flags:

- `--export-frames`
- `--export-frames-flat` (recommended)
- `--frames-trim` and `--frames-trim-pad`
- `--frames-map <path>` and `--frames-map-strict`

Goal is filenames like `idle_up_right_000.png` that can be packed into one atlas.

### Mutant ripped multi-atlas workflow (`mutant_ripped`)

This repo includes a workflow for Fallout 2 mutant frames that were grid-split externally (TexturePacker GUI) into individual PNGs.

- Source sheets (reference only):
  - `conversion/base/mutant_sprites/`
- Ripped frames (input to packing):
  - `conversion/base/ripped_sprites_individual_export/`
  - Naming convention: `<base>-<index>.png` (index is 0-based and contiguous per base)
  - Special markers:
    - `single` in the base name means the animation has **1 row** (all directions reuse row 0)
    - `static` in the base name means it is effectively **one frame** (may still have multiple rows)

Build script:

- `conversion/scripts/build_mutant_ripped_atlas.py`

It generates:

- `conversion/out/mutant_ripped/manifest.json` (groups + inferred rows/cols)
- `client/src/anims/MutantRippedAnims.ts` (generated animation definitions)

And when run with `--pack`, it produces a Phaser 3 **multi-atlas**:

- `client/public/assets/character/mutant_ripped.json`
- `client/public/assets/character/mutant_ripped-<n>.png`

If you have `.webp` versions of the atlas pages, you can switch Phaser to load them by changing the `image` fields inside `client/public/assets/character/mutant_ripped.json` from `mutant_ripped-<n>.png` to `mutant_ripped-<n>.webp`.

Packing settings:

- `--algorithm MaxRects`
- `--trim-mode Crop`
- `--disable-rotation`
- `--multipack` (`--max-size 2048`)

Direction row mapping (when 6 rows):

- `NE, E, SE, SW, W, NW` maps to:
  - `up_right, right, down_right, down_left, left, up_left`
- Additional keys are generated as aliases:
  - `up` duplicates `up_left`
  - `down` duplicates `down_left`

Phaser integration:

- Preload: `client/src/scenes/Bootstrap.ts` loads `mutant_ripped` via `load.multiatlas(...)`.
- Animations: `client/src/anims/CharacterAnims.ts` calls `createMutantRippedAnims(anims)`.
- Debug preview: `client/src/components/MutantRippedAnimDebug.tsx` renders a bottom-center `Debug` overlay button.
  - React emits `Event.MUTANT_RIPPED_DEBUG_NEXT_ANIM` via `phaserEvents`.
  - `client/src/scenes/Game.ts` listens, cycles through `mutantRippedAnimKeys`, and emits `Event.MUTANT_RIPPED_DEBUG_CURRENT_ANIM` back so React can display the current key.

- Mutant idle/run override: `client/src/anims/CharacterAnims.ts` overrides the existing `mutant_idle_*` and `mutant_run_*` keys to use frames from the ripped atlas (unarmed idle/walk), while keeping the same keys so networking and movement logic stay compatible.

### Magenta guide interpretation

- `--guide-mode closed` (default): expects closed rectangles around blocks.
- `--guide-mode open`: intended for sheets where only bottom + right vertical guides exist (left can be shared).
- `--guide-mode auto`: tries closed, then falls back.

Open guide-mode is still under active development; if blocks are mis-cropped, expect further tuning.

## DEBUG_MODE (Feb 2026)

A single `DEBUG_MODE` flag in `client/src/config.ts` controls all debug keyboard shortcuts:

- **Currently set to**: `false` (all debug keys disabled)
- **To enable**: Change to `true` in `client/src/config.ts`

### Gated shortcuts

| Key          | Action                         | Location                                         |
| ------------ | ------------------------------ | ------------------------------------------------ |
| `V`          | Toggle VHS post-FX             | `Game.ts` `registerKeys()`                       |
| `Shift+V`    | Toggle VHS half-res            | `Game.ts` `registerKeys()`                       |
| `Ctrl/Cmd+V` | Cycle VHS frame skip           | `Game.ts` `registerKeys()`                       |
| `B`          | Toggle CRT post-FX             | `Game.ts` `registerKeys()`                       |
| `N`          | Toggle Waxy post-FX            | `Game.ts` `registerKeys()`                       |
| `M`          | Toggle TV static debug overlay | `Game.ts` `registerKeys()`                       |
| `T`          | Toggle boombox animation       | `MyPlayer.ts` `update()` (passed from `Game.ts`) |
| `1`          | Play burn animation            | `MyPlayer.ts` `update()` (passed from `Game.ts`) |
| `2`          | Play flamethrower animation    | `MyPlayer.ts` `update()` (passed from `Game.ts`) |
| `3`          | Play punch animation           | `MyPlayer.ts` `update()` (passed from `Game.ts`) |
| `4`          | Play hit animation             | `MyPlayer.ts` `update()` (passed from `Game.ts`) |
| `5`          | Cycle ripped animations        | `Game.ts` `update()`                             |

### How it works

- `Game.ts` imports `DEBUG_MODE` from `client/src/config.ts`
- In `registerKeys()`: V/B/N/M handlers wrapped in `if (DEBUG_MODE)`
- In `update()`: key5 gated with `if (DEBUG_MODE)`, keyT and debugKeys (1-4) only passed to `myPlayer.update()` when `DEBUG_MODE` is true
- `MyPlayer.ts` already handles `keyT` and `debugKeys` as optional parameters — when `undefined` is passed, the handlers are skipped

## MyRoom — Japanese Bedroom (Feb 2026)

A cozy PSX-style Japanese bedroom room type. Personal room with no DJ booth — focused on atmosphere and decoration.

### Architecture

- **RoomType**: `MYROOM = 'myroom'` in `types/Rooms.ts`
- **Server**: Registered in `server/src/index.ts` using `ClubMutant` class with `isPublic: false`
- **Client routing**: `GameScene.tsx` renders `<JapaneseRoom>` when `roomType === 'myroom'`, otherwise `<Room>`
- **Lobby**: "My Room" button in `LobbyScreen.tsx` Screen 2 room select

### Room Layout

- Small cozy bedroom: `ROOM_W=7, ROOM_D=6, WALL_HEIGHT=2.6`
- Walls: `StripedWallMaterial` (procedural vertical stripes, darkened for nighttime)
- Floor: `TatamiFloorMaterial` (procedural herringbone tatami, darkened for nighttime)
- Back wall: `OceanWindow` with `OceanViewMaterial` (moonlit nighttime ocean shader) + wooden shelf with trophies
- Front wall: Shoji door (GLB)
- Furniture: futon (right wall), low computer desk + pink egg computer (left wall), low table with flower vase (center), zabuton cushions, toy car, candles (3x), hanging ceiling lamp

### Custom Shaders

| Shader | File | Description |
|--------|------|-------------|
| `TatamiFloorMaterial` | `src/shaders/TatamiFloorMaterial.tsx` | Procedural herringbone tatami with woven grain, dark nighttime colors |
| `StripedWallMaterial` | `src/shaders/StripedWallMaterial.tsx` | Vertical stripe wallpaper with `uOpacity` for wall occlusion, dark red/gray |
| `OceanViewMaterial` | `src/shaders/OceanViewMaterial.tsx` | Animated moonlit ocean with stars, moon, mountain silhouettes |
| `NightSky` | `src/shaders/NightSky.tsx` | Dark blue-purple sky with twinkling stars, faint clouds, dusk horizon glow |

### Lighting

Nighttime atmosphere with warm point lights:
- Very dim ambient (`0.08`, purple tint `#332244`)
- Hanging ceiling lamp as main warm light source (intensity 1.2)
- 3 candle point lights (orange, intensity 0.4–0.6)
- Computer screen glow (purple-pink, intensity 0.3)
- Faint moonlight from window (cool blue, intensity 0.15)

**Important**: Wall and floor materials are custom shaders that output color directly via `gl_FragColor` — they do NOT respond to Three.js scene lights. To darken/lighten the room, you must change the base color values inside the shader source code, not the light intensities.

### Retro Computer (pink egg iMac)

Cute bisected-sphere computer with pink/purple shell (`#cc66aa`), purple-glowing screen (`emissive: #cc88ff`), keyboard with key rows, hockey puck mouse. Built with `hemisphereGeometry()` helper in `build-models.mjs`. Clickable via `InteractableObject` → opens `ComputerBrowser`.

### Collision

Room-type-aware collision in `usePlayerInput.ts`:
- `getCollisionBoxes()` returns `MYROOM_COLLISION_BOXES` or `CLUB_COLLISION_BOXES` based on `roomType`
- `getRoomBounds()` returns `{halfX: 330, halfY: 280}` for myroom vs `{halfX: 580, halfY: 580}` for club
- Collision boxes for: desk, shelf, low table, futon

### Key Files

| File | Purpose |
|------|---------|
| `types/Rooms.ts` | `MYROOM` enum value |
| `server/src/index.ts` | Room registration |
| `client-3d/src/scene/JapaneseRoom.tsx` | Main room component |
| `client-3d/src/scene/GameScene.tsx` | Scene routing |
| `client-3d/src/shaders/NightSky.tsx` | Nighttime skybox shader |
| `client-3d/src/shaders/TatamiFloorMaterial.tsx` | Floor shader |
| `client-3d/src/shaders/StripedWallMaterial.tsx` | Wall shader |
| `client-3d/src/shaders/OceanViewMaterial.tsx` | Window view shader |
| `client-3d/src/input/usePlayerInput.ts` | Room-type-aware collision |
| `client-3d/src/network/NetworkManager.ts` | `joinMyRoom()` method |
| `client-3d/src/stores/gameStore.ts` | `roomType` includes `'myroom'` |
| `scripts/build-models.mjs` | All Japanese room GLB model builders |

## Jukebox Room — Vintage 50s Diner (Feb 2026)

A PSX-style vintage diner room type with a shared jukebox playlist. Unlike the DJ queue system (round-robin, per-DJ queues), the jukebox mode has a single shared playlist where any player can add tracks and anyone can control playback.

### Music Mode Architecture

Rooms now have a `musicMode` property that determines which music system is used:

| Mode | Description | Used by |
|------|-------------|---------|
| `djqueue` | Round-robin DJ queue with per-DJ playlists (default) | Public room, custom rooms |
| `jukebox` | Shared room playlist, any player can add/play/skip | Jukebox room, custom rooms |
| `personal` | No shared music (future) | MyRoom |

- **Type**: `MusicMode = 'djqueue' | 'jukebox' | 'personal'` in `types/Rooms.ts`
- **Server**: `IRoomData.musicMode` passed at room creation, stored on `ClubMutant.musicMode`
- **Client**: `gameStore.musicMode` set on room join, drives UI branching in DjQueuePanel and NowPlaying

### Room Layout

- 9×9 world unit room with `WALL_HEIGHT=3.0`
- **Floor**: Black & white checkerboard (procedural GLSL shader, 12×12 tiles with grout lines)
- **Walls**: Deep burgundy wainscoting (lower 42%) + brass/gold rail band + dark wine/maroon upper (procedural GLSL `dinerWallFrag`)
- **Ceiling**: Dark warm tone (`#1c1008`)
- **Skybox**: `NightSky` (dark dusk with stars)
- **Furniture**:
  - Jukebox machine (left wall) — clickable via `InteractableObject`, opens DjQueuePanel
  - Counter with stools along right wall
  - Two booth benches against left wall
  - Wall decorations: `DinerPoster` (framed posters with accent colors) and `WallRecord` (vinyl records) on all walls
  - Neon "OPEN" sign above front wall
- **Stage** (front wall):
  - Raised platform (`JUKEBOX_STAGE_HEIGHT=0.3` world units) with wood top
  - Mic stand (pole + boom arm + capsule + grille + tripod legs)
  - Two spotlight rigs (hanging can lights with colored cones)
  - Edge trim and steps
  - **Walkable**: Players step up onto the stage surface via `getFloorHeight()` in PlayerEntity

### Stage Walkability

The stage is a raised platform that players walk on top of, not collide against:

- `JukeboxRoom.tsx` exports stage bounds: `JUKEBOX_STAGE_X_MIN/MAX`, `JUKEBOX_STAGE_Z_MIN/MAX`, `JUKEBOX_STAGE_HEIGHT`
- `PlayerEntity.tsx` has `getFloorHeight(worldX, worldZ)` that returns `JUKEBOX_STAGE_HEIGHT + rippleY` when the player is within stage bounds, otherwise just `rippleY`
- Stage platform uses separate side planes (with `depthWrite`) + a top surface with `depthWrite={false}` so characters standing on it aren't clipped by the depth buffer

### Jukebox Server Commands

All jukebox messages are defined in `types/Messages.ts` and handled in `server/src/rooms/commands/JukeboxCommand.ts`:

| Message | Command | Description |
|---------|---------|-------------|
| `JUKEBOX_ADD` | `JukeboxAddCommand` | Add track to shared playlist (validates title/link, prefetches video) |
| `JUKEBOX_REMOVE` | `JukeboxRemoveCommand` | Remove own track (only adder can remove); if removing playing track, auto-advances |
| `JUKEBOX_PLAY` | `JukeboxPlayCommand` | Start playback (any player); no-op if already playing |
| `JUKEBOX_STOP` | `JukeboxStopCommand` | Stop playback, keep tracks (any player) |
| `JUKEBOX_SKIP` | `JukeboxSkipCommand` | Skip + remove current track, auto-advance (any player) |
| `JUKEBOX_TRACK_COMPLETE` | `JukeboxTrackCompleteCommand` | Track ended naturally; removes it, plays next (streamId dedup) |

Key difference from DJ queue: tracks are **destructively removed** after playing (not marked as "played"), and there is no per-player queue — it's one shared `ArraySchema<JukeboxItem>`.

### Schema

- `OfficeState.jukeboxPlaylist`: `ArraySchema<JukeboxItem>` — synced to all clients via Colyseus schema
- `JukeboxItem`: Schema class with `id`, `title`, `link`, `duration`, `addedBySessionId`, `addedByName`, `addedAtMs`
- `JukeboxItemDto`: Plain DTO in `types/Dtos.ts` for client-side typing

### Client UI

- **DjQueuePanel** (`src/ui/DjQueuePanel.tsx`): Detects `musicMode === 'jukebox'` and shows jukebox-specific UI:
  - Shared playlist view (all players' tracks in one list)
  - Each track shows who added it + remove button (own tracks only)
  - YouTube search + link paste to add tracks
  - Play/Stop/Skip controls visible to all (not just DJ)
- **NowPlaying** (`src/ui/NowPlaying.tsx`): Jukebox mode shows track title + elapsed/total time + Play/Stop/Skip buttons for all players
- **jukeboxStore** (`src/stores/jukeboxStore.ts`): Zustand store synced from server schema via `onAdd`/`onRemove` callbacks

### Custom Shaders (inline in JukeboxRoom.tsx)

| Shader | Description |
|--------|-------------|
| `checkerFrag` | Black/white checkerboard floor, 12×12 tiles with grout lines, subtle center sheen |
| `dinerWallFrag` | Deep burgundy wainscoting (lower 42%) + brass rail + dark wine upper + dark baseboard, `uOpacity` for wall occlusion |

### Wall Occlusion

Same raycaster-based system as other rooms with full attachment support:
- Wall material `uOpacity` uniform + `depthWrite` toggle
- Attachment traversal: `opacity`, `depthWrite`, `side` (DoubleSide when faded), `emissiveIntensity` scaling
- Front wall rotated 180° (`rotation=[0, Math.PI, 0]`) so normal faces inward (required for FrontSide raycasting)

### Collision

Room-type-aware in `usePlayerInput.ts`:
- `isJukeboxScene()` checks `roomType === 'jukebox'` or `roomType === 'custom' && musicMode === 'jukebox'`
- `JUKEBOX_COLLISION_BOXES`: jukebox machine box + counter box (no stage collision — walkable)
- `JUKEBOX_HALF = 430` (9 × 100 / 2 - 20 padding)

### Key Files

| File | Purpose |
|------|---------|
| `types/Rooms.ts` | `JUKEBOX` enum + `MusicMode` type |
| `types/Messages.ts` | `JUKEBOX_*` message enums |
| `types/Dtos.ts` | `JukeboxItemDto` |
| `server/src/index.ts` | Jukebox room registration |
| `server/src/rooms/ClubMutant.ts` | Jukebox message handlers + `musicMode` storage |
| `server/src/rooms/schema/OfficeState.ts` | `JukeboxItem` schema + `jukeboxPlaylist` on `OfficeState` |
| `server/src/rooms/commands/JukeboxCommand.ts` | All jukebox commands |
| `client-3d/src/scene/JukeboxRoom.tsx` | Full diner scene (1140 lines) |
| `client-3d/src/scene/GameScene.tsx` | Routes to `<JukeboxRoom>` for jukebox/custom+jukebox rooms |
| `client-3d/src/scene/PlayerEntity.tsx` | `getFloorHeight()` for walkable stage |
| `client-3d/src/stores/jukeboxStore.ts` | Client-side jukebox playlist state |
| `client-3d/src/network/NetworkManager.ts` | `joinJukeboxRoom()` + jukebox schema sync |
| `client-3d/src/ui/DjQueuePanel.tsx` | Jukebox mode playlist UI |
| `client-3d/src/ui/NowPlaying.tsx` | Jukebox mode mini player |
| `client-3d/src/ui/LobbyScreen.tsx` | "Jukebox" room option in lobby |
| `client-3d/src/ui/CreateRoomForm.tsx` | Music mode selector for custom rooms |
| `client-3d/src/input/usePlayerInput.ts` | Jukebox room collision boxes |

## Lily NPC Bartender — Jukebox Room (Feb 2026)

A server-side AI bartender NPC named Lily who lives in the Jukebox Room. She's a shy alien flower being who tends bar and chats with players via Gemini 2.5 Flash-Lite API through the dream-npc-go microservice.

### Architecture

```
┌──────────────────────────────────────────┐
│  server (Colyseus)                       │
│    ClubMutant.ts                         │
│    - Virtual Player (NPC_SESSION_ID)     │
│    - FSM: idle/walking/dancing/conversing│
│    - Chat routing + chunked delivery     │
│    - Conversational window (20s)         │
│    - Spontaneous music commentary        │
│              │ HTTP POST                 │
│              ▼                           │
│  ┌────────────────────────────────────┐  │
│  │  dream-npc-go (Express 4, port 4000) │  │
│  │  POST /bartender/npc-chat         │  │
│  │  Gemini 2.5 Flash-Lite            │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### Server-Side NPC (`ClubMutant.ts`)

- **Virtual Player**: Created with reserved `sessionId = 'npc_lily'`, spawns as a `Player` in the Colyseus state. Uses `PaperDoll` character at `/npc/denkiqt`.
- **FSM States**: `idle` (3-8s timer) → `walking` (60px/s within wander bounds) → `dancing` (when music plays) → `conversing` (15s timeout after chat).
- **Wander Bounds**: Behind the bar island (`minX:290, maxX:410, minY:10, maxY:280` server px).
- **Update Interval**: 200ms tick via `setInterval`.

### Chat Routing

Messages route to Lily via three triggers (checked in `ADD_CHAT_MESSAGE` handler):

1. **Name prefix**: Message starts with `lily,` or `lily ` (case-insensitive regex)
2. **Alone with NPC**: `getHumanPlayerCount() === 1`
3. **Conversational window**: Player recently talked to Lily (within 20s)

The conversational window (`npcConversationWindows: Map<string, number>`) tracks per-player timestamps. After Lily responds to a player, their messages auto-route to her for `NPC_CONVO_WINDOW_MS = 20_000` ms without needing the "Lily" prefix. Window resets on each exchange and cleans up in `onLeave()` and `cleanupNpc()`.

### Chunked Response Delivery

AI responses are split into sentence chunks and delivered with staggered delays to avoid bubble overlap:

- **Splitting**: Regex on `.!?…` sentence boundaries via `splitIntoChunks()`
- **Delay formula**: `4000 + len * 55` ms per chunk, clamped 4s-7s (`chunkDelay()`)
- **Queue**: `npcResponseQueue` drained by `setTimeout` chain. First chunk sent immediately.
- **Interruption**: New player message calls `stopDrainingNpcQueue()` — clears pending chunks.
- **History**: Full text stored in `npcChatHistory` (not chunks) for coherent AI context.

### Music Awareness

- **Always explicit**: Music context always sent to AI — either `Currently playing: "title"` or `No music is playing right now. The bar is quiet.` Prevents false music references.
- **Spontaneous commentary**: `notifyNpcMusicStarted(title)` called from `playNextJukeboxTrack()` in `JukeboxCommand.ts`. 30% chance, 2-5s delay. Sends system-tagged prompt for brief reaction.
- **Song knowledge**: Prompt includes specific song titles for Denki Groove, Cornelius, YMO, Aphex Twin, Nujabes, etc. When asked what to play, suggests specific tracks.
- **Silence nudge**: After 2 minutes with no music and humans present, Lily suggests someone play something. Repeats every 3 minutes while quiet. Tracked via `npcMusicSilenceSince` / `npcLastMusicSilenceCheck`.

### Overwhelm Behavior

Lily is a small being — she can't handle too many people talking at once:

- **Tracking**: `npcRecentChatters[]` records `{ sessionId, at }` with a 30-second sliding window.
- **Trigger**: If >3 unique players have chatted in the last 30s, Lily announces she needs a break.
- **Cooldown**: `npcOverwhelmedUntil` set to `now + 30_000` — she silently ignores all messages for 30s.
- **Recovery**: After 30s, the chatter list resets and she responds normally again.
- **Phrases**: 4 overwhelm-specific phrases ("too many voices at once...", "I need a little break...").

### Greeting System

- **On player join**: Random greeting from `npcGreetings[]` after 1.5-3s delay, rate-limited to 1 per 15s.
- **Greetings teach mechanic**: All greetings mention "say my name" / "call me by name" so players learn how to talk to her.

### Dream-NPC Service (`POST /bartender/npc-chat`)

- **Endpoint**: `services/dream-npc-go/src/index.ts` registers `/bartender/npc-chat` alongside the existing `/dream/npc-chat`.
- **Request**: `{ personalityId, message, history, roomId, senderName, musicContext }`
- **Response**: `{ text, behavior? }` — same format as dream NPC chat.
- **Personality**: `lily_bartender` in `dreamNpc.ts` — system prompt with backstory, music knowledge, rules, multi-player attribution format.
- **Rate limiting**: Same per-session limits as dream NPCs (6/min, 60/hr, 200/day).
- **Caching**: Skipped when music is playing (contextual). Active when bar is quiet.
- **Fallback phrases**: 18 in-character phrases used when API fails. No unicode emoji.

### Bar Layout (Jukebox Room)

- **BarIsland**: `H=0.38`, retro pastel colors with emissive materials (pink, mint, yellow, lavender). Front faces -X (room center). Chrome strip accent, flower vase.
- **BackShelf**: Cream/light wood frame, candy-bright bottles (emerald, ruby, gold, cobalt, amethyst). Rotated `[0, -Math.PI/2, 0]` against right wall.
- **CounterStools**: Small pastel pink seats (`#ffc1d3`, radius 0.13) at `Y=0.28`, chrome bases, positioned at X=1.5. Each stool has its own collision box.
- **Collision**: `JB_BAR_ISLAND_BOX` (bar island + bartender area) + 3 `JB_STOOL_BOX` boxes in `usePlayerInput.ts`.

### Chat Bubble Fade-Out

- **Duration**: `FADE_MS = 400` ms (fast exit, was 800ms)
- **Scale**: Shrinks to 70% (not 0) for subtler visual
- **Opacity**: Per-bubble material clone with opacity fade + troika `fillOpacity` fade
- **Cleanup**: Material disposed on unmount

### Key Files

| File | Purpose |
|------|---------|
| `server/src/rooms/ClubMutant.ts` | NPC spawn, FSM, chat routing, conversational window, chunked delivery, music commentary |
| `server/src/rooms/commands/JukeboxCommand.ts` | `notifyNpcMusicStarted()` hook in `playNextJukeboxTrack()` |
| `services/dream-npc-go/src/dreamNpc.ts` | Lily personality, Gemini API, rate limiting, caching, fallbacks |
| `services/dream-npc-go/src/index.ts` | `/bartender/npc-chat` endpoint registration |
| `client-3d/public/npc/denkiqt/` | Lily's PaperDoll character assets (manifest + PNGs) |
| `client-3d/src/scene/JukeboxRoom.tsx` | BarIsland, BackShelf, CounterStool, bar lighting |
| `client-3d/src/scene/PlayerEntity.tsx` | Bubble fade-out animation (FADE_MS, per-bubble opacity) |
| `client-3d/src/scene/GameScene.tsx` | NPC character path routing |
| `client-3d/src/input/usePlayerInput.ts` | Bar island collision box |
| `server/src/rooms/schema/OfficeState.ts` | `Player.isNpc` schema field |

## Dream Mode — Yume Nikki-Inspired Exploration (Feb 2026)

A Yume Nikki-inspired dream mode where players sleep on the futon in MyRoom and enter surreal dream worlds. Implemented as a **separate Phaser 3 Vite app** (`client-dream/`) embedded via fullscreen iframe, with freeform AI NPC chat powered by Gemini 2.5 Flash-Lite.

### Architecture

```
┌────────────────────────────────────────────────────────┐
│  client-3d (r3f)                                       │
│    App.tsx renders <DreamIframe /> when isDreaming      │
│    SleepPrompt / WakePrompt in MyRoom                  │
│                     │ postMessage                      │
│                     ▼                                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  client-dream (Phaser 3)      ← port 5176       │  │
│  │    BootScene → DreamScene                        │  │
│  │    DreamPlayer + NPCs + Collectibles             │  │
│  │    React overlay: DreamChatPanel, DreamHUD       │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
                     │                      │
                     ▼                      ▼
┌────────────────────────────────┐ ┌────────────────────────────────┐
│  server (Colyseus)             │ │  dream-npc-go (Express 4)         │
│    Colyseus: DREAM_SLEEP/WAKE/ │ │    POST /dream/npc-chat        │
│    COLLECT messages             │ │    ← Gemini 2.5 Flash-Lite    │
│    Port 2567                   │ │    Port 4000                   │
└────────────────────────────────┘ └────────────────────────────────┘
```

### Iframe Bridge Protocol

Five message types flow between client-3d and client-dream via `postMessage`:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `DREAM_READY` | dream → 3d | Phaser app loaded, ready for init data |
| `DREAM_INIT` | 3d → dream | Send playerName, collectedItems, serverHttpUrl |
| `DREAM_COLLECT` | dream → 3d | Player picked up a collectible |
| `DREAM_WAKE` | dream → 3d | Player wants to wake up (shows WakePrompt) |
| `DREAM_WAKE_CONFIRMED` | 3d → dream | Wake confirmed, tear down |

**Flow**: SleepPrompt confirms → `isDreaming = true` → `<DreamIframe>` mounts (z-index 50) → iframe loads → `DREAM_READY` → parent sends `DREAM_INIT` → Phaser initializes → player explores → `DREAM_WAKE` → WakePrompt → confirmed → iframe unmounts.

**Production**: Build dream app → copy `client-dream/dist/` into `client-3d/public/dream/` → iframe src becomes `/dream/index.html` (same origin, no CORS).

### client-dream/ App Structure

```
client-dream/
  src/
    main.tsx                # React root
    App.tsx                 # Phaser container + chat overlay + HUD
    bridge/
      bridgeTypes.ts        # Message types + sendToParent helper
      iframeBridge.ts       # postMessage listener, sends DREAM_READY
    phaser/
      config.ts             # Phaser.AUTO, 800x600, pixelArt, RESIZE scale
      scenes/
        BootScene.ts        # Preload mutant_ripped multi-atlas + world JSONs
        DreamScene.ts       # Main scene: tile rendering, player, NPCs, collectibles, transitions
      entities/
        DreamPlayer.ts      # 8-dir continuous movement (120px/s), collision, wall sliding
        NPC.ts              # Mutant sprite + FSM + proximity greeting + chat bubbles
        Collectible.ts      # Animated glow circle pickup, persists via bridge
      systems/
        NpcBehavior.ts      # FSM: idle, wander, face_player, conversing, following, fleeing
      anims/
        DreamAnims.ts       # Register mutant idle (4f) + walk (8f) for 8 directions
      types.ts              # DreamWorldDef, DreamExit, DreamNPCDef, DreamCollectible
    npc/
      npcService.ts         # HTTP client: POST /dream/npc-chat, 2s debounce, 8s timeout
      npcPersonalities.ts   # Client-side greeting pools + fallback phrases per NPC
    ui/
      DreamChatPanel.tsx    # Chat input + message display (frosted glass, monospace)
      DreamHUD.tsx          # Wake button, collectible count, world name
    stores/
      dreamChatStore.ts     # Zustand: activeNpcId, messageHistory (last 20), bubbles, thinking
      dreamClientStore.ts   # Zustand: initialized, playerName, serverHttpUrl, collectedItems, currentWorldId
  public/
    assets/character/       # mutant_ripped multi-atlas (3 PNG pages + JSON)
    data/worlds/            # nexus.json, forest.json
```

### World Data Format

World JSONs define tile maps with palette-based coloring (no tileset images — shaders will replace them):

```typescript
interface DreamWorldDef {
  id: string
  width: number; height: number; tileSize: number
  spawnX: number; spawnY: number
  palette: {
    floor: string      // e.g. "#1a0a2e" (dark purple)
    wall: string       // e.g. "#0a0a0a" (near black)
    path: string       // e.g. "#2a1a3e" (lighter purple)
    exit: string       // e.g. "#00ff88" (bright glow)
    noiseBase: string  // noise tint color
    noiseDrift: string // noise color drift target
  }
  layers: DreamWorldLayer[]  // ground + collision (tile data arrays)
  exits: DreamExit[]         // { x, y, targetWorldId, spawnX, spawnY }
  collectibles: DreamCollectible[]  // { id, x, y }
  npcs: DreamNPCDef[]        // { id, personalityId, name, spawnX, spawnY, wanderRadius, interactRadius, stationary }
}
```

**Current worlds**:
- **Nexus** (`nexus.json`): 15×15, dark purple/teal palette, The Watcher NPC (stationary), exit to forest at (7,1), wake exit at (7,12)
- **Forest** (`forest.json`): 30×22, dark green palette, The Drifter NPC (wanders), static_flower collectible at (24,6), exit back to nexus at (1,10)

### NPC System — Freeform Chat

**No dialogue trees.** Players type freely in a chat input. Messages appear as chat bubbles above sprites — identical UX to chatting with other players. NPC responses come from the AI API.

**NPC behavior (100% client-side, no API needed)**:
- **FSM states**: idle (3-8s timer) → wander (60px/s, half player speed) → face_player (on proximity) → conversing (on chat) → following (AI-triggered, 8s) → fleeing (AI-triggered, 3s)
- **Greetings**: Random selection from client-side pool when player enters interact radius (no API call)
- **External behavior triggers**: AI response can include `behavior` field (`"follow"`, `"flee"`, `"wander"`, `"idle"`, `"turn_to_player"`) to change NPC movement

**Chat data flow**:
1. Player types in `DreamChatPanel` → player bubble appears (immediate)
2. NPC shows "..." thinking bubble (immediate)
3. `npcService.chatWithNpc()` → `POST /dream/npc-chat` to dream-npc-go service
4. Dream-npc service: rate limit → cache check → Gemini API → parse response
5. NPC bubble with response text + optional behavior change

### Dream NPC Service — `POST /dream/npc-chat`

**Service**: `services/dream-npc-go/` (standalone Express 4 microservice, port 4000)
**Files**: `src/index.ts` (server + CORS), `src/dreamNpc.ts` (handler + personalities)

Separated from the Colyseus server to avoid uWebSockets transport conflicts with Express middleware. Handles NPC chat with model-agnostic architecture (currently Gemini 2.5 Flash-Lite, swappable to self-hosted Ollama later).

**Request**: `{ personalityId, message, history: [{ role, content }] }`
**Response**: `{ text, behavior? }` or `{ error, retryAfterMs? }`

**Personality configs** (server-side only — prevents client seeing spoilers):
- System prompt with backstory, knowledge of secrets/collectibles, lore fragments
- Greetings pool (used client-side, duplicated for fallback)
- Fallback phrases (used when API fails)

**Current NPCs**:
- **The Watcher** (Nexus): Knows about the forest's hidden flower, the humming tile, the self-referencing door. Speaks in present tense about future events.
- **The Drifter** (Forest): Former dreamer who followed a sound into the trees. Knows about the static flower, the path that loops, the clearing where silence is loud.

**Rate limiting** (in-memory, keyed by IP hash):
- Per-session: 6/min, 60/hr, 200/day
- Global: 30/min, 500/hr, 5,000/day
- Returns HTTP 429 with `retryAfterMs`

**Response caching**: Exact-match on normalized `(personalityId + message)`. Normalization: lowercase, strip punctuation, collapse whitespace. TTL 1hr, max 500 entries (LRU).

**Response parsing** (4-tier fallback):
1. Direct `JSON.parse(response)`
2. Extract `{...}` from surrounding text via regex
3. Use raw text if ≤ 100 chars
4. Random phrase from personality's fallback pool

**Graceful degradation**:
- Normal (< 3s): player bubble → "..." → NPC response
- Slow (3-8s): "..." stays longer
- Timeout (> 8s): random fallback phrase from server pool
- Server down: random phrase from client-side generic pool (bundled, ~20 phrases)

**Environment**: Requires `GEMINI_API_KEY` env var.

### AI Model Strategy

**Phase 1 (current)**: Gemini 2.5 Flash-Lite API
- ~$0.000074 per turn, ~0.5s latency
- Monthly cost at 500 msg/day: ~$1.11
- Free tier: 1,000 requests/day

**Phase 2 (future)**: Self-hosted LFM2.5-1.2B via Ollama on Hetzner CX32
- 731 MB Q4_K_M quantization, ~€7.88/mo fixed
- ~2-3s per response on 4-core shared CPU
- Makes sense above ~3,000-5,000 messages/day

The service abstracts the model backend — swapping from API to Ollama requires changing only `services/dream-npc-go/src/dreamNpc.ts`, not client code.

### NPC System Prompt Structure

**Shared prefix** (all NPCs): "You are a being in a dream..." + rules (1-2 sentences, max 80 chars, speak in fragments/riddles, never break character, never use emoji, give cryptic clues about real locations/collectibles).

**Response format**: `{"text":"your words"}` with optional `{"text":"words","behavior":"follow"}`.

### 3D Client Integration

**`DreamIframe.tsx`** (`client-3d/src/ui/DreamIframe.tsx`): Fullscreen iframe overlay modeled on `ComputerBrowser.tsx`. Dev URL: `http://localhost:5176`, prod URL: `/dream/index.html`. Handles `DREAM_READY`, `DREAM_COLLECT`, `DREAM_WAKE` messages from iframe.

**`dreamStore.ts`** (`client-3d/src/dream/dreamStore.ts`): Simplified to just `isDreaming` flag + `collectedItems` Set + `enterDream()`/`exitDream()`/`addCollectedItem()`. All game state is managed inside the Phaser iframe.

**`dreamBridgeTypes.ts`** (`client-3d/src/dream/dreamBridgeTypes.ts`): Type definitions for the postMessage bridge.

**Removed files** (replaced by Phaser iframe):
- `client-3d/src/dream/DreamRenderer.tsx`
- `client-3d/src/dream/DreamTileGrid.tsx`
- `client-3d/src/dream/DreamPlayer.tsx`
- `client-3d/src/dream/dreamMovement.ts`

### Key Files

| File | Purpose |
|------|---------|
| `client-dream/src/phaser/scenes/DreamScene.ts` | Main Phaser scene (tiles, player, NPCs, collectibles, transitions) |
| `client-dream/src/phaser/entities/DreamPlayer.ts` | 8-dir movement, collision, wall sliding |
| `client-dream/src/phaser/entities/NPC.ts` | NPC sprite + FSM + greeting + chat bubbles |
| `client-dream/src/phaser/entities/Collectible.ts` | Animated glow pickup |
| `client-dream/src/phaser/systems/NpcBehavior.ts` | FSM: idle/wander/face_player/conversing/following/fleeing |
| `client-dream/src/bridge/bridgeTypes.ts` | Bridge message types + sendToParent |
| `client-dream/src/bridge/iframeBridge.ts` | postMessage handler, sends DREAM_READY |
| `client-dream/src/npc/npcService.ts` | HTTP client for /dream/npc-chat |
| `client-dream/src/npc/npcPersonalities.ts` | Client-side greeting pools per NPC |
| `client-dream/src/stores/dreamChatStore.ts` | Chat state: active NPC, messages, thinking |
| `client-dream/src/stores/dreamClientStore.ts` | Game state: collected items, world, init |
| `client-dream/src/ui/DreamChatPanel.tsx` | Chat input + message overlay |
| `client-dream/src/ui/DreamHUD.tsx` | Wake button, collectible count |
| `client-dream/public/data/worlds/nexus.json` | Nexus world definition |
| `client-dream/public/data/worlds/forest.json` | Forest world definition |
| `client-3d/src/ui/DreamIframe.tsx` | Fullscreen iframe overlay + bridge |
| `client-3d/src/dream/dreamStore.ts` | Simplified isDreaming + collectedItems |
| `client-3d/src/dream/dreamBridgeTypes.ts` | Bridge type definitions |
| `services/dream-npc-go/src/index.ts` | Dream NPC Express server (port 4000, CORS) |
| `services/dream-npc-go/src/dreamNpc.ts` | NPC chat: rate limiting, caching, Gemini API, personalities |

### How to Test Dream Mode

1. `cd server && npm run start` (port 2567)
2. `cd services/dream-npc-go && GEMINI_API_KEY=... npm start` (port 4000)
3. `cd client-3d && pnpm dev` (port 5175)
4. `cd client-dream && pnpm dev` (port 5176)
4. Join MyRoom from lobby
5. Walk to futon, click → SleepPrompt appears
6. Confirm → fullscreen dream iframe loads
7. Walk with WASD in Nexus
8. Walk near The Watcher → greeting bubble appears
9. Chat input appears → type message → NPC responds with cryptic bubble
10. Step on exit tile → fade → Forest loads
11. Walk over collectible → pickup animation
12. Click wake button → WakePrompt → back in MyRoom

### Implementation Phases

**Phase 1** (current — core scaffolding complete):
- Phaser app + iframe bridge + world transitions + NPC chat + collectibles

**Phase 2** (pending):
- Shader backgrounds (port TV static noise to Phaser WebGL pipeline, per-world palette)
- Combat system (turn-based using existing attack/death anims)
- More NPCs with distinct personalities and lore
- Additional dream worlds
- Sound effects and ambient audio
- VHS-style CSS filter on iframe
- Self-hosted Ollama migration

**Phase 3** (future):
- Activity-aware AI context (songs listened to → NPC references them)
- Collectible effects (unlock Nexus doors, new NPC dialogue)
- NPC memory across sessions
- Shared dreams (multiplayer dream exploration)

## Current tasks

- ~~Implement DJ Queue Rotation System~~ ✅ COMPLETED (Feb 2026)
- ~~Stabilize legacy music booth/music stream code~~ ✅ COMPLETED - DJ Queue replaces legacy system
- ~~DJ Queue inline playlist picker~~ ✅ COMPLETED → merged into unified MyPlaylistPanel (Feb 2026)
- ~~Remove expanded player view, simplify to mini bar only~~ ✅ COMPLETED (Feb 2026)
- ~~Play/Stop controls (replace play/pause, remove prev button, add DJ_STOP broadcast)~~ ✅ COMPLETED (Feb 2026)
- ~~Tabbed DJ Queue/My Playlists interface in MyPlaylistPanel~~ ✅ COMPLETED (Feb 2026)
- ~~Add-all-tracks button per playlist when in DJ queue~~ ✅ COMPLETED (Feb 2026)
- ~~Fix track #1 disabling (only when actually streaming)~~ ✅ COMPLETED (Feb 2026)
- ~~Dynamic CD button positioning (top-left when no mini player)~~ ✅ COMPLETED (Feb 2026)
- ~~Fix DJ queue: music keeps playing when DJ leaves~~ ✅ COMPLETED (Feb 2026)
- ~~Fix player spawn slide~~ ✅ COMPLETED (Feb 2026)
- ~~Animated skybox: increase cloud drift speed~~ ✅ COMPLETED (Feb 2026)
- ~~Cursor change on hover over interactable objects~~ ✅ COMPLETED (Feb 2026)
- ~~UI overhaul: match 2D client playlist/DJ panel layout~~ ✅ COMPLETED (Feb 2026)
- ~~Fix DJ rotation: next DJ's queue doesn't auto-play after current song finishes~~ ✅ COMPLETED (Feb 2026)
- ~~Redesign NowPlaying mini player~~ ✅ COMPLETED (Feb 2026)
- ~~Fix DJ booth overlap: position 2 DJs left/right, 1 DJ center; widen desk~~ ✅ COMPLETED (Feb 2026)
- ~~Editor: rename export to manifest.json, update char 3 manifest, add scale tracks to presets~~ ✅ COMPLETED (Feb 2026)
- ~~Add new character (default3/Mutant) to lobby select + GameScene texture map~~ ✅ COMPLETED (Feb 2026)
- ~~Fix: NowPlaying shows 'untitled' + time when no DJ/track; characters dance when no music~~ ✅ COMPLETED (Feb 2026)
- ~~Switch Netlify deployment from 2D client to 3D client~~ ✅ COMPLETED (Feb 2026)
- ~~3D chat bubbles (replace HTML overlay with Three.js geometry + troika text)~~ ✅ COMPLETED (Feb 2026)
- ~~Layer-based VHS rendering (layer 0 scene + VHS, layer 1 UI rendered clean)~~ ✅ COMPLETED (Feb 2026)
- ~~PaperDoll layout metrics (headTopY, visualTopY) for smart chat bubble positioning~~ ✅ COMPLETED (Feb 2026)
- ~~Editor multi-select + batch parent/bone role assignment~~ ✅ COMPLETED (Feb 2026)
- ~~**Performance & Sync Audit**~~ ✅ COMPLETED (Feb 2026) — see `docs/performance-sync-audit.md` for full findings
  - ~~A1: Remove legacy schema fields~~ ✅
  - ~~A2: Remove roomQueuePlaylist from schema (server-only plain array)~~ ✅
  - ~~A3: Fix IOfficeState drift~~ ✅
  - ~~A5: DRY playTrackForCurrentDJ helper~~ ✅
  - ~~B1: Client-server clock sync (TimeSync)~~ ✅
  - ~~B2: Server-side track duration watchdog~~ ✅
  - ~~B3: Use streamId for dedup~~ ✅
  - ~~B4: Fix late-join race condition (TimeSync.onReady + DJ queue schema sync)~~ ✅
  - ~~B5: Guard handleEnded~~ ✅
  - ~~C1: Player positions via mutable refs (bypass React state)~~ ✅
  - ~~C3: Replace Html nametags with troika Text on layer 1~~ ✅
  - ~~C4: Optimize VHS bloom (half-res RT + 16 taps, ~16x reduction)~~ ✅
  - ~~C5: Pre-alloc wall occlusion vector~~ ✅
  - ~~C6: Fix SingleBubble useEffect deps~~ ✅
  - ~~C7: Granular music store selectors in App.tsx~~ ✅
- ~~Fix DJ queue: playback timer runs indefinitely after last track; can't add tracks after stop; miniplayer disappears~~ ✅ COMPLETED (Feb 2026)
- ~~Remove DJ username from NowPlaying mini player title (show track title only)~~ ✅ COMPLETED (Feb 2026)
- ~~Lobby screen: character carousel with full-body preview + idle animation + WebGL checkerboard bg~~ ✅ COMPLETED (Feb 2026)
- ~~Lobby carousel rewrite: r3f TurntableCarousel with PaperDoll characters + walk anims + speech bubbles~~ ✅ COMPLETED (Feb 2026)
- ~~Lobby carousel performance optimizations (single Canvas, distortion skip, geometry cache, ref-based state, double-fetch elimination)~~ ✅ COMPLETED (Feb 2026)
- ~~Custom room system: two-screen lobby flow, room browser/create, CharacterSidePreview, textureId fix~~ ✅ COMPLETED (Feb 2026)
- ~~MyRoom: Japanese bedroom room type with nighttime atmosphere, custom shaders, furniture~~ ✅ COMPLETED (Feb 2026)
- ~~Jukebox Room: vintage 50s diner with shared playlist, stage, mic stand, spotlights, walkable stage~~ ✅ COMPLETED (Feb 2026)
- ~~Music mode system (djqueue/jukebox/personal) for room-type-specific music behavior~~ ✅ COMPLETED (Feb 2026)
- ~~Wall occlusion fixes: depthWrite toggle on walls, side toggle + emissive scaling on attachments~~ ✅ COMPLETED (Feb 2026)
- ~~Lobby Screen 2 CharacterSidePreview redesign: arrows to bottom, name input at top, × close button~~ ✅ COMPLETED (Feb 2026)
- ~~Jukebox room: fix stage spotlights double-offset (world coords inside translated group)~~ ✅ COMPLETED (Feb 2026)
- ~~Jukebox room: move VideoDisplay from back wall to front wall above stage~~ ✅ COMPLETED (Feb 2026)
- ~~Suppress browser password manager on CreateRoomForm (type="text" + -webkit-text-security)~~ ✅ COMPLETED (Feb 2026)
- ~~Jump landing: jelly wobble animation (damped oscillation replaces single squash flash)~~ ✅ COMPLETED (Feb 2026)
- ~~Dream Mode Phase 1: Phaser app + iframe + NPC chat (core scaffolding)~~ ✅ COMPLETED (Feb 2026)
- ~~Lily NPC bartender: server-side AI NPC, chat routing, bar redesign, music awareness~~ ✅ COMPLETED (Feb 2026)
- ~~Lily NPC polish: emoticon reduction, chunk delay tuning, greeting name mechanic, conversational window, spontaneous music commentary, song recommendations, fallback emoji fix, bubble fade-out~~ ✅ COMPLETED (Feb 2026)
- ~~Character distortion fix: group-level lean, z-clip prevention (no Z displacement in twist/billboard), per-bone distortion overrides, hChar propagation through bone hierarchy~~ ✅ COMPLETED (Feb 2026)
- Dream Mode: shader backgrounds (port TV static noise to Phaser WebGL pipeline, per-world palette)
- Dream Mode: collectible persistence end-to-end testing
- Dream Mode Phase 2: combat system, more NPCs, additional dream worlds, sound effects
- Dream Mode Phase 3: activity-aware AI context, NPC memory, shared dreams
- PSX geometry shaders (vertex snapping, affine texture mapping)
- Textured DJ booth furniture
- Sound effects (footsteps, UI clicks, punch impacts)
- Mobile support (touch controls, responsive UI)
- ~~Migrate frontend from Netlify to Cloudflare Pages~~ ✅ COMPLETED (Feb 2026)
- Cloudflare R2 bucket setup for image/asset CDN (`cdn.mutante.club`)
- Self-hosted PostgreSQL on Hetzner VPS (Docker, user accounts, playlists, collectibles)
- Supabase Auth integration (email/password + OAuth, JWT verification on server)
- User accounts system (registration, login, profile, persisted playlists)
- Image upload pipeline (avatar upload → server validation/resize → R2 storage → CDN serve)

## Recent noteworthy commits (Jan 2026)

- Added DJ boombox spritesheet + animation + slowed playback.
- Room playlist changed to be non-destructive, index-based playback.
- Added Play button + auto-start on DJ connect + active-track highlight.
- Added room playlist previous-track control (`ROOM_PLAYLIST_PREV`).
- Added minimized DJ playlist bar with marquee + minimal controls.
- Added DJ-synced fullscreen YouTube video background toggle.
- Synced DJ boombox animation to other players via `updatePlayerAction`.
- Public lobby: skip login, server-enforced mutant identity, and reliable auto-login in `Game.create()`.
- Fixed click-to-move pathfinding: use `camera.getWorldPoint()` instead of broken `pointer.worldX/Y` with zoom.
- Fixed UI click-through: check `event.target === canvas` to prevent movement when clicking UI elements.
- Changed DJ booth activation to single-click when highlighted (removed double-click requirement).
- A\* pathfinding now supports 8-directional movement with octile heuristic and no corner-cutting.

## Recent noteworthy commits (Feb 2026)

- Refactored `YoutubePlayer.tsx` into modular components and hooks (see **YoutubePlayer Architecture** below).
- Made video background toggle local-only (no longer broadcast to server).
- Non-DJ users can now see the miniplayer and toggle background video.
- Fixed music sync on late-join (TimeSync + playerRef issues).
- Fixed background video sync for both WebGL and iframe fallback renderers.
- **Phaser Rendering Performance Optimizations** (see **Client Rendering Optimizations** below)
- Lobby `CharacterSidePreview` redesigned: arrows moved to bottom row, name above character as editable input, `×` close button (see **Lobby CharacterSidePreview** below).
- Jukebox room spotlight fix: corrected double-offset bug (world coords used inside translated Stage group → now local coords).
- Jukebox room: moved `VideoDisplay` from back wall to front wall above stage; added `rotation` prop to `VideoDisplay` component.
- `CreateRoomForm`: suppressed browser password manager by using `type="text"` with CSS `-webkit-text-security: disc` instead of `type="password"`; field renamed "room code"; added `data-lpignore` + `data-form-type` attributes.
- Jump landing squash-stretch extended to full jelly wobble: damped cosine oscillation (squash → overshoot tall → settle) over 0.55s replacing the old 0.15s single-spring flash.

## client-3d Recent Changes (Feb 2026)

### Character System

Characters discoverable dynamically via `characterRegistry.ts` (probes `public/characters/default[N]` up to `MAX_PROBE=20`). Lobby uses a **3D turntable carousel** (`TurntableCarousel.tsx`) with all characters arranged in a circle, rendered via r3f `<Canvas>`. See **Lobby Turntable Carousel** section below.

**WebGL lobby background** (`WarpCheckBg.tsx`): Fragment shader renders a warping green/white checkerboard with multi-layered sinusoidal UV distortion. Rendered at ¼ resolution with `imageRendering: pixelated` + `filter: blur(3px)` for a degraded analog feel. Lobby card uses `bg-green-500/70 backdrop-blur-md`.

Known characters:

- **lrmouse** (`/characters/default`, textureId 0)
- **Ramona** (`/characters/default2`, textureId 1, scale 0.64)
- **Mutant** (`/characters/default3`, textureId 2)
- **default4–default10** (textureId 3–9)

`GameScene.tsx` maps `textureId → character path` in `TEXTURE_ID_TO_CHARACTER` for remote players. Each character folder contains `manifest.json` + PNG part images. `CharacterLoader.ts` loads `{basePath}/manifest.json`. `AnimationMixer.ts` supports `rotation.x/y/z`, `position.x/y/z`, and `scale.x/y/z` track properties.

**Per-character scale override**: Add `"scale": 0.64` (or any multiplier) to a character's `manifest.json` top-level. Applied on top of the auto-normalization in `PaperDoll.tsx` (`computeCharacterLayout` normalizes all characters to `TARGET_HEIGHT_PX = 110`, then multiplies by `manifest.scale ?? 1`). No re-export needed — just edit the JSON.

**Dynamic ground alignment**: `computeCharacterLayout` in `PaperDoll.tsx` computes per-character `groundOffsetY` from the actual bounding box so feet sit at Y=0 regardless of part layout or scale. It tracks `feetY = max(ay + pivot[1] * h)` across all parts (matching how `PartMesh` geometry is shifted by pivot), then shifts the root group up by `feetY * PX_SCALE * charScale`. Reports layout metrics to `PlayerEntity.tsx` via `onLayout` callback:

- `worldHeight` — total character height in world units
- `headTopY` — Y position of top of head part (for chat bubble anchor)
- `visualTopY` — Y position of highest point of any part (for top-positioned chat bubbles)

### Character Distortion System (Feb 2026)

PaRappa-style vertex distortion applied to paper-doll characters during movement. The system splits effects into **group-level transforms** (applied to Three.js bone groups, inherited by children) and **vertex-level effects** (applied per-part in the shader).

#### Architecture

**Group-level lean** (`PaperDoll.tsx` `useFrame`):
- Lean displacement applied to each bone group's `position.x` based on `velocityX` and a smoothstep curve of the bone's character-space height (`hChar`)
- Children inherit parent lean through the scene graph automatically — no visual gap between head and torso
- Uses incremental `leanFactor` (total lean minus inherited parent lean) to avoid double-counting
- Undone each frame before `applyAnimation()` runs, then reapplied after, to coexist with animation position tracks

**Vertex shader effects** (`DistortMaterial.ts` `onBeforeCompile`):
- Squash-stretch (part-local, scaled by `dScale`)
- Twist (body-coherent via `hChar`, X-axis only — no Z displacement)
- Wobble (part-local, scaled by `dScale`)
- Bounce (part-local, scaled by `dScale`)
- Billboard twist (body-coherent via `hChar`, X-axis only — no Z displacement)
- Clip-space vertex fisheye (`uVertexFisheye`)

**Why no Z displacement**: Twist and billboard twist originally rotated vertices in both X and Z. The Z displacement caused parts to clip through each other (head through torso), breaking z-order. Removing Z writes eliminates this — the visual twist is almost entirely in X for these flat paper-doll planes.

#### Per-bone distortion overrides

Characters can specify per-bone-role distortion multipliers in their `manifest.json`:

```json
{
  "distortion": 0.8,
  "distortionOverrides": {
    "head": 0.2
  }
}
```

- `distortion` (0..1, default 1): Global multiplier for all part-local effects
- `distortionOverrides`: Per `boneRole` multiplier, combined as `globalDistortion × boneOverride`
- Only affects part-local effects (squash, wobble, bounce). Body-coherent effects (twist, billboard twist) always use full speed for joint continuity.
- Useful for tall characters with long necks where independent head wobble looks disconnected

#### hChar propagation

`computePartDistortInfo()` in `PaperDoll.tsx` processes parts in topological order (parents before children):
- Root parts: `hChar` computed from character bounding box (0 = feet, 1 = head)
- Child parts: inherit `hCharAtBone` from parent's bone position for joint continuity
- Each part gets `hCharBottom`, `hCharTop` (passed to shader as uniforms for per-vertex interpolation), `hCharAtBone` (used for group-level lean), and `leanFactor` (incremental lean)

#### Key files

| File | Purpose |
|------|---------|
| `client-3d/src/character/DistortMaterial.ts` | Vertex shader effects + uniform management |
| `client-3d/src/character/PaperDoll.tsx` | Group-level lean + `computePartDistortInfo()` + bone hierarchy rendering |
| `client-3d/src/character/CharacterLoader.ts` | Manifest loading with `distortion`/`distortionOverrides` fields |

### 3D Chat Bubbles + Layer-Based Rendering (Feb 2026)

Chat bubbles were rewritten from HTML overlays (`<Html>` from drei) to native Three.js geometry for a consistent PSX aesthetic:

**Bubble rendering**:

- `Text` from `@react-three/drei` (troika-three-text) for crisp text at any distance
- Rounded-rect background (`THREE.ShapeGeometry`) computed dynamically from text bounding box via `onSync`
- Triangular tail pointing down (or sideways for tall characters)
- Pop-in animation (scale 0→1 with ease) + shrink-out fade in last 800ms before expiry

**Stacking**: Multiple bubbles stack vertically with `STACK_GAP = 0.12`. Most recent bubble at bottom with tail, older bubbles stacked above.

**Smart positioning based on character height**:

- Short characters (`visualTopY ≤ 1.2`): bubbles above head at `[0, visualTopY + 0.15, 0]`
- Tall characters (`visualTopY > 1.2`): bubbles beside head at `[±0.5, headTopY, 0]`
  - Side bubbles flip left/right based on screen position (`tempVec.project(camera).x > 0.3`)

**Distance scaling**: Bubbles scale inversely with camera distance (`dist / 4`, clamped `0.8..2.5`) so they remain readable at all zoom levels.

**Layer-based rendering** (avoids VHS post-processing on UI):

- All bubble meshes (text, background, tail) use `layers.set(1)` — Three.js layer 1
- `PsxPostProcess.tsx` renders in 4 passes:
  1. Layer 0 only → ¾-res scene render target (NearestFilter)
  2. Blit downsample scene RT → half-res bloom render target (LinearFilter = free blur)
  3. VHS fullscreen quad reads `tDiffuse` (scene RT) + `tBloom` (bloom RT) → screen
  4. Layer 1 only → rendered clean directly to screen (no post-processing)
- Camera has `layers.enable(1)` so bubbles also render when VHS is off

**Nametags**: Troika `<Text>` + rounded-rect background mesh on layer 1 (rendered clean, no VHS post-processing). Positioned below character (`y = -0.15`). Shared `nametagBgMat` material instance across all players. Background auto-sizes via `onSync` text bounds measurement. Replaced previous `<Html>` DOM overlay to eliminate per-player DOM nodes and CSS transform repositioning.

**Key files**: `PlayerEntity.tsx` (Nametag, SingleBubble, ChatBubble components), `PsxPostProcess.tsx` (layer render passes), `chatStore.ts` (exports `BUBBLE_DURATION`, `ChatBubble` type)

### DJ Booth Overlap Fix

- **1 DJ**: centered (`x = 0`). **2 DJs**: left/right (`x = ±1.0` world units)
- `Room.tsx`: Desk widened `2.2 → 3.6`, added second laptop, exported `getDJBoothWorldX(queueIndex, queueCount)`
- `BoothPrompt.tsx`: Initial join position uses `getDJBoothWorldX`
- `NetworkManager.ts`: On `DJ_QUEUE_UPDATED`, repositions ALL DJs to correct spots (handles dynamic re-centering)

### NowPlaying Mini Player

Shows DJ name, track title, elapsed/total time, up next, stop/skip buttons (current DJ only), video bg toggle. Hidden `ReactPlayer` plays audio. `onEnded` sends `djTurnComplete()`. Returns `null` when nothing playing.

### Ambient Stream Filtering

Server plays ambient background video (`isAmbient: true`) when no DJ is active. The 3D client now skips these in both `START_MUSIC_STREAM` handler and late-join sync (`!ms.isAmbient`). This prevents false "playing" state, phantom NowPlaying bar, and characters dancing when no DJ is active.

### Animated Skybox

`TrippySky.tsx` — procedural FBM cloud layer with `uTime`-driven drift at speed `0.4` (increased from `0.06` for visible movement). Five-octave fractal brownian motion, two overlapping cloud layers, horizon fade.

### Lobby Turntable Carousel (Feb 2026)

`TurntableCarousel.tsx` — r3f-based 3D character selector for the lobby screen. All discovered characters arranged in a circle, rendered with actual `PaperDoll` components (same as in-game), playing walk animations. Selected character walks forward (toward camera), others idle. Replaced the earlier CSS-composited `CharacterPreview` approach.

**Architecture**: Single `<Canvas>` (orthographic, `dpr={0.75}`) renders all characters + speech bubbles + "CLUB MUTANT" logo text. Characters are positioned in a turntable ring and rotated to face inward. The carousel auto-rotates and snaps to the selected character via `useFrame` lerp.

**Key components**:

- `CarouselScene` — manages the turntable group rotation, maps characters to ring positions
- `CarouselCharacter` — wraps `PaperDoll` with per-character position/rotation on the ring, passes walk anim to selected character
- `CarouselBubble` — speech bubbles above characters using troika `<Text>` + rounded-rect `ShapeGeometry`, reads text from ref in `useFrame` (no React state)
- `useBubbleScheduler` — ref-based scheduler that cycles random phrases across characters via timers, returns `MutableRefObject<(string|null)[]>` (no `useState`)

**Glow effect**: CSS `drop-shadow` filter applied to the main canvas wrapper div via `useGlowFilter` hook. Pulsates via sine wave, throttled to ~15fps. Previously used a second `<Canvas>` for isolated glow rendering — eliminated for performance (see optimizations below).

**Key files**: `TurntableCarousel.tsx` (carousel + scene + bubbles), `LobbyScreen.tsx` (two-screen lobby flow + room select), `CharacterSidePreview.tsx` (compact character preview for Screen 2), `CustomRoomBrowser.tsx` (room list + join), `CreateRoomForm.tsx` (create room form)

### Lobby Carousel Performance Optimizations (Feb 2026)

Seven optimizations applied to the lobby carousel and character system:

**1. Single Canvas (eliminated dual-Canvas glow)**
Previously the carousel used two `<Canvas>` elements — one for the main scene and one solely for CSS `drop-shadow` glow on the selected character. This meant two WebGL contexts, two render loops, and the selected character rendered & animated twice every frame. Removed the glow Canvas entirely; applied `drop-shadow` CSS filter directly to the main Canvas wrapper. PaperDoll instances dropped from 13 to 12.

**2. Distortion uniform skip for static PaperDolls**
`PaperDoll.tsx` `useFrame` now early-returns after `applyAnimation()` when `speed === 0 && velocityX === 0 && billboardTwist === 0` — skips `distortTimeRef`, `useUIStore.getState()`, material uniform loop, and group-level lean entirely. Always true for all 12 lobby PaperDolls. Saves ~120 uniform writes/frame.

**3. O(1) children lookup in PaperDoll (childrenByParent map)**
`PartMesh` previously called `allParts.filter(p => p.parent === part.id)` on every render — O(N²) total across the bone tree. Now builds a `Map<string|null, ManifestPart[]>` once via `useMemo` in `PaperDoll`, passes to `PartMesh`. Lookup is O(1).

**4. Ref-based bubble state (no React re-renders in Canvas)**
`useBubbleScheduler` used `useState` which triggered React reconciliation on every bubble show/hide. Inside `<Canvas>`, rendering is driven by `useFrame`, not React — re-renders are wasted. Replaced with `useRef<(string|null)[]>` that `CarouselBubble` reads imperatively via `useFrame`.

**5. Cached rounded-rect geometry for bubbles**
`makeRoundedRect` was creating a new `ShapeGeometry` every `onSync` callback. Now cached by quantized `(w,h)` key via `getCachedRoundedRect` — there are only ~5 distinct sizes for the short phrases, so cache hit rate is near 100%.

**6. Throttled glow filter rAF to ~15fps**
`useGlowFilter` was writing a CSS filter string at 60fps for a sine-wave pulse. Added `GLOW_FRAME_MS = 1000/15` frame-rate cap. Visually imperceptible difference for a slow sine pulse.

**7. Eliminated double manifest fetch in character discovery**
`discoverCharacters()` fetches `manifest.json` per character for the name/metadata, then `preloadCharacter()` would fetch it again when loading textures. Now passes the already-parsed manifest directly via `preloadCharacterWithManifest()` in `CharacterLoader.ts`, skipping the redundant fetch. `discoverCharacters` returns `DiscoveredCharacter[]` (entry + manifest), `getCharacters()` maps to `CharacterEntry[]` for external consumers and calls `preloadCharacterWithManifest` with the manifest.

**Key pattern — ref-based state inside r3f Canvas**: Inside `<Canvas>`, rendering is driven by `useFrame`, not React reconciliation. `useState` triggers re-renders that are wasted work. Use `useRef` for mutable state and read it imperatively in `useFrame`. This applies to speech bubble text, animation clocks, material arrays, etc. Only use `useState` when you need React to re-render JSX (e.g., adding/removing child components).

### Lobby Custom Room System (Feb 2026)

Custom room creation and browsing for the 3D client. Two-screen lobby flow with a two-column layout on Screen 2.

**Lobby flow**:

- **Screen 1** — Character carousel (`TurntableCarousel`) + name input + "Go!" button. Pressing Go triggers `getNetwork()` which lazily creates `NetworkManager` and auto-joins the lobby room in its constructor.
- **Screen 2** — Two-column layout: left column is `CharacterSidePreview` (compact character avatar with arrow nav), right column is room selection (choose → browse → create sub-views).
  - **Choose sub-view**: "Global Lobby" button (joins public room) + "Custom Rooms" button (requires lobby connection). Arrow keys switch characters.
  - **Browse sub-view**: `CustomRoomBrowser` lists available rooms from lobby, join with optional password prompt.
  - **Create sub-view**: `CreateRoomForm` with name, description, optional password fields.

**CharacterSidePreview**: Compact r3f `<Canvas>` rendering a single `PaperDoll` playing idle animation. Left/right arrow buttons overlay the canvas for character switching. **Dynamic camera centering** via PaperDoll's `onLayout` callback — sets camera Y target to `visualTopY / 2` so each character is vertically centered regardless of height, with smooth lerp transition. Responsive: `w-full sm:w-[220px]` with `max-width: 280px`. Back button styled in toxic green inside the card.

**Lobby room discovery**: `NetworkManager` joins a `LobbyRoom` (Colyseus built-in) in its constructor via `joinLobbyRoom()` with retry logic (3 attempts, 1.5s delay). The lobby room broadcasts `onAdd`/`onRemove`/`onChange` events for CUSTOM rooms (requires `enableRealtimeListing()` on the server's CUSTOM room handler). Room list stored in `gameStore.availableRooms`.

**Custom room join/create**: `NetworkManager.createCustomRoom()` and `joinCustomById()` both include `textureId` in Colyseus join options. Server `ClubMutant.onJoin` reads `textureId` for ALL new players (not just public rooms), ensuring the correct initial character is synced to other clients.

**Key files**:

| File | Purpose |
|------|---------|
| `client-3d/src/ui/LobbyScreen.tsx` | Two-screen flow, Screen 2 two-column layout |
| `client-3d/src/ui/CharacterSidePreview.tsx` | Compact character preview with dynamic camera |
| `client-3d/src/ui/CustomRoomBrowser.tsx` | Browse + join custom rooms |
| `client-3d/src/ui/CreateRoomForm.tsx` | Create custom room form |
| `client-3d/src/network/NetworkManager.ts` | Lobby room join, custom room create/join |
| `client-3d/src/stores/gameStore.ts` | `lobbyJoined`, `availableRooms`, `roomType` |
| `server/src/index.ts` | `enableRealtimeListing()` on CUSTOM handler |
| `server/src/rooms/ClubMutant.ts` | `onJoin` textureId for all players |

### Lobby CharacterSidePreview Redesign (Feb 2026)

`CharacterSidePreview.tsx` was redesigned so the character sprite fills more vertical space on Screen 2 of the lobby:

- **Before**: left/right arrow buttons flanked the canvas, eating into horizontal space and forcing a small character
- **After**:
  - Editable name input at the **top** of the card (when `onPlayerNameChange` prop is provided)
  - `×` close button top-right (calls `onBack`)
  - Canvas fills full card width (300px tall)
  - Bottom nav row: `‹` counter `N / total` `›` arrows

Camera settings: `zoom=170`, initial `position.y=0.55`. At zoom=170 a 300px canvas shows 1.76 world units — enough to fit the tallest character (1.10 wu) with comfortable padding. Camera Y lerps toward `visualTopY / 2` via `onLayout` callback for per-character centering.

**`CharacterSidePreviewProps`**:
```ts
interface CharacterSidePreviewProps {
  characters: CharacterEntry[]
  selectedIndex: number
  onSelect: (index: number) => void
  playerName: string
  onPlayerNameChange?: (name: string) => void  // if omitted, name is shown as static text
  onBack?: () => void
}
```

### Browser Password Manager Suppression (Feb 2026)

`CreateRoomForm.tsx` room code field uses `type="text"` instead of `type="password"` to prevent Chrome/Brave from triggering password-manager dialogs ("Check your saved passwords" breach warnings).

**Technique**: CSS `-webkit-text-security: disc` applied via inline style mimics the bullet-character masking of a password field without triggering browser heuristics:

```tsx
<input
  type="text"
  autoComplete="off"
  data-lpignore="true"       // LastPass ignore
  data-form-type="other"     // Dashlane/Bitwarden ignore
  style={showPassword ? undefined : { WebkitTextSecurity: 'disc' } as React.CSSProperties}
/>
```

Also: label renamed "room code" (avoids the word "password"), wrapped in `<form autoComplete="off" onSubmit={(e) => e.preventDefault()}>`, submit button has `type="button"`.

**Gotcha**: `autoComplete="new-password"` + `type="password"` does NOT reliably suppress Chrome's breach-check dialog. Only removing `type="password"` entirely prevents it.

### Jump Landing Jelly Wobble (Feb 2026)

Landing squash-stretch was extended from a 0.15s single-spring flash to a full 0.55s damped jelly oscillation in `PlayerEntity.tsx`.

**Formula** (in grounded `useFrame`, `landingSquashTimer > 0`):
```ts
const t = 1 - landingSquashTimer.current / LANDING_SQUASH_DURATION  // 0→1
const decay = Math.exp(-t * 4.5)
const wobble = Math.cos(t * Math.PI * 2.5) * decay
targetScaleY = 1 - wobble * 0.45  // 0.55 at t=0, overshoots ~1.45, settles at 1
targetScaleX = 1 + wobble * 0.35  // 1.35 at t=0, undershoots ~0.65, settles at 1
```

Animation arc: **squash (0.55/1.35) → overshoot tall (1.45/0.65) → gentle second squash → settle at 1.0** over 0.55s. The lerp rate of 18/s keeps transitions fluid. Initial hit uses harder values (0.55/1.35 vs previous 0.6/1.3).

**Key constants**:
- `LANDING_SQUASH_DURATION = 0.55` (was 0.15)
- `SQUASH_SPRING_SPEED = 6.0` (was 12.0, only applies outside the wobble window)

### Paper Rig Editor (`tools/paper-rig-editor/`)

Character rig tool for building paper-doll characters used by `client-3d`:

- Drop PNGs → set pivots, offsets, parent bones, bone roles → preview animations → export zip
- Export produces `manifest.json` + all original image files (via JSZip)
- Preset dance animation uses `rotation.y` on arms for z-axis twist effect (replaced earlier `scale.x`/`scale.y` approach which looked glitchy)
- `AnimationTrack.property` union: `rotation.x/y/z | position.x/y/z | scale.x/y/z`
- Stores `originalFilename` on each part so exported manifest references real filenames
- **Multi-select + batch editing**: Cmd/Ctrl+click to select multiple parts, "select all" button in parts header. When multiple parts selected, Properties panel shows batch Parent and Bone Role dropdowns (shows "— mixed —" when values differ). Store uses `selectedPartIds: Set<string>` with `updateParts` batch action.
- **Pivot indicator always on top**: Pivot dot rendered as ring+dot with `transparent`, `depthTest={false}`, `depthWrite={false}`, `renderOrder=999` — ensures it renders in the transparent pass after all part meshes

## YoutubePlayer Architecture (Feb 2026 refactor)

The `YoutubePlayer.tsx` was refactored from a monolithic component into modular pieces:

### Files

- `client/src/components/YoutubePlayer.tsx` - Main container component
- `client/src/components/YoutubePlayer.styles.ts` - Styled components (extracted)
- `client/src/components/VideoPlayer.tsx` - ReactPlayer wrapper with background toggle button
- `client/src/components/PlayerControls.tsx` - Play/pause/skip buttons
- `client/src/components/RoomPlaylistView.tsx` - Room playlist UI
- `client/src/components/usePlayerSync.ts` - Custom hook for player synchronization

### Key learnings from refactor

1. **playerRef must be shared**: When extracting ReactPlayer into a sub-component, the `playerRef` used for `seekTo()` must be passed from the parent/hook to the child component. Creating a local ref in the child breaks seeking.

2. **isPlaying should default to true**: The original code had `isPlaying: true` by default. Changing to conditional initialization (`link !== null`) broke auto-play on join.

3. **TimeSync must be ready before seeking**: On late-join, `timeSync.getServerNowMs()` returns `Date.now()` until the first sync response arrives. The `handleReady` callback now:
   - Requests fresh time sync via `game.network.requestTimeSyncNow()`
   - Checks `timeSync.hasSync()` before seeking
   - Retries at 150ms, 400ms, 800ms, 1500ms to catch the sync response

### Background video sync (WebGL + iframe)

Both renderers need to calculate offset using server-synced time, not `Date.now()`:

```ts
const freshOffset = startTime > 0 ? (timeSync.getServerNowMs() - startTime) / 1000 : 0
```

**WebGL video** (`Game.ts`):

- Recalculates offset in the `metadata` event handler (after resolve + load)

**Iframe fallback** (`Game.ts`):

- Recalculates offset in `fallbackToDomYoutubeBackground`
- Multiple delayed seek attempts at 500ms, 1500ms, 3000ms (YouTube iframe needs time to initialize before seeking works)

### Video background toggle (local-only)

The video background toggle (`videoBackgroundEnabled`) is now:

- Local-only (stored in Redux, not synced to server)
- Defaults to `true`
- Available to all users (not just DJ)
- Dispatches Redux action + emits Phaser event for Game.ts to react

## YouTube Microservice (services/youtube-api)

### Motivation

The current `server/Youtube.js` uses fragile HTML/JSON scraping that runs inline with the Colyseus game server. This is problematic:

- CPU-intensive parsing blocks game state sync
- Single point of failure for rate limiting
- Difficult to scale independently

### Architecture

```
┌─────────────────┐     ┌──────────────────────────────┐
│  Colyseus Game  │────▶│  YouTube Microservice (Go)   │
│     Server      │     │  - GET /search?q=...         │
└─────────────────┘     │  - GET /resolve/{videoId}    │
                        │  - GET /proxy/{videoId}      │
                        └──────────────┬───────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────────┐
                        │   In-memory Cache (Redis TBD)│
                        │  - search results (1hr TTL)  │
                        │  - resolved URLs (by expiry) │
                        └──────────────────────────────┘
```

### Implementation Status

1. **Phase 1: Search endpoint** ✅
   - Location: `services/youtube-api/`
   - Endpoint: `GET /search?q=...&limit=10`
   - Uses `github.com/raitonoberu/ytsearch` library
   - In-memory cache with TTL

2. **Phase 2: Direct client access** ✅
   - Client-3d calls Go service directly via `youtubeBaseUrl` (derived from `VITE_YOUTUBE_SERVICE_URL`)
   - `server/youtubeService.ts` retained only for server-initiated `prefetchVideo()` (DJ queue/jukebox commands)
   - YouTube proxy routes removed from Colyseus server (no more double-hop through Node.js)

3. **Phase 3: Resolve & proxy endpoints** ✅
   - `GET /resolve/{videoId}` - returns direct stream URL
   - `GET /resolve/{videoId}?videoOnly=true` - video-only (no audio)
   - `GET /proxy/{videoId}` - proxies stream (default: video-only)
   - Supports Range headers for seeking

4. **Phase 4: Redis caching** (pending)
   - Redis for shared cache across instances

### Local development

```bash
# Terminal 1: Go service
cd services/youtube-api && go run .

# Terminal 2: Node server
YOUTUBE_SERVICE_URL=http://localhost:8081 npm run start
```

### Environment variables

- `PORT` - Go service HTTP port (default: 8081)
- `YOUTUBE_API_CACHE_TTL` - search cache TTL in seconds (default: 3600)
- `YOUTUBE_SERVICE_URL` - Node server config (default: `http://localhost:8081`)

### YouTube API Performance Optimizations (Jan 2026)

The Go YouTube library (`github.com/kkdai/youtube/v2`) frequently fails with signature parsing errors due to YouTube cipher changes. The service now uses **yt-dlp exclusively** with several optimizations:

#### Architecture Changes

1. **Removed Go library** - Skipped entirely, go straight to yt-dlp (Go lib always failed with "error parsing signature tokens")
2. **Removed Colyseus fallback** - The Colyseus server no longer has a local yt-dlp fallback (it didn't have cookies configured)

#### Fly.io VM Optimizations

| Issue               | Symptom                               | Fix                                                                                     |
| ------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| CPU Steal           | 90% steal on shared CPU               | Switch to `performance` CPU (`cpu_kind = 'performance'` in fly.toml)                    |
| Disk I/O Throttling | 60-100 throttled events               | Use RAM disk: `TMPDIR=/dev/shm`, `XDG_CACHE_HOME=/dev/shm`                              |
| OOM Kills           | yt-dlp processes killed               | Add semaphore to limit concurrent processes (`ytdlpSemaphore = make(chan struct{}, 2)`) |
| Thundering Herd     | Same video resolved 5x simultaneously | Add singleflight request coalescing (`golang.org/x/sync/singleflight`)                  |

#### yt-dlp Configuration

```go
args := []string{
    url,
    "-f", "best[height<=360][ext=mp4]/best[height<=480][ext=mp4]/best[ext=mp4]/best[height<=360]/best",
    "-g",
    "--no-playlist",
    "--no-warnings",
    "--quiet",
    "--no-cache-dir",
    "--js-runtimes", "node",
    "--remote-components", "ejs:github",
    "--extractor-args", "youtubepot-bgutilhttp:base_url=" + potProviderUrl,
}
// Add cookies if available
if _, err := os.Stat(cookiesFilePath); err == nil {
    args = append(args, "--cookies", cookiesFilePath)
}
```

#### Cookie Authentication (Age-Restricted Content)

- Cookies stored as Fly.io secret: `YOUTUBE_COOKIES`
- Written to `/tmp/youtube_cookies.txt` at startup
- Export from browser using a cookie extension (Netscape format)

#### PO Token Provider

A separate service (`club-mutant-pot-provider`) provides Proof of Origin tokens:

- Uses `bgutil-ytdlp-pot-provider` Python package
- Internal URL: `http://club-mutant-pot-provider.internal:4416`

#### Monitoring Fly.io Metrics

Key metrics to watch:

- **CPU Steal**: Should be 0% with performance CPU
- **Disk Throttled Events**: Should be minimal with RAM disk
- **Network recv vs sent**: If recv >> sent, streams aren't reaching clients
- **Load Average**: High values indicate yt-dlp queue backup

#### Defaults

- `videoOnly=true` on both `/resolve/` and `/proxy/` endpoints (smaller files, faster)
- Cache TTL: based on resolved URL expiry (~6 hours), with a 5-minute safety buffer (never cache past expiry)

### ISP Proxy Integration (Feb 2026)

YouTube aggressively rate-limits datacenter IPs, requiring PO tokens for every request (~6-7s overhead). ISP proxies provide residential IPs that bypass this detection.

#### Architecture

```
┌─────────────┐     ┌──────────────────────────┐     ┌─────────────┐     ┌──────────┐
│   Client    │────▶│  YouTube API (Go)        │────▶│  ISP Proxy  │────▶│ YouTube  │
│  (Browser)  │     │  - resolve via yt-dlp    │     │  (IPRoyal)  │     │   CDN    │
└─────────────┘     │  - stream via HTTP proxy │     └─────────────┘     └──────────┘
                    └──────────────────────────┘
```

#### Key Learnings

| Issue                                | Cause                                                           | Solution                                                                       |
| ------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **403 on video stream**              | YouTube URLs are IP-locked to resolver's IP                     | Stream video through same ISP proxy used for resolve                           |
| **"Requested format not available"** | yt-dlp selectors like `bv[height<=360]` need JavaScript runtime | Use specific itags (`160/133/134`) for proxy path, selectors for PO token path |
| **Cookies interfere with proxy**     | YouTube cookies can override proxy session                      | Only pass `--cookies` arg when using PO token path                             |

#### ISP Proxy Configuration

```go
func init() {
    transport := &http.Transport{...}

    // Route all video streaming through ISP proxy
    if proxyURL := os.Getenv("PROXY_URL"); proxyURL != "" {
        proxyParsed, _ := url.Parse(proxyURL)
        transport.Proxy = http.ProxyURL(proxyParsed)
    }

    httpClient = &http.Client{Transport: transport}
}
```

#### Environment Variables

- `PROXY_URL` - ISP proxy URL (format: `http://user:pass@host:port`)
- For Hetzner deployment: set in `deploy/hetzner/.env` (consumed by `deploy/hetzner/docker-compose.yml`)

#### Performance

| Path      | Resolve Time | Notes                                 |
| --------- | ------------ | ------------------------------------- |
| ISP Proxy | ~4s          | No PO token needed, itag-based format |
| PO Token  | ~6-7s        | Selector-based format, JS runtime     |
| Cached    | ~10ms        | 6-hour cache based on URL expiry      |

### Safari Video Background (Feb 2026)

Safari has significantly slower video metadata loading compared to Chrome for WebGL video backgrounds.

#### Root Cause

- Safari waits for the **moov atom** (MP4 metadata) before firing `loadedmetadata`
- Chrome uses range requests to seek directly to metadata at end of file
- Safari downloads more of the file sequentially, causing 20-30s delays

#### Solution

Detect Safari and use iframe YouTube player instead of WebGL video:

```typescript
// client/src/scenes/Game.ts
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
const BACKGROUND_VIDEO_RENDERER: BackgroundVideoRenderer = isSafari ? 'iframe' : 'webgl'
```

#### Iframe Fallback Styling

When using iframe fallback, the YouTube player needs to render above the Phaser canvas with blend mode:

```scss
// client/src/index.scss
#phaser-container.bg-iframe-overlay {
  canvas {
    mix-blend-mode: exclusion;
  }
  > div {
    z-index: 2; // Above canvas (z-index: 1)
  }
}
```

#### Browser Behavior Summary

| Browser | Renderer                    | Background Style                          |
| ------- | --------------------------- | ----------------------------------------- |
| Chrome  | WebGL `Video`               | Behind canvas (Phaser display list + CSS) |
| Safari  | iframe (rex YouTube player) | Above canvas + exclusion blend            |

#### WebGL background video sizing

The WebGL background video can initially render at the wrong size if you use `window.innerWidth/innerHeight` before Phaser's ScaleManager settles.

- Use `this.scale.gameSize` as the authoritative width/height.
- Force an early `this.scale.refresh()` and run a delayed resize pass so both rex YouTube player and the WebGL `Video` get correct dimensions.

### Video Byte Caching (Go Service)

The Go service caches full video bytes in memory for faster subsequent requests.

#### Configuration

```go
const DefaultVideoCacheMaxSize = 100 * 1024 * 1024  // 100MB

// Configurable via environment variable
VIDEO_CACHE_SIZE_MB=1000  // 1000MB cache (see deploy/hetzner/docker-compose.yml)
```

#### Cache Behavior

- **LRU eviction** when cache is full
- **TTL**: Based on URL expiry (~6 hours), with 5-minute safety buffer
- **Only caches** non-range requests (full video downloads)
- **Max entry size**: 10MB (larger videos stream without caching)

#### Cache Flow

```
Request → Check video cache
            ↓ miss
          Resolve URL (yt-dlp)
            ↓
          Stream from YouTube (via proxy)
            ↓
          Cache bytes (if < 10MB)
            ↓
          Return to client
```

### Resolve URL Caching

Resolved YouTube URLs are cached based on their expiry time (parsed from `expire=` query param).

```go
// Parse expiry from URL like ...&expire=1769954631&...
func parseExpiresFromURL(rawURL string) *int64 {
    // Extract expire param, convert to milliseconds
}

// Cache with TTL = expiry - now - 5min buffer
func cacheResolvedURL(key string, resp ResolveResponse) {
    if resp.ExpiresAtMs != nil {
        ttl := time.Until(time.UnixMilli(*resp.ExpiresAtMs)) - 5*time.Minute
        resolveCache.Set(key, resp, ttl)
    }
}
```

Typical YouTube URL expiry: **~6 hours** from resolve time.

### Deployment (Hetzner VPS + Caddy) (Feb 2026)

This repo now includes a working VPS deployment bundle under `deploy/hetzner/` that runs:

- **Caddy** reverse proxy (automatic HTTPS)
- **Colyseus Node server** (port `2567` internal)
- **YouTube API (Go)** (port `8081` internal)
- **Dream NPC (Node/Express 4)** (port `4000` internal)
- **PO token provider** (port `4416` internal)

#### Domains

- `api.mutante.club` → Colyseus server (WebSocket + HTTP)
- `yt.mutante.club` → YouTube API (HTTP)
- `dream.mutante.club` → Dream NPC service (HTTP)

#### Key files

- `deploy/hetzner/docker-compose.yml`
- `deploy/hetzner/Caddyfile`
- `deploy/hetzner/.env.example` (copy to `.env` on the VPS; do not commit)
- `services/dream-npc-go/Dockerfile`

#### Ports

- Public inbound:
  - `80` / `443` (Caddy)
- Container-internal:
  - `2567` (server)
  - `8081` (youtube-api)
  - `4000` (dream-npc-go)
  - `4416` (pot-provider)

#### Environment variables (VPS)

- `PROXY_URL` (recommended)
- `YOUTUBE_COOKIES` (optional; for age-restricted content)
- `GEMINI_API_KEY` (required for dream-npc-go service)

#### Client build config (Cloudflare Pages)

The client uses these at build time (set in Cloudflare Pages dashboard → Environment variables):

- `NODE_VERSION=22`
- `VITE_WS_ENDPOINT=wss://api.mutante.club`
- `VITE_HTTP_ENDPOINT=https://api.mutante.club`
- `VITE_YOUTUBE_SERVICE_URL=https://yt.mutante.club`
- `VITE_DREAM_SERVICE_URL=https://dream.mutante.club`

SPA routing handled by `client-3d/public/_redirects` (not `netlify.toml`).

#### DNS (Cloudflare)

All DNS managed via Cloudflare (nameservers at registrar point to Cloudflare):

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `mutante.club` | `club-mutant.pages.dev` | Proxied (required for Pages) |
| A | `api` | `<Hetzner IP>` | DNS-only (grey cloud — direct for WebSocket latency) |
| A | `yt` | `<Hetzner IP>` | DNS-only (grey cloud — direct for video streaming) |
| A | `dream` | `<Hetzner IP>` | DNS-only (grey cloud) |

## Infrastructure Roadmap (Feb 2026)

Planned infrastructure for upcoming features (user accounts, image uploads, persisted data).

### Cloudflare R2 — Image/Asset CDN

S3-compatible object storage with zero egress fees. Planned for user-uploaded content (character avatars, custom room backgrounds, etc.).

- **Bucket**: Create via Cloudflare dashboard or Wrangler CLI
- **Custom domain**: `cdn.mutante.club` (bind to R2 bucket for public access via Cloudflare CDN)
- **Upload flow**: Client → Colyseus server (validates + resizes) → R2 via S3 SDK (`@aws-sdk/client-s3`)
- **Serving**: Direct public bucket URL (`cdn.mutante.club/avatars/abc123.webp`), cached at Cloudflare edge
- **Free tier**: 10 GB storage, 10M reads/month, 1M writes/month
- **Why R2 over alternatives**: Zero egress fees (vs S3/Supabase Storage), same Cloudflare account as Pages, custom domain with built-in CDN

### Self-Hosted PostgreSQL — Persistent Data Store

PostgreSQL running on the existing Hetzner VPS via Docker. Co-located with the Colyseus game server for sub-millisecond query latency.

- **Deployment**: Add `postgres` service to `deploy/hetzner/docker-compose.yml`
- **Volume**: Persistent Docker volume for data durability across container restarts
- **Backups**: `pg_dump` cron job → compressed SQL dump → R2 bucket (or local disk)
- **Data**: User accounts (linked to Supabase Auth UUID), saved playlists, collected items, room history, play statistics
- **Access**: Game server connects via Docker internal network (`postgres://postgres:password@postgres:5432/clubmutant`)
- **Migrations**: Use a lightweight migration tool (e.g., `node-pg-migrate` or raw SQL files with version tracking)
- **Why self-hosted over managed**: Zero cost (already paying for VPS), no storage/MAU limits, co-located with game server, full control

### Supabase Auth — User Authentication

Supabase Auth as a standalone service for user authentication. Only using Supabase's auth module — database and storage are self-hosted (Postgres on Hetzner, R2 for assets).

- **Supabase project**: Create free-tier project at `supabase.com` (50K MAU on free tier)
- **Auth methods**: Email/password + OAuth (Google, Discord, GitHub)
- **Client integration**: `@supabase/supabase-js` in `client-3d/` for login/signup UI
- **Server verification**: Colyseus server verifies JWT on room join using Supabase's JWT secret (no Supabase SDK needed server-side — just standard JWT verification)
- **Flow**: Client signs in via Supabase → gets JWT → sends JWT in Colyseus join options → server verifies + links to Postgres user record
- **Why Supabase Auth standalone**: Battle-tested auth (password reset, OAuth, email verification, rate limiting) without self-hosting complexity. Works independently of Supabase's DB/storage offerings.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Client (Cloudflare Pages — mutante.club)                   │
│    @supabase/supabase-js (auth only)                        │
│    @colyseus/sdk (game)                                     │
│    Images served from cdn.mutante.club (R2)                 │
└─────────────┬──────────────────┬────────────────────────────┘
              │ WebSocket        │ HTTPS
              ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Hetzner VPS (Docker Compose)                               │
│  ┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │  Colyseus    │ │ youtube  │ │ dream-npc-go│ │ PostgreSQL │ │
│  │  server      │ │ -api (Go)│ │ (Express)│ │            │ │
│  │  :2567       │ │ :8081    │ │ :4000    │ │ :5432      │ │
│  └──────┬───────┘ └──────────┘ └──────────┘ └────────────┘ │
│         │ S3 API                                            │
│         ▼                                                   │
│  ┌─────────────────────┐  ┌──────────────────────────────┐ │
│  │ Cloudflare R2       │  │ Supabase Auth (hosted)       │ │
│  │ cdn.mutante.club    │  │ JWT verification only        │ │
│  └─────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Local Development 403 Troubleshooting (Feb 2026)

**Problem**: YouTube video streaming returns 403 locally even though yt-dlp resolution works.

**Symptom**:

```
[proxy] Upstream connect status=403
[proxy] YouTube returned error 403
```

**Root Cause** (Investigated but not fully resolved):

- yt-dlp can resolve URLs through proxy fine
- httpClient streaming gets 403 even with same proxy
- Works fine in production (Hetzner VPS)
- Suspected cause: IPRoyal proxy may assign different exit IPs per connection when routing from residential IPs vs datacenter IPs

**Implemented Fixes**:

1. **Browser headers on streaming requests** - Go httpClient sends `Go-http-client/1.1` User-Agent by default; added browser-like headers:

   ```go
   req.Header.Set("User-Agent", "Mozilla/5.0 ...")
   req.Header.Set("Origin", "https://www.youtube.com")
   req.Header.Set("Referer", "https://www.youtube.com/")
   ```

2. **Cache busting on 403** - Re-resolves URL if streaming returns 403:

   ```go
   if resp.StatusCode == http.StatusForbidden {
       s.resolveCache.Del(cacheKey)
       // Re-resolve with fresh URL and retry
   }
   ```

3. **Local dev fallback** - When no `PROXY_URL` or `POT_PROVIDER_URL` configured, tries basic yt-dlp without PO tokens (works for some videos)

4. **Better logging** - Logs proxy config status, resolved URLs, retry attempts

**Workaround for Local Dev**:

- Use iframe player fallback instead of WebGL video (`BACKGROUND_VIDEO_RENDERER = 'iframe'`)
- Or test video backgrounds in production only

**Files Modified**:

- `services/youtube-api/main.go` - Added headers, cache busting, logging

**Key Insight**: Production works because the datacenter IP gets consistent proxy routing; local residential IP may get different treatment from IPRoyal.

## Client Rendering Optimizations (Feb 2026)

Implemented four key Phaser rendering performance optimizations to handle 20+ concurrent players efficiently.

### 1. Pathfinding Cache with Dirty Flag

**File**: `client/src/scenes/Game.ts`

**Problem**: `buildBlockedGrid()` was rebuilding the walkability grid on every click-to-move, iterating through all map tiles and obstacles each time.

**Solution**:

- Added `cachedBlockedGrid` and `blockedGridDirty` properties
- Grid is cached after first build and reused until marked dirty
- Added `markBlockedGridDirty()` method for future dynamic obstacles

**Impact**: Eliminates ~100-200 tile iterations per click. With frequent movement, this saves significant CPU.

```typescript
private buildBlockedGrid(): { width: number; height: number; blocked: Uint8Array } {
  // Return cached grid if available and not dirty
  if (!this.blockedGridDirty && this.cachedBlockedGrid) {
    return this.cachedBlockedGrid
  }
  // ... build grid ...
  this.cachedBlockedGrid = { width, height, blocked: expanded }
  this.blockedGridDirty = false
  return this.cachedBlockedGrid
}
```

### 2. OtherPlayer Update Throttling

**File**: `client/src/characters/OtherPlayer.ts`

**Problem**: `preUpdate()` runs every frame for every remote player, even when they're off-screen or stationary.

**Solution**:

- Added `frameCounter` to track update frequency
- Updates now run every 2nd frame instead of every frame
- Adjusted delta calculations to account for 2x frame interval

**Impact**: 50% reduction in update frequency for all remote players.

```typescript
// Only update every 2nd frame
if (this.frameCounter % 2 !== 0) return
const delta = (speed / 1000) * dt * 2 // Account for 2x interval
```

### 3. Viewport Culling & Animation Pause

**File**: `client/src/characters/OtherPlayer.ts`

**Problem**: Even when players are off-screen, Phaser still processes their animations and physics.

**Solution**:

- Added `isInViewport()` check with 100px margin
- Off-screen players skip ALL processing (physics, animations, depth updates)
- Animations pause when off-screen, resume when visible (using `cachedAnimKey`)

**Impact**: With 20 players and 4 visible, ~80% reduction in processing overhead. Animation system work drops significantly.

```typescript
private isInViewport(): boolean {
  const camera = this.scene.cameras.main
  const margin = 100
  return (
    this.x > camera.scrollX - margin &&
    this.x < camera.scrollX + camera.width + margin &&
    this.y > camera.scrollY - margin &&
    this.y < camera.scrollY + camera.height + margin
  )
}
```

### 4. Optimized Depth Updates

**File**: `client/src/characters/OtherPlayer.ts`

**Problem**: `setDepth()` was called every frame during movement, causing unnecessary WebGL state changes.

**Solution**:

- Added `lastDepthY` tracking with `DEPTH_THRESHOLD = 2` pixels
- Consolidated all depth logic into `updateDepth()` method
- Only updates depth when Y position changes by >2px

**Impact**: ~70% reduction in `setDepth()` calls during movement. Players moving horizontally no longer trigger depth updates.

```typescript
private updateDepth(currentAnimKey: string | undefined) {
  let targetDepth = this.y
  // ... calculate target depth based on animation ...

  if (this.lastDepthY === null || Math.abs(targetDepth - this.lastDepthY) > this.DEPTH_THRESHOLD) {
    this.setDepth(targetDepth)
    this.lastDepthY = targetDepth
  }
}
```

### Expected Performance Gains

With 20 concurrent players (4 visible on screen):

- **Pathfinding**: ~100ms saved per click
- **OtherPlayer updates**: ~90% reduction in CPU usage (16 players skipped + 4 at half rate)
- **Animation system**: ~80% reduction in animation overhead (16 players paused)
- **Depth updates**: ~70% reduction in WebGL state changes

**Total estimated savings**: 85-90% reduction in per-frame CPU work for remote players.

### Implementation Notes

- **Viewport margin**: 100px buffer ensures players just outside the visible area still render correctly
- **Animation behavior**: Off-screen players freeze on their current frame. When they re-enter viewport, they resume from where they left off.
- **Dirty flag for future**: The pathfinding cache is ready for dynamic obstacles - just call `markBlockedGridDirty()` when obstacles change.
- **No visual impact**: All optimizations are imperceptible to players. Movement appears smooth due to interpolation and the 2px depth threshold.

## Deployment & Infrastructure Fixes (Feb 2026)

### CORS Configuration

CORS is handled at **one layer only** to avoid duplicate headers:

- **Colyseus matchmaker routes** (`/matchmake/*`): Server handles via `matchMaker.controller.getCorsHeaders`
- **YouTube API service** (`yt.mutante.club`): Go service handles via `corsMiddleware`
- **Caddy**: Only does `reverse_proxy`, no CORS headers (to avoid duplicates)

**Gotcha**: If both Caddy and the backend add CORS headers, you get:

```
Access-Control-Allow-Origin header contains multiple values
```

**uWebSockets + CORS gotcha**: The `getCorsHeaders` callback receives `requestHeaders` as a plain object (not a full request). Access headers directly:

```typescript
matchMaker.controller.getCorsHeaders = function (requestHeaders) {
  const headers = requestHeaders as unknown as Record<string, string>
  const origin = headers?.origin
  // ...
}
```

**CRITICAL: Cannot use `*` with credentials**: When `Access-Control-Allow-Credentials: true`, you CANNOT use `Access-Control-Allow-Origin: *`. Browsers will reject this. You MUST echo back the specific origin:

```typescript
const ALLOWED_ORIGINS = ['https://mutante.club', 'http://localhost:5173', 'http://localhost:3000']

matchMaker.controller.getCorsHeaders = function (requestHeaders) {
  const headers = requestHeaders as unknown as Record<string, string>
  const origin = headers?.origin

  // Echo specific origin (NOT '*') when credentials are enabled
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : 'http://localhost:5173'

  return {
    'Access-Control-Allow-Origin': allowedOrigin, // NOT '*'
    'Access-Control-Allow-Credentials': 'true',
    // ...
  }
}
```

### YouTube API — Direct Client Access (Feb 2026)

Client-3d now calls the Go YouTube service (`yt.mutante.club`) directly, bypassing the Colyseus server:

1. **Client** calls `yt.mutante.club/search?q=...`, `/resolve/{videoId}`, `/proxy/{videoId}` directly
2. **Go service** fetches from YouTube via ISP proxy (for IP consistency)

The `youtubeBaseUrl` in `NetworkManager.ts` is derived from `VITE_YOUTUBE_SERVICE_URL`, falling back to `localhost:8081` for local dev. The Go service duration format (`"2:21"`) is parsed to seconds by `parseDurationToSeconds()` in NetworkManager before being sent to the server schema.

Server-side `youtubeService.ts` is retained only for `prefetchVideo()` (used by DJ queue/jukebox commands to pre-warm the video cache).

### Prefetch System

- **Prefetch** pre-warms video cache: `POST /prefetch/{videoId}`
- **Resolve** gets YouTube URL: `GET /resolve/{videoId}`
- **Proxy** streams cached bytes: `GET /proxy/{videoId}`

The prefetch must use the same `httpClient` (with proxy configured) as the resolve, otherwise YouTube rejects the request due to IP mismatch.

### Docker + Native Modules

**uWebSockets.js** requires glibc 2.38+:

- Alpine Linux won't work (uses musl)
- Use `node:22-slim` or `ubuntu:24.04` as base image

### Immer + Redux + ESM Gotcha

**Problem**: Using `Map` or `Set` in Redux initial state requires `enableMapSet()` before any store code loads.

**Why it's tricky**: ESM hoists all `import` statements to run before any other code, regardless of source order. So this doesn't work:

```typescript
import { enableMapSet } from 'immer'
enableMapSet() // Runs AFTER all imports are evaluated!
import userReducer from './UserStore' // This runs FIRST
```

**Solutions** (in order of preference):

1. **Don't use Map/Set** - use plain `Record<string, T>` objects instead (Immer handles natively)
2. **Side-effect import** - create `immerSetup.ts` that just calls `enableMapSet()`, import it first everywhere
3. **Call in app entry** - import the setup file at the very top of `index.tsx`

**We chose option 1**: Converted `playerNameMap: new Map()` to `playerNameMap: {} as Record<string, string>` in `UserStore.ts`. This avoids the Immer MapSet requirement entirely.

### Server Bundling with tsup

Server is bundled with tsup for deployment:

```typescript
// tsup.config.ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  external: [
    '@colyseus/schema', // Must be external - decorators need runtime
    '@colyseus/command',
    // ... other colyseus packages
    'axios', // Has dynamic require that breaks bundling
  ],
  noExternal: ['@club-mutant/types'], // Bundle shared types
})
```

**Critical**: `@colyseus/schema` must be external so decorator metadata is preserved at runtime.
