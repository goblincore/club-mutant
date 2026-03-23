# Self-Hosted mem0 — Setup Guide

Reference doc for migrating from mem0 Platform API to self-hosted. Best time to do this is when we add PostgreSQL for user accounts — pgvector can serve double duty.

## What You're Deploying

Three containers:

1. **mem0 FastAPI server** (port 8000) — REST API, memory extraction, embedding generation
2. **PostgreSQL 16 + pgvector** (port 5432) — memory storage + vector similarity search
3. **Neo4j 5** (ports 7474/7687) — entity relationship graph (optional, skip initially)

Plus a configured LLM for memory extraction (Gemini works).

## Step 1: Add Services to docker-compose.yml

```yaml
  mem0:
    image: mem0/mem0-api-server:latest
    restart: unless-stopped
    environment:
      - MEM0_LLM_PROVIDER=gemini
      - MEM0_LLM_MODEL=gemini-2.5-flash
      - MEM0_LLM_API_KEY=${GEMINI_API_KEY}
      - MEM0_EMBEDDER_PROVIDER=gemini
      - MEM0_EMBEDDER_MODEL=text-embedding-004
      - MEM0_EMBEDDER_API_KEY=${GEMINI_API_KEY}
      - MEM0_VECTOR_STORE_PROVIDER=pgvector
      - MEM0_VECTOR_STORE_URL=postgresql://mem0:mem0pass@postgres:5432/mem0
      - MEM0_HISTORY_DB_URL=postgresql://mem0:mem0pass@postgres:5432/mem0
      # Uncomment when adding Neo4j:
      # - MEM0_GRAPH_STORE_PROVIDER=neo4j
      # - MEM0_GRAPH_STORE_URL=bolt://neo4j:7687
      # - MEM0_GRAPH_STORE_USERNAME=neo4j
      # - MEM0_GRAPH_STORE_PASSWORD=neo4jpass
    expose:
      - '8000'
    depends_on:
      - postgres

  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      - POSTGRES_USER=mem0
      - POSTGRES_PASSWORD=mem0pass
      - POSTGRES_DB=mem0
    volumes:
      - postgres_data:/var/lib/postgresql/data
    expose:
      - '5432'

  # Optional — skip initially, add later if entity relationships are needed
  # neo4j:
  #   image: neo4j:5
  #   restart: unless-stopped
  #   environment:
  #     - NEO4J_AUTH=neo4j/neo4jpass
  #     - NEO4J_PLUGINS=["apoc"]
  #   volumes:
  #     - neo4j_data:/var/lib/neo4j/data
  #   expose:
  #     - '7474'
  #     - '7687'
```

Add to volumes:
```yaml
volumes:
  caddy_data:
  caddy_config:
  postgres_data:
  # neo4j_data:
```

## Step 2: Update dream-npc Service

Point dream-npc at the local mem0 instance:

```yaml
  dream-npc:
    environment:
      - PORT=4000
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - MEM0_BASE_URL=http://mem0:8000
      # Remove MEM0_API_KEY — not needed for self-hosted
    depends_on:
      - mem0
```

## Step 3: Update Go Code

In `services/dream-npc-go/npc/mem0.go`, change initialization to use a configurable base URL:

```go
func InitMem0() {
    // Self-hosted: use MEM0_BASE_URL (e.g. http://mem0:8000)
    // Platform API: use MEM0_API_KEY with https://api.mem0.ai
    baseURL := os.Getenv("MEM0_BASE_URL")
    apiKey := os.Getenv("MEM0_API_KEY")

    if baseURL == "" && apiKey == "" {
        log.Println("[mem0] No MEM0_BASE_URL or MEM0_API_KEY — memory disabled")
        return
    }

    if baseURL == "" {
        baseURL = "https://api.mem0.ai"
    }

    mem0Client = &Mem0Client{
        baseURL: baseURL,
        apiKey:  apiKey, // empty string for self-hosted (no auth needed)
        client:  &http.Client{Timeout: 3 * time.Second},
    }
}
```

Update the search/add URLs to use `mem0Client.baseURL` instead of hardcoded `https://api.mem0.ai`.

