# AI NPC / Dungeon Master for Club Mutant

A plan to run a small LLM on a VPS as an interactive game character that players can chat with, and that can orchestrate in-world events like spawning enemies, placing objects, and running dynamic encounters.

---

## Feasibility: Yes, Very Doable

With modern quantized models, you can run capable LLMs on modest VPS hardware. The key is choosing the right model size and inference engine.

---

## Model Options (Smallest → Largest)

| Model            | Parameters | VRAM/RAM | Quality   | Notes                         |
| ---------------- | ---------- | -------- | --------- | ----------------------------- |
| **Phi-3.5-mini** | 3.8B       | ~2-3GB   | Good      | Microsoft, great for its size |
| **Qwen2.5-3B**   | 3B         | ~2GB     | Good      | Alibaba, multilingual         |
| **Llama-3.2-3B** | 3B         | ~2GB     | Good      | Meta's latest small model     |
| **Mistral-7B**   | 7B         | ~4-5GB   | Very Good | Sweet spot for quality/size   |
| **Llama-3.1-8B** | 8B         | ~5-6GB   | Excellent | Best quality for self-hosted  |
| **Gemma-2-9B**   | 9B         | ~6GB     | Excellent | Google, strong reasoning      |

**Recommendation**: Start with **Llama-3.2-3B** or **Phi-3.5-mini** (Q4 quantized). Can run on CPU-only VPS with 4GB RAM.

---

## Inference Engine Options

### 1. **llama.cpp** (Recommended for VPS)

- CPU-only inference, no GPU required
- Supports GGUF quantized models
- ~1-5 tokens/sec on CPU (acceptable for chat)
- Run via: `llama-server` or `ollama`

### 2. **Ollama** (Easiest setup)

```bash
# Install
curl -fsSL https://ollama.com/install.sh | sh

# Pull model
ollama pull llama3.2:3b

# Run API server (default port 11434)
ollama serve
```

- REST API built-in: `POST /api/generate`
- Model management handled for you
- ~2-4GB RAM for 3B model

### 3. **vLLM** (If you have GPU)

- Requires NVIDIA GPU (even a small one helps)
- Much faster inference
- More complex setup

---

## VPS Hardware Requirements

| Tier            | RAM  | CPU    | Cost    | Model Size |
| --------------- | ---- | ------ | ------- | ---------- |
| **Minimum**     | 4GB  | 2 vCPU | ~$6/mo  | 3B Q4      |
| **Comfortable** | 8GB  | 4 vCPU | ~$12/mo | 7B Q4      |
| **Optimal**     | 16GB | 8 vCPU | ~$24/mo | 8B Q5      |

Hetzner CPX21 (4GB/3vCPU, ~€5/mo) would work for a 3B model.

---

## Architecture: Integration with Colyseus

