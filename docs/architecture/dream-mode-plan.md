# Dream Mode — Yume Nikki-Inspired Exploration for Club Mutant

## Context

Club Mutant is a multiplayer turntable.fm-style music app where players hang out in 3D rooms, build playlists, and listen together. It already has three room types: the social Club lobby, a Jukebox diner, and a personal Japanese bedroom (MyRoom).

This plan adds **Dream Mode** — a solitary, surreal exploration layer triggered by sleeping in the futon in MyRoom. Inspired by Yume Nikki's design (hub world → doors → strange worlds → collectibles → wake up), but adapted to the unique context of a social music app. The conceptual tension — a communal music hangout that contains a deeply private dream world — is the point.

---

## 1. Aesthetic Approach: Recommendation

**Recommended: Option B — 2D pixel art for dreams, distinct from the 3D rooms.**

Reasons:
- **Dream contrast**: The shift from 3D PSX to flat pixel art creates a tangible "falling asleep" feeling. The world literally flattens. This mirrors how Yume Nikki's crude RPG Maker aesthetic contributes to its dreamlike quality — it doesn't look polished, it looks *remembered*.
- **AI generation path**: 2D tile-based worlds with pixel art sprites are dramatically easier for AI to generate. LLMs can output tile grid JSON trivially; pixel art generation APIs (PixelLab, Retro Diffusion) produce game-ready assets. 3D generation is orders of magnitude harder.
- **Production speed**: Hand-authored dream worlds are faster to build in 2D. A room is a tile grid + a few sprite sheets, not a full 3D scene with shaders, GLBs, and lighting rigs.
- **Technical fit**: Three.js handles 2D tile grids perfectly via orthographic camera + textured planes with `NearestFilter`. The existing layer-based rendering system (layer 0 for scene with VHS, layer 1 for UI clean) already supports this.