For auth header, only set it when apiKey is non-empty:
```go
if mem0Client.apiKey != "" {
    req.Header.Set("Authorization", "Token "+mem0Client.apiKey)
}
```

## Step 4: Expose mem0 API via Caddy (Optional)

If you want to access the mem0 API docs from outside (useful for debugging):

```
mem0.mutante.club {
    reverse_proxy mem0:8000
}
```

The FastAPI server has OpenAPI docs at `http://localhost:8000/docs`.

## Step 5: Deploy

```bash
ssh vps "cd /path/to/club-mutant && git pull"
cd deploy/hetzner
docker compose up -d --build dream-npc mem0 postgres
docker compose logs -f mem0  # Check it starts OK
```

## Step 6: Verify

```bash
# Check mem0 health
curl http://localhost:8000/health

# Test add memory
curl -X POST http://localhost:8000/v1/memories/ \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "I love Aphex Twin"}], "user_id": "test:123"}'

# Test search
curl -X POST http://localhost:8000/v2/memories/search/ \
  -H "Content-Type: application/json" \
  -d '{"query": "music preferences", "filters": {"AND": [{"user_id": "test:123"}]}, "top_k": 5, "version": "v2"}'

# Delete test data
curl -X DELETE "http://localhost:8000/v1/memories/?user_id=test:123"
```

## Step 7: Migrate Existing Memories (Optional)

If there are memories in the platform API you want to keep, you can export them:

```bash
# List all memories for a user from platform API
curl -X GET "https://api.mem0.ai/v1/memories/?user_id=lily:abc12345" \
  -H "Authorization: Token $MEM0_API_KEY"
```

Then replay them into the self-hosted instance. Or just start fresh — Lily will rebuild memories naturally from new conversations.

## PostgreSQL Reuse for User Accounts

When we add user accounts, the same PostgreSQL instance handles both:

```yaml
  postgres:
    environment:
      - POSTGRES_DB=clubmutant  # shared database
```

Use separate schemas or databases:
- `mem0` schema/db — mem0 memories + pgvector indexes
- `clubmutant` schema/db — user accounts, playlists, collectibles

## Resource Estimates

| Component | RAM | Disk | CPU |
|-----------|-----|------|-----|
| mem0 FastAPI | ~200MB | minimal | low |
| PostgreSQL + pgvector | ~200MB | ~1GB per 100K memories | low |
| Neo4j (optional) | ~800MB-1GB | ~500MB | moderate |
| **Total (no Neo4j)** | **~400MB** | **~1GB** | **low** |
| **Total (with Neo4j)** | **~1.2GB** | **~1.5GB** | **moderate** |

## LLM Options for Memory Extraction

mem0 uses an LLM to decide what's worth remembering from conversations. Options:

| Provider | Model | Cost | Latency |
|----------|-------|------|---------|
| **Gemini** (recommended) | gemini-2.5-flash | ~$0.075/M input tokens | ~0.5s |
| Ollama (local) | llama3.1, mistral | Free (CPU cost) | ~2-3s on shared CPU |
| OpenAI | gpt-4o-mini | ~$0.15/M input tokens | ~0.5s |
| Groq | mixtral-8x7b | ~$0.24/M input tokens | ~0.3s |

Gemini is the natural choice since we already have the API key and use it for Lily's chat responses.

## Embedding Model Options

For vector similarity search. Must match what was used when memories were stored.

| Provider | Model | Dimensions | Cost |
|----------|-------|------------|------|
| **Gemini** (recommended) | text-embedding-004 | 768 | Included with Gemini API |
| OpenAI | text-embedding-3-small | 1536 | $0.02/M tokens |
| HuggingFace (local) | all-MiniLM-L6-v2 | 384 | Free |
| Ollama (local) | nomic-embed-text | 768 | Free |

## When to Do This

Best trigger: when we start building the user accounts system (PostgreSQL on Hetzner). At that point:
1. PostgreSQL is already being deployed
2. Just add pgvector extension + mem0 FastAPI container
3. Change one URL in Go code
4. Free tier API limits become irrelevant