```
┌─────────────────────────────────────────────────────────────────┐
│                         VPS (Hetzner)                           │
│                                                                 │
│  ┌─────────────────┐     ┌────────────────────────────────────┐ │
│  │  Colyseus Room  │     │  LLM Service (Ollama)              │ │
│  │  ClubMutant.ts  │────▶│  - POST /api/generate              │ │
│  │                 │◀────│  - System prompt: "You are..."     │ │
│  │  - AI NPC state │     │  - Context: game state, chat hist  │ │
│  │  - Chat handler │     └────────────────────────────────────┘ │
│  └─────────────────┘                                            │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐                                            │
│  │  Players        │                                            │
│  │  - Chat w/ NPC  │                                            │
│  │  - See NPC move │                                            │
│  └─────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Server-Side Flow

1. **NPC as a "Bot Player"** in Colyseus
   - Add to `state.players` like a real player
   - Has position, animation, name ("DJ Bot", "Mutant Oracle", etc.)
   - Server controls its movement/actions

2. **Chat Handler**

   ```typescript
   // server/src/rooms/ClubMutant.ts
   this.onMessage(Message.CHAT, async (client, data) => {
     // Check if message mentions AI NPC or is near NPC
     if (this.shouldNPCRespond(client, data.content)) {
       const response = await this.queryLLM(data.content, client.sessionId);

       // NPC "speaks" via chat
       this.broadcast(Message.ADD_CHAT_MESSAGE, {
         clientId: "ai-npc",
         content: response.text,
       });

       // NPC can also perform actions
       if (response.action === "play_music") {
         await this.npcPlaysSong(response.songQuery);
       }
     }
   });
   ```

3. **LLM Query Service**

   ```typescript
   // server/src/services/llmService.ts
   const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

   export async function queryLLM(
     userMessage: string,
     context: { playerName: string; roomState: string },
   ): Promise<{ text: string; action?: string }> {
     const systemPrompt = `You are a friendly mutant DJ at Club Mutant. 
     You can chat with visitors and play music for them.
     Current players: ${context.roomState}
     
     If the user asks you to play music, respond with:
     [ACTION:play_music:search query]
     
     Keep responses short (1-2 sentences).`;

     const response = await fetch(`${OLLAMA_URL}/api/generate`, {
       method: "POST",
       body: JSON.stringify({
         model: "llama3.2:3b",
         prompt: userMessage,
         system: systemPrompt,
         stream: false,
       }),
     });

     const result = await response.json();
     return parseResponse(result.response);
   }
   ```

---

## NPC Behaviors (What It Can Do)

| Behavior               | Implementation                                 |
| ---------------------- | ---------------------------------------------- |
| **Chat**               | Respond to @mentions or proximity chat         |
| **Play music**         | Parse "play X" requests → add to room playlist |
| **Move around**        | Random wandering or pathfind to interact       |
| **React to events**    | "Welcome {player}!" when someone joins         |
| **DJ booth**           | Take over DJ booth and curate music            |
| **Ambient commentary** | Occasionally comment on what's playing         |

---

## Prompt Engineering Tips

```
System prompt should include:
1. Personality: "You are a chill mutant DJ who loves obscure music"
2. Constraints: "Keep responses under 50 words"
3. Action format: "Use [ACTION:type:param] for game actions"
4. Context: Current players, what's playing, recent chat
```

---

## Response Time Expectations

| Model | Hardware   | Tokens/sec | Response Time (50 tokens) |
| ----- | ---------- | ---------- | ------------------------- |
| 3B Q4 | CPU 4-core | ~3-5       | ~10-15 sec                |
| 3B Q4 | CPU 8-core | ~5-8       | ~6-10 sec                 |
| 7B Q4 | CPU 8-core | ~2-4       | ~12-25 sec                |
| 7B Q4 | GPU (T4)   | ~30-50     | ~1-2 sec                  |

For a chat NPC, 10-15 second response time is acceptable (shows "typing..." indicator).

---

## Deployment Options

### Option A: Same VPS as Colyseus

- Simplest setup
- May compete for RAM/CPU
- Works if you use a small model

### Option B: Separate LLM VPS

- Dedicated resources
- Can scale independently
- Slight network latency added

### Option C: Use an API (OpenAI, Anthropic, Groq)

- No self-hosting complexity
- Pay per token (~$0.001/1K tokens for small models)
- Groq is free tier available and very fast

---

## Recommended Starting Point

1. **Add Ollama to `docker-compose.yml`**:

   ```yaml
   ollama:
     image: ollama/ollama
     volumes:
       - ollama_data:/root/.ollama
     environment:
       - OLLAMA_HOST=0.0.0.0
   ```

2. **Pull a small model**:

   ```bash
   docker exec ollama ollama pull llama3.2:3b
   ```

3. **Create `server/src/services/llmService.ts`**

4. **Add NPC entity to room state**

5. **Wire chat handler to query LLM**

---

## Dungeon Master Mode: Orchestrating World Events

The LLM can act as a **game master** that observes the world state and dynamically creates events, spawns entities, and runs encounters.

### Capabilities

| Action                 | Description                                   | Server Implementation              |
| ---------------------- | --------------------------------------------- | ---------------------------------- |
| **Spawn enemies**      | Create hostile NPCs that chase/attack players | Add to `state.enemies` ArraySchema |
| **Place objects**      | Drop items, obstacles, powerups               | Add to `state.worldObjects`        |
| **Trigger events**     | Lights flicker, music changes, announcement   | Broadcast event message            |
| **Control NPCs**       | Move friendly NPCs, make them speak           | Update NPC position/chat           |
| **Modify environment** | Open/close doors, change room lighting        | Update `state.environment`         |
| **Run encounters**     | Multi-step scripted sequences                 | State machine + LLM decisions      |

### Action Schema

The LLM outputs structured actions that the server parses and executes:

```typescript
// LLM returns JSON actions
interface DMAction {
  type: 'spawn_enemy' | 'place_object' | 'announce' | 'move_npc' | 'trigger_event'
  params: Record<string, unknown>
}

// Examples:
{ type: 'spawn_enemy', params: { kind: 'zombie', x: 500, y: 300, count: 3 } }
{ type: 'place_object', params: { kind: 'health_pack', x: 200, y: 400 } }
{ type: 'announce', params: { text: 'A dark presence approaches...', style: 'ominous' } }
{ type: 'trigger_event', params: { event: 'lights_flicker', duration: 5000 } }
```

### DM Triggers

The AI dungeon master can be triggered by:

| Trigger           | Example                                              |
| ----------------- | ---------------------------------------------------- |
| **Timer**         | Every 5 minutes, evaluate if something should happen |
| **Player count**  | When 5+ players are online, start an event           |
| **Player action** | When someone enters a specific area                  |
| **Chat keyword**  | Player says "I'm bored" → spawn challenge            |
| **Game state**    | Music has been playing for 30 min → DJ battle event  |

### Example: Dynamic Event Loop

```typescript
// server/src/services/dungeonMaster.ts
class DungeonMaster {
  private room: ClubMutant;
  private eventCooldown = 5 * 60 * 1000; // 5 min between events

