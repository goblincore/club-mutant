# client-3d: PSX-Style 3D Multiplayer Client

## Overview

A new client that replaces the existing Phaser 2D top-down view with a **3D PSX-style renderer** using Three.js / react-three-fiber. Same multiplayer concept as club-mutant: players in a room together, chatting, listening to music via synced YouTube playlists.

Characters are **paper-doll rigs** exported from the rig editor (`tools/paper-rig-editor/`): flat textured quads on a bone hierarchy, animated with preset clips, rendered with PSX post-processing (vertex snapping, dithering, color reduction).

## Architecture

### Reuse from existing repo

| Component | Reuse strategy |
|---|---|
| **Colyseus server** | Connect to the same server — no server changes needed |
| **@club-mutant/types** | Import via pnpm workspace (Messages, IOfficeState, Dtos, Rooms) |
| **YouTube search/resolve** | Same server endpoints (`/youtube/*`) |
| **Room system** | Join PUBLIC / CUSTOM rooms with same protocol |

### New in client-3d

| Component | Tech |
|---|---|
| **3D renderer** | Three.js via `@react-three/fiber` + `@react-three/drei` |
| **PSX shaders** | Ported from rig editor (`PsxMaterial.ts`) |
| **Character system** | Load JSON manifests + PNGs, build bone hierarchy, play animations |
| **State management** | Zustand (replaces Redux from old client) |
| **UI overlays** | React + TailwindCSS (chat, playlist, DJ queue) |
| **Networking** | `@colyseus/sdk` — same protocol, cleaner implementation |

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

### M1: Walking around (MVP)
- [ ] Project scaffold + Colyseus connection
- [ ] 3D room with ground plane
- [ ] Paper-doll character rendering (static, default character)
- [ ] WASD movement synced via server
- [ ] Other players visible + moving
- [ ] Nametags

### M2: Chat + music
- [ ] Chat panel + in-world chat bubbles
- [ ] YouTube player integration
- [ ] Playlist panel (room playlist)
- [ ] DJ queue panel
- [ ] Now playing display

### M3: Polish
- [ ] PSX post-processing pass
- [ ] Room furniture / decoration
- [ ] Multiple character skins
- [ ] Sound effects
- [ ] Mobile touch controls

## Open questions

- **Camera style**: Fixed isometric? Follow camera? Player-controlled orbit?
  → Start with fixed isometric, iterate.
- **Room layout**: How to define room geometry? JSON? Tile-based? Free-form?
  → Start with a simple hardcoded flat room, add layout system later.
- **Character facing**: Billboard (always face camera) or direction-based?
  → Direction-based with left/right flip, like PaRappa.
