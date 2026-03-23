# client-3d

React + Three.js (R3F) frontend. Main 3D multiplayer client.

## Directory Map

- `src/scene/` — Three.js scene components (rooms, player entities, environment)
- `src/network/` — Colyseus multiplayer layer. `NetworkManager.ts` is the singleton (`getNetwork()`)
- `src/stores/` — Zustand state stores (gameStore, musicStore, chatStore, uiStore, boothStore, jukeboxStore, os5000kStore, etc.)
- `src/ui/` — React UI panels and overlays (chat, DJ queue, settings, auth, playlists, profiles)
- `src/ui/os5000k/` — OS5000k integration (shell, bridge host, app registry)
- `src/ui/components/` — Shared UI components
- `src/character/` — Avatar/NPC character rendering and animation
- `src/audio/` — Audio system (music playback, NPC TTS)
- `src/shaders/` — Custom GLSL shaders (VHS/PSX post-processing)
- `src/dream/` — Dream mode bridge and state
- `src/hooks/` — React hooks
- `src/input/` — Input handling
- `src/events/` — Event system

## Key Patterns

### Adding a new UI panel
1. Create component in `src/ui/YourPanel.tsx`
2. Add visibility state to `src/stores/uiStore.ts`
3. Render conditionally in the appropriate parent (usually `src/scene/GameScene.tsx` or a room component)

### Handling a new network message
1. Define the message enum value in `types/Messages.ts`
2. Add `room.onMessage(Message.YOUR_MSG, ...)` handler in `src/network/NetworkManager.ts`
3. Update the relevant Zustand store from the handler

### State management
- Client state: Zustand stores in `src/stores/`
- Server-authoritative state: Colyseus schema listeners set up in `NetworkManager.ts` via `getStateCallbacks()`
- Types for server state: `@club-mutant/types/IOfficeState`

## Build

```bash
pnpm dev    # Vite dev server (port 5173)
pnpm build  # Production build
```

Requires `packages/os5000k` to be built first (`pnpm --filter @club-mutant/os5000k build`).