  async evaluate() {
    const context = this.buildWorldContext();

    const response = await queryLLM({
      system: `You are a game master for Club Mutant, a multiplayer music club.
        Observe the current state and decide if you should create an event.
        
        Available actions:
        - spawn_enemy: { kind, x, y, count }
        - place_object: { kind, x, y }
        - announce: { text, style }
        - trigger_event: { event, duration }
        - npc_speak: { npcId, text }
        - nothing: (do nothing if vibe is good)
        
        Respond with JSON array of actions, or empty array.
        Keep events rare and meaningful. Don't spam.`,

      user: `Current state:
        - Players online: ${context.playerCount}
        - Current vibe: ${context.vibe} (chill/active/chaotic)
        - Last event: ${context.lastEventAgo} minutes ago
        - Current song: ${context.currentSong}
        - Recent chat: ${context.recentChat}
        
        Should anything happen?`,
    });

    const actions = JSON.parse(response);
    for (const action of actions) {
      await this.executeAction(action);
    }
  }

  private async executeAction(action: DMAction) {
    switch (action.type) {
      case "spawn_enemy":
        this.room.spawnEnemy(action.params);
        break;
      case "announce":
        this.room.broadcast(Message.DM_ANNOUNCEMENT, action.params);
        break;
      // ... etc
    }
  }
}
```

### Server State Extensions Needed

```typescript
// server/src/rooms/schema/OfficeState.ts

// New schemas for DM-controlled entities
class Enemy extends Schema {
  @type('string') id: string
  @type('string') kind: string  // 'zombie', 'robot', etc.
  @type('number') x: number
  @type('number') y: number
  @type('number') health: number
  @type('string') state: string  // 'idle', 'chasing', 'attacking'
  @type('string') targetId: string  // player being chased
}

class WorldObject extends Schema {
  @type('string') id: string
  @type('string') kind: string  // 'health_pack', 'obstacle', 'portal'
  @type('number') x: number
  @type('number') y: number
}

// Add to OfficeState
@type([Enemy]) enemies = new ArraySchema<Enemy>()
@type([WorldObject]) worldObjects = new ArraySchema<WorldObject>()
@type('string') dmAnnouncement: string = ''
@type('string') environmentState: string = 'normal'  // 'dark', 'red_alert', etc.
```

### Client Rendering

```typescript
// client/src/scenes/Game.ts
this.room.state.enemies.onAdd((enemy) => {
  const sprite = new EnemySprite(this, enemy.x, enemy.y, enemy.kind);
  this.enemySprites.set(enemy.id, sprite);

  enemy.onChange(() => {
    sprite.setPosition(enemy.x, enemy.y);
    sprite.setState(enemy.state);
  });
});

this.room.state.enemies.onRemove((enemy) => {
  this.enemySprites.get(enemy.id)?.destroy();
});
```

### Example Encounters

| Encounter           | Trigger                       | Flow                                                                          |
| ------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| **Zombie Invasion** | 10 players online             | DM announces warning → spawns 5 zombies at edges → players must survive 2 min |
| **Mystery Box**     | Random (1% per minute)        | Box appears → first player to reach it gets reward                            |
| **DJ Battle**       | Same song playing 15 min      | DM challenges players to suggest songs → votes → winner becomes DJ            |
| **Lights Out**      | Player says "it's too bright" | Lights dim for 30 sec → zombies spawn in darkness                             |
| **Dance Party**     | Player says "let's dance"     | DM plays upbeat song → bonus points for dancing emotes                        |

### Safety & Balance

- **Rate limiting**: Max 1 event per 5 minutes
- **Scaling**: Enemy count/difficulty based on player count
- **Opt-out**: Players can toggle "peaceful mode"
- **Override**: Admin commands to stop events
- **Context window**: Keep LLM context small (recent chat only, not full history)

---

## Open Questions

1. **Personality**: What should the NPC be like? (DJ, bartender, oracle, dungeon master?)
2. **DM Events**: Should it be able to spawn enemies/run encounters, or start simpler?
3. **Trigger**: Respond to @mentions, proximity, timer-based, or all?
4. **Hosting**: Same VPS or separate? Or use external API like Groq?
