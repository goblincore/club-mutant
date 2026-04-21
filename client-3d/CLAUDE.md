# client-3d

React + Three.js (R3F) frontend. Main 3D multiplayer client.

## Directory Map

- `src/scene/` — Three.js scene components (rooms, player entities, environment). Inline props live under `src/scene/props/{diner,office,japanese}/`.
- `src/network/` — Colyseus multiplayer layer. `NetworkManager.ts` is the singleton (`getNetwork()`); per-domain message handlers live in `src/network/messages/`. Cross-layer events (scene subscribes to network) go through `src/network/events.ts`.
- `src/stores/` — Zustand state stores (gameStore, musicStore, chatStore, panelStore, settingsStore, boothStore, jukeboxStore, etc.)
- `src/ui/` — React UI panels and overlays (chat, DJ queue, settings, auth, playlists, profiles)
- `src/ui/konpyuuta/` — KonpyuuTA integration (shell, bridge host, app registry)
- `src/ui/components/` — Shared UI components
- `src/character/` — Avatar/NPC character rendering and animation
- `src/audio/` — Audio system (music playback, NPC TTS). Dream audio engine split under `src/audio/dreamAudio/`.
- `src/services/` — External service adapters (e.g. `messengerService` for Nakama DMs)
- `src/shaders/` — Custom GLSL shaders (VHS/PSX post-processing)
- `src/dream/` — Dream mode bridge and state
- `src/hooks/` — React hooks
- `src/input/` — Input handling

## Key Patterns

### Adding a new UI panel
1. Create component in `src/ui/YourPanel.tsx`
2. Add visibility state to `src/stores/panelStore.ts` (panel toggles) or `src/stores/settingsStore.ts` (render settings)
3. Render conditionally in the appropriate parent (usually `src/scene/GameScene.tsx` or a room component)

### Handling a new network message
1. Define the message enum value in `types/Messages.ts`
2. Add a handler in the appropriate file under `src/network/messages/` (or a new one if it's a new domain) and wire it from `NetworkManager.wireRoomListeners()`
3. Update the relevant Zustand store from the handler
4. If the handler needs to trigger scene behavior, emit via `src/network/events.ts` — never import from `src/scene/`

### State management
- Client state: Zustand stores in `src/stores/`
- Server-authoritative state: Colyseus schema listeners set up in `NetworkManager.ts` via `getStateCallbacks()`
- Types for server state: `@club-mutant/types/RoomState` (the Colyseus schema classes — same file the server uses)

## Build

```bash
pnpm dev    # Vite dev server (port 5173)
pnpm build  # Production build
```

Requires `packages/konpyuuta` to be built first (`pnpm --filter @club-mutant/konpyuuta build`).