**How it would look**: Top-down orthographic view. Chunky pixel art tiles (16×16 or 32×32). Character becomes a small sprite (like classic RPG Maker). Each dream world has its own palette and tile set. The VHS post-processing still applies (scanlines + noise over pixel art = chef's kiss).

**Transition effect**: When the player sleeps, the 3D camera slowly zooms into the futon, the screen fades/dissolves with static, and the scene switches to the 2D dream renderer. Waking up reverses this.

---

## 2. Architecture Overview

### What changes

```
┌─────────────────────────────────────────────────┐
│                  GameScene.tsx                   │
│                                                 │
│  roomType === 'myroom'  → <JapaneseRoom>        │
│  roomType === 'jukebox' → <JukeboxRoom>         │
│  roomType === 'dream'   → <DreamRenderer> (NEW) │
│  else                   → <Room>                │
└─────────────────────────────────────────────────┘
```

Dream Mode is **not a separate Colyseus room**. It's a **client-side scene state within MyRoom**. The player stays in their MyRoom Colyseus room the whole time — the server just knows `player.isDreaming = true` (so other players visiting your room see your character asleep in bed). The dream content itself is entirely client-side.

Why client-side? Dreams are single-player. There's no multiplayer state to sync. The server doesn't need to know which dream tile you're standing on. It only needs to know:
- That you're dreaming (for display to visitors)
- What collectibles you've found (for persistence)

### New files (estimated)

```
client-3d/src/dream/                    ← new directory
  DreamRenderer.tsx                     ← top-level dream scene (replaces Room in GameScene)
  DreamNexus.tsx                        ← hub world with doors
  DreamWorld.tsx                        ← renders a single dream world from JSON definition
  DreamTileGrid.tsx                     ← the 2D tile rendering engine
  DreamPlayer.tsx                       ← 2D sprite character for dreams
  DreamTransition.tsx                   ← sleep/wake transition effects
  dreamStore.ts                         ← Zustand store for dream state
  dreamMovement.ts                      ← grid-based movement + collision for 2D
  types.ts                              ← DreamWorldDef, TileDef, CollectibleDef, etc.

client-3d/src/dream/worlds/             ← hand-authored dream world JSON files
  nexus.json
  forest.json
  static-world.json
  ... (more worlds added over time)

client-3d/public/textures/dream/        ← dream tile/sprite assets
  tiles/                                ← tile sheets per world
  sprites/                              ← character + NPC sprites
  collectibles/                         ← collectible item sprites

server/src/rooms/schema/OfficeState.ts  ← add Player.isDreaming, Player.collectibles
types/Messages.ts                       ← add DREAM_SLEEP, DREAM_WAKE, DREAM_COLLECT
```

---

## 3. The Dream World Content Format

A JSON schema that works for both hand-authoring and AI generation:

```jsonc
{
  "id": "forest_of_static",
  "name": "Forest of Static",          // internal, never shown to player
  "tileSize": 16,                       // pixels per tile
  "width": 40,                          // tiles
  "height": 30,                         // tiles
  "tileset": "dream/tiles/forest.png",  // sprite sheet reference
  "palette": ["#0a0a0a", "#1a3a1a", "#3a6a3a", "#88cc88"],  // dominant colors (for shader tinting)

  "layers": [
    {
      "name": "ground",
      "data": [0,0,1,1,2,2,...]         // flat array, row-major, tile indices into tileset
    },
    {
      "name": "objects",                 // above ground — trees, furniture, etc.
      "data": [-1,-1,5,5,-1,...]         // -1 = empty
    },
    {
      "name": "collision",
      "data": [0,0,1,1,0,0,...]         // 1 = blocked
    }
  ],

  "spawnX": 20,                         // tile coords
  "spawnY": 25,

  "exits": [
    { "x": 20, "y": 0, "target": "nexus", "spawnX": 6, "spawnY": 6 }
  ],

  "collectibles": [
    {
      "id": "static_flower",
      "x": 12, "y": 8,
      "sprite": "dream/collectibles/static_flower.png",
      "shelfModel": "/models/shelf-items/static_flower.glb"  // shows up in MyRoom
    }
  ],

  "events": [
    {
      "id": "tv_head_npc",
      "type": "proximity",              // triggers when player walks near
      "x": 25, "y": 15, "radius": 2,
      "action": "dialogue",             // or "animation", "sound", "teleport", "visual"
      "data": { "text": "...", "duration": 3000 }
    },
    {
      "id": "rare_glitch",
      "type": "random",                 // chance-based on room entry
      "chance": 0.03,                   // 3% chance
      "action": "replace_tileset",
      "data": { "tileset": "dream/tiles/forest_glitch.png", "duration": 5000 }
    }
  ],

  "ambientSound": "dream/audio/forest_hum.mp3",  // optional
  "shader": "default"                   // or "dither", "invert", "wave" — post-process variant
}
```

This format is:
- **Hand-authorable**: A designer writes JSON + draws a tile sheet
- **AI-generable**: An LLM can produce this JSON given a prompt and a list of available tile indices
- **Compact**: A 40×30 world with 3 layers is ~3,600 integers + metadata

---

## 4. The Nexus (Dream Hub)

The Nexus is the first thing you see when you fall asleep. It's the hub connecting all dream worlds.

**Design**: A dark, circular room with doors arranged around the perimeter (like Yume Nikki). The floor has a distinctive pattern. Each door has a unique visual — a color, a symbol, a texture — hinting at the world behind it. Some doors are locked (greyed out) until you find the corresponding collectible.

**Initial implementation**: 5-6 doors. Not all lead somewhere yet — some are visually present but non-functional (creates mystery and anticipation, just like Yume Nikki where you wonder what's behind each door before you try it).

**Wake-up mechanism**: A special "bed" tile/object in the center of the Nexus. Walking to it and pressing interact shows "Pinch your cheek?" prompt. Confirming wakes you up (returns to 3D MyRoom). This can also be triggered from any dream world via a UI button (like pressing Esc → "Wake up?").

**Collectible display**: As you collect items from dream worlds, they appear as small sprites around the Nexus center (like Yume Nikki's egg arrangement). This gives visual progress.

---

## 5. Dream Worlds (Initial Set)

Starting with 3-4 hand-authored worlds that establish distinct moods. Each should feel like a complete "place" even if small:

### World 1: "The Static Forest"
- Dense trees made of TV static patterns
- Monochrome palette (greens/blacks) with occasional color bleed
- Ambient sound: low hum, faint radio tuning
- Collectible: "Static Flower" — a flower that flickers between frames
- Size: ~40×30 tiles

### World 2: "The Infinite Hallway"
- Long, narrow corridor that wraps/loops
- Repeating doors that don't open (except one)
- Walls shift color as you walk
- Collectible: "Door Key" — but there's no door it fits
- Event: rare chance of hallway inverting colors

### World 3: "The Record Sea"
- Open water-like area with floating vinyl records as stepping stones
- Moving platforms (records drift slowly)
- The "water" is actually waveform patterns
- Connects thematically to the music app — dreams bleed into what you do while awake
- Collectible: "Broken Record" — plays a snippet of the last song you heard in the club

### World 4: "The Audience"
- A stage facing rows of empty chairs that slowly fill with shadowy figures
- Walking to the mic on stage causes all figures to turn and face you
- No collectible — this is purely atmospheric (like Yume Nikki's Monochrome Land)
- Event: if you stand at the mic for 30 seconds, the audience applauds (sound only, then vanishes)

---

## 6. Sleep/Wake Transitions

### Falling Asleep (MyRoom → Dream)

1. Player walks to futon in MyRoom, clicks it (via `InteractableObject`)
2. Prompt: "Go to sleep?" (same style as BoothPrompt)
3. On confirm:
   - Server message `DREAM_SLEEP` → sets `player.isDreaming = true`
   - Client plays transition: screen slowly fades through static/noise (1.5-2 seconds)
   - `gameStore.isDreaming = true` → `GameScene.tsx` swaps to `<DreamRenderer>`
   - Dream starts at Nexus hub spawn point

### Waking Up (Dream → MyRoom)

1. Player interacts with bed in Nexus center, or uses wake-up UI button
2. Prompt: "Pinch your cheek?"
3. On confirm:
   - Client plays reverse transition (static → 3D room fades in)
   - Server message `DREAM_WAKE` → sets `player.isDreaming = false`
   - `gameStore.isDreaming = false` → `GameScene.tsx` swaps back to `<JapaneseRoom>`
   - Player position restored to futon in MyRoom

### What visitors see
When someone visits your MyRoom while you're dreaming, they see your character lying on the futon with a `zzz` bubble animation. The room is otherwise normal — they can look at your shelf of collectibles.

---

## 7. 2D Tile Rendering Engine

The dream renderer uses Three.js with an orthographic camera looking straight down.

### DreamTileGrid.tsx
- Creates a `THREE.InstancedMesh` or individual planes for each tile
- Each tile is a `PlaneGeometry` with UV-mapped region of the tileset spritesheet
- Uses `THREE.NearestFilter` on all textures for crisp pixel art
- Orthographic camera: `left/right/top/bottom` sized to show ~20×15 tiles (adjustable zoom)
- Camera follows player with slight lerp delay (reuse `FOLLOW_LERP` concept from 3D camera)

### DreamPlayer.tsx
- Sprite-based character on a textured quad
- 4-directional walk animation (swap UV frames like a spritesheet)
- Grid-aligned movement with smooth lerp between tiles
- Could reuse the existing paper-doll character rendered to a canvas as a sprite texture (creative bridge between 3D and 2D aesthetic)

### Rendering pipeline
- Layer 0: dream tile grid + sprites → rendered to scene RT at low resolution (maybe 240p for extra chunky pixels)
- VHS post-process still applies (scanlines + noise give the pixel art a "received signal" quality)
- Layer 1: UI (wake-up button, collectible popup) rendered clean
- Could add dream-specific post-process variants: heavier dithering, palette limitation, wave distortion per-world

### Movement system (dreamMovement.ts)
- Grid-based: player moves tile-to-tile (not free movement like 3D rooms)
- WASD or arrow keys, one tile per keypress (with held-key repeat)
- Collision check against the world's `collision` layer
- Exit tiles trigger world transition (fade to black → load new world → fade in)
- Smooth position lerp between tiles (~150ms per step) for fluid movement feel

---

## 8. Collectibles & Persistence

### Finding collectibles
- Walk over a collectible tile → sprite sparkles, floats up, UI popup: "Found: Static Flower"
- Collectible disappears from the dream world (per-player, persistent)
- Server message `DREAM_COLLECT { collectibleId }` persists it

### Storage
- For now (pre-accounts): `localStorage` on client + `Player.collectibles` on server schema for session
- When accounts arrive: server-side persistent storage (database)
- Collectible IDs are simple strings like `"static_flower"`, `"broken_record"`

### Display in MyRoom
- The wooden shelf in JapaneseRoom (currently holding trophies) becomes the **collectible display shelf**
- Each collected item has a `shelfModel` (small GLB) that appears on the shelf
- Empty shelf slots remain as-is (or show a faint silhouette/shadow hinting at what goes there)
- This creates a tangible bridge between dream exploration and the "real" room

### Collectible effects (future)
- Some collectibles could modify the dream (unlock a new Nexus door, change a world's tileset)
- Some could modify MyRoom (new furniture, ambient sounds, wall decorations)
- Some could be cosmetic for the 3D character (hat, aura, particle effect visible to other players in the club)

---

## 9. Server-Side Considerations

### Minimal server involvement
The server tracks very little about dreams:

```typescript
// Player schema additions
@type('boolean') isDreaming: boolean = false
@type(['string']) collectibles = new ArraySchema<string>()  // collected item IDs

// Messages
DREAM_SLEEP    // client → server: player fell asleep
DREAM_WAKE     // client → server: player woke up
DREAM_COLLECT  // client → server: { collectibleId: string }
DREAM_GENERATE // client → server → AI → server → client: request AI-generated dream
```

### Server commands
- `DreamSleepCommand`: Sets `player.isDreaming = true`, broadcasts to room (visitors see sleeping animation)
- `DreamWakeCommand`: Sets `player.isDreaming = false`
- `DreamCollectCommand`: Validates collectible ID exists, adds to `player.collectibles` if not already present, broadcasts updated list

### Dream generation endpoint (for AI dreams)
- `POST /dream/generate` — server-side endpoint that calls Claude API with prompt + player context
- Returns dream world JSON to the requesting client
- The server proxies the AI call (keeps API keys server-side, allows caching/rate-limiting)
- This is an HTTP endpoint (not a Colyseus message) since it's a request/response pattern with potentially 2-3 second latency

### No dream world sync
Dream worlds are loaded and run entirely on the client. The server doesn't know or care which dream world you're in, what tile you're on, or what events you've triggered. It only tracks the durable outcomes (collectibles found, dreaming state).

### Path to shared dreams (future consideration)
Currently dreams are client-side only. To support two players dreaming together:

**What would change:**
- Dream state would move to a **nested Colyseus room** (a second room the player joins while staying in MyRoom)
- Player positions, events, and collectible pickups would sync via Colyseus schema
- The dream world JSON would need to be shared (server sends same world def to both clients)

**Complexity estimate:** Medium-high. The main challenges are:
1. **Dual room membership** — player connected to both MyRoom room and Dream room simultaneously. Colyseus supports this natively (a client can join multiple rooms), but the client code would need to manage two room connections.
2. **Synchronized dream generation** — if using AI-generated dreams, both players need the same world. Solution: generate once, cache by seed, share the seed.
3. **Dream invitation UX** — how does player A invite player B into their dream? Could be: player B visits A's MyRoom, sees them sleeping, clicks the sleeping character to "enter their dream".

**When to build this:** After the single-player dream system is solid. The tile engine, world format, and rendering are identical — only the state management layer changes. Design the `dreamStore` with this in mind (keep world state in a shape that could be backed by Colyseus schema later).

---

## 10. AI Generation Pipeline

AI-generated dreams are a core part of the vision, not an afterthought. The approach: build the tile rendering engine first, then immediately wire it to an LLM that composes worlds from a hand-drawn tile library. This means even Phase 1 includes AI generation.

### How it works

1. **Tile library**: A set of hand-drawn tilesets with standardized tile indices. Each tileset is a PNG sprite sheet (e.g., 16 tiles in a 4×4 grid). A tileset has a **manifest** listing what each index means:
   ```jsonc
   // dream/tiles/forest/manifest.json
   {
     "id": "forest",
     "tileSize": 16,
     "columns": 4,
     "tiles": {
       "0": { "name": "grass", "walkable": true },
       "1": { "name": "dark_grass", "walkable": true },
       "2": { "name": "tree_trunk", "walkable": false },
       "3": { "name": "tree_canopy", "walkable": false },
       "4": { "name": "path", "walkable": true },
       "5": { "name": "water", "walkable": false },
       "6": { "name": "bridge", "walkable": true },
       "7": { "name": "flower", "walkable": true },
       "8": { "name": "rock", "walkable": false },
       "9": { "name": "mushroom", "walkable": true },
       "10": { "name": "static_patch", "walkable": true },
       "11": { "name": "door", "walkable": true, "special": "exit" }
     }
   }
   ```

2. **LLM prompt**: The server sends the tile manifest + player context to Claude Haiku:
   ```
   You are generating a dream world for a Yume Nikki-inspired game.

   Available tileset: "forest"
   Tile definitions: [manifest tiles above]

   Player context:
   - Recently listened to: "Radiohead - Everything In Its Right Place", "Boards of Canada - Roygbiv"
   - Collected items so far: ["static_flower"]
   - Dream count: 3 (they've dreamed before)

   Generate a 30×20 surreal dream world as JSON. Include:
   - A ground layer (every tile filled)
   - An objects layer (sparse decorative/blocking objects)
   - A collision layer (derived from tile walkability)
   - 1-2 exit tiles leading back to "nexus"
   - 0-1 collectible placement
   - 0-2 events (proximity-triggered surreal moments)

   Make it feel dreamlike and strange. Paths should meander.
   Dead ends are ok. Not everything needs to make sense.

   Output valid JSON matching this schema: [DreamWorldDef schema]
   ```

3. **Generation timing**: 2-3 seconds for Claude Haiku. This maps perfectly to a "falling asleep" transition animation — the player closes their eyes (screen fades through static), the LLM generates in the background, the dream world fades in when ready.

4. **Cost**: ~$0.001–0.005 per dream at Claude Haiku rates. Negligible even at scale.

5. **Caching**: Generated worlds are cached by a hash of (tileset + player context snapshot). If a player re-enters the same dream, they get the cached version (exploration progress preserved). New dreams only generate when context changes meaningfully.

6. **Fallback**: If the AI call fails or times out, fall back to a pre-authored world from the static library. The player doesn't need to know.

### The Nexus is always hand-authored
The Nexus hub is a fixed, hand-authored world. It's the one constant — doors in consistent positions, collectible display in the center. Only the worlds behind the doors are AI-generated (or hand-authored for special/curated worlds).

---

## 11. Implementation Phases

### Phase 1: Engine + AI Foundation
> Goal: Build the 2D dream rendering engine and wire it to AI generation from day one. Player can sleep, enter a hand-authored Nexus, walk through a door into an AI-generated world, find a collectible, wake up, see it on shelf.

**Infrastructure:**
1. **Make futon interactable** in `JapaneseRoom.tsx` — wrap in `InteractableObject`, show sleep prompt
2. **Add dream state** to `gameStore.ts` and `dreamStore.ts` (`isDreaming`, `currentWorld`, `collectedItems`, `nexusState`)
3. **Add server messages** (`DREAM_SLEEP`, `DREAM_WAKE`, `DREAM_COLLECT`) + Player schema fields
4. **Sleep/wake transition** — static/noise fade effect in `DreamTransition.tsx`
5. **`GameScene.tsx` routing** — when `isDreaming`, render `<DreamRenderer>` instead of room component

**Tile engine:**
6. **`DreamRenderer.tsx`** — top-level scene: orthographic camera, world loader, player, UI overlay
7. **`DreamTileGrid.tsx`** — renders world from JSON: instanced planes with UV-mapped tileset regions, `NearestFilter`
8. **`DreamPlayer.tsx`** — sprite character with 4-direction walk animation on a textured quad
9. **`dreamMovement.ts`** — grid-based WASD movement, collision against world data, smooth tile-to-tile lerp
10. **Exit tiles** — stepping on an exit triggers world transition (fade → load → fade in)

**Content + AI:**
11. **Hand-author the Nexus** — world JSON + tileset PNG (dark room, 5-6 doors, bed in center)
12. **Draw 2-3 tile libraries** — forest, hallway, abstract (each: 16-tile sprite sheet + manifest JSON)
13. **Server dream generation endpoint** — `POST /dream/generate` calls Claude Haiku with tile manifest + context, returns world JSON
14. **Client integration** — when player walks through a Nexus door, client requests generated dream from server, shows "falling asleep deeper..." animation during 2-3s generation, renders result
15. **Static fallback worlds** — 2-3 pre-authored JSONs that load if AI generation fails

**Collectibles:**
16. **Collectible pickup** — walk over → sprite animation → "Found: X" popup → server persist
17. **Shelf display** — replace trophy GLBs on MyRoom shelf with collected dream items

### Phase 2: Polish + Events + Atmosphere
> Goal: Dreams feel alive and atmospheric. Events create memorable surreal moments. Post-processing enhances the dreamlike quality.

18. **Events system** — proximity triggers, random-on-entry events, NPC interactions (all from world JSON `events` array)
19. **Dream-specific post-processing** — per-world shader variants (heavier dithering, palette limitation, wave distortion, color inversion) — extend `PsxPostProcess` with dream mode
20. **Ambient sound** — per-world audio loops, fade in/out on world transitions
21. **Transition polish** — camera zoom into bed before fade, dream static dissolve, smooth world-to-world cuts
22. **"zzz" sleeping display** — visitors to MyRoom see player character asleep on futon with animated zzz bubbles
23. **Wake-up UI** — persistent "Pinch cheek" button overlay during dreams (escape hatch from any world)
24. **Collectible effects** — some items unlock new Nexus doors, some add decorations to MyRoom
25. **Nexus collectible display** — found items appear as sprites arranged around Nexus center

### Phase 3: Personalization + Depth
> Goal: Dreams are shaped by the player's social activity in the music app. Each person's dream feels uniquely theirs.

26. **Activity-aware generation** — feed player data into LLM prompts:
    - Songs listened to → influence world theme/palette/mood text in prompt
    - Chat messages → fragments appear as NPC "dialogue" or wall text
    - Other players interacted with → shadowy NPC silhouettes
    - Time of day → world brightness/color temperature
27. **Dream diary** — journal UI that records visited worlds with thumbnail + date + collectibles found
28. **AI-generated tilesets** — use pixel art generation APIs (PixelLab/Retro Diffusion) to create custom tile sheets per player, cached after first generation
29. **Character cosmetics from dreams** — some collectibles give aura/hat/particle effects visible to others in the club rooms
30. **Shared dreams** (if pursuing multiplayer dreams) — second player can "enter" a sleeping player's dream via their MyRoom

---

## 12. Key Files to Modify

| File | Change |
|------|--------|
| `types/Rooms.ts` | No change needed (dream is a state within MyRoom, not a new room type) |
| `types/Messages.ts` | Add `DREAM_SLEEP`, `DREAM_WAKE`, `DREAM_COLLECT` |
| `server/src/rooms/schema/OfficeState.ts` | Add `isDreaming: boolean`, `collectibles: ArraySchema<string>` to Player |
| `server/src/rooms/ClubMutant.ts` | Add dream message handlers |
| `server/src/rooms/commands/DreamCommand.ts` | New — sleep/wake/collect commands |
| `client-3d/src/scene/JapaneseRoom.tsx` | Wrap futon in `InteractableObject` with sleep prompt |
| `client-3d/src/scene/GameScene.tsx` | Add `isDreaming` check → render `<DreamRenderer>` instead of room |
| `client-3d/src/stores/gameStore.ts` | Add `isDreaming`, `currentDreamWorld`, `collectedItems` |
| `client-3d/src/dream/` | New directory — all dream mode code |
| `client-3d/public/textures/dream/` | New directory — tile sheets + sprite assets |

---

## 13. Verification

### How to test Phase 1 end-to-end
1. Start server (`cd server && npm run start`)
2. Start 3D client (`cd client-3d && pnpm dev`)
3. Join MyRoom from lobby
4. Walk to futon, click it → sleep prompt appears
5. Confirm → screen transitions to 2D dream Nexus
6. Walk through a door → loads Static Forest world
7. Walk to collectible → pickup popup, item collected
8. Walk to exit tile → returns to Nexus
9. Walk to bed in Nexus center → "Pinch cheek?" prompt
10. Confirm → transitions back to 3D MyRoom
11. Look at shelf → collected item appears as GLB on shelf
12. Open a second browser tab, join same MyRoom → see first player sleeping on futon with zzz bubble
