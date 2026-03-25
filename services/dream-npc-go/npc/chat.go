package npc

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/goblincore/geoffreyengram/dualmem"
)

var (
	cache        *LRUCache
	rateLimiter  *RateLimiter
	client       *http.Client
	dmEngine     *dualmem.Engine
	stateManager *StateManager
	relStore     *RelationshipStore
)

func init() {
	cache = NewCache(500, 3600_000)
	rateLimiter = NewRateLimiter()
	client = &http.Client{Timeout: 8 * time.Second}

	apiKey := os.Getenv("GEMINI_API_KEY")
	dbPath := os.Getenv("DUALMEM_DB_PATH")
	if dbPath == "" {
		dbPath = "./data/dualmem.db"
	}
	if apiKey != "" {
		engine, err := dualmem.New(dualmem.Config{
			SQLitePath:        dbPath,
			EmbeddingProvider: dualmem.NewGeminiEmbedder(apiKey, 768),
			Classifier:        dualmem.NewGeminiClassifier(apiKey),
			Summarizer:        dualmem.NewGeminiSummarizer(apiKey, ""),
		})
		if err != nil {
			log.Printf("[dualmem] Init failed: %v — memory disabled", err)
		} else {
			dmEngine = engine
			log.Println("[dualmem] Memory enabled (dual-path)")
		}
	} else {
		log.Println("[dualmem] GEMINI_API_KEY not set — memory disabled")
	}
}

// SetStateManager sets the package-level state manager for mood injection.
func SetStateManager(sm *StateManager) {
	stateManager = sm
}

// SetRelationshipStore sets the package-level relationship store.
func SetRelationshipStore(rs *RelationshipStore) {
	relStore = rs
}

func HandleNpcChat(req NpcChatRequest, sessionKey string) (int, any) {
	if req.PersonalityID == "" || req.Message == "" {
		return 400, NpcErrorResponse{Error: "Missing personalityId or message"}
	}

	personality, ok := Personalities[req.PersonalityID]
	if !ok {
		return 400, NpcErrorResponse{Error: "Unknown personality: " + req.PersonalityID}
	}

	// Rate limit
	if ok, retry := rateLimiter.Check(sessionKey); !ok {
		return 429, NpcErrorResponse{Error: "Rate limited", RetryAfterMs: retry}
	}

	// Cache check (skip if music is playing; include playerId for per-player cache)
	hasMusic := req.MusicContext != "" && !strings.Contains(req.MusicContext, "No music")
	cacheMsg := req.Message
	if req.PlayerID != "" {
		cacheMsg = req.Message + "::" + req.PlayerID
	}
	cacheKey := GetCacheKey(req.PersonalityID, cacheMsg)

	if !hasMusic {
		if entry, found := cache.Get(cacheKey); found {
			return 200, NpcChatResponse{Text: entry.Text, Behavior: entry.Behavior}
		}
	}

	// Record request
	rateLimiter.Record(sessionKey)

	// Start memory context assembly in parallel with prompt building
	memUserID := ""
	var memCtxCh chan *dualmem.ContextBlock

	if req.PlayerID != "" {
		memUserID = personality.ID + ":" + req.PlayerID

		if dmEngine != nil {
			memCtxCh = make(chan *dualmem.ContextBlock, 1)
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				defer cancel()
				block, err := dmEngine.AssembleContext(ctx, memUserID, req.Message, 1500)
				if err != nil {
					log.Printf("[dualmem] AssembleContext: %v", err)
					memCtxCh <- nil
				} else {
					memCtxCh <- block
				}
			}()
		}
	}

	// Build dynamic prompt
	sysPrompt := personality.SystemPrompt
	var contextParts []string
	if req.MusicContext != "" {
		contextParts = append(contextParts, req.MusicContext)
	}
	if req.SenderName != "" {
		contextParts = append(contextParts, "The person talking to you right now is named \""+req.SenderName+"\".")
	}

	// Collect memory context (blocks until assembly completes or was never started)
	if memCtxCh != nil {
		if block := <-memCtxCh; block != nil && block.Text != "" {
			contextParts = append(contextParts,
				"BACKGROUND IMPRESSIONS (these shape your tone and warmth — do not mention them directly):\n"+block.Text)
		}
	}

	// Inject inner state (mood context from heartbeat reflections)
	if stateManager != nil {
		if state := stateManager.GetState(req.PersonalityID); state != nil {
			if moodBlock := FormatInnerStateForPrompt(state); moodBlock != "" {
				contextParts = append(contextParts, moodBlock)
			}
		}
	}

	// Inject relationship context
	var rel *Relationship
	if relStore != nil && req.PlayerID != "" {
		rel = relStore.GetRelationship(req.PlayerID, req.PersonalityID)
		if rel != nil {
			contextParts = append(contextParts, FormatRelationshipForPrompt(rel))
		}
	}

	if len(contextParts) > 0 {
		sysPrompt += "\n\nCONTEXT:\n" + strings.Join(contextParts, "\n")
	}

	// Call Gemini
	rawResponse := CallGemini(DefaultChatConfig, sysPrompt, req.History, req.Message)

	if rawResponse != "" {
		parsed := parseResponse(rawResponse)
		if parsed.Text != "" {
			isCacheHit := false
			cache.Set(cacheKey, parsed.Text, parsed.Behavior)

			// Store conversation in memory (fire-and-forget)
			if memUserID != "" && dmEngine != nil {
				go dmEngine.Add(req.Message, parsed.Text, memUserID)
			}

			// Update relationship (skip on cache hits)
			if relStore != nil && req.PlayerID != "" && !isCacheHit {
				go relStore.UpdateAfterChat(req.PlayerID, req.PersonalityID, parsed.AffinityDelta, parsed.Note)
			}

			return 200, NpcChatResponse{
				Text:          parsed.Text,
				Behavior:      parsed.Behavior,
				AffinityDelta: parsed.AffinityDelta,
				Note:          parsed.Note,
			}
		}
	}

	// Fallback
	fallback := personality.FallbackPhrases[time.Now().UnixNano()%int64(len(personality.FallbackPhrases))]
	return 200, NpcChatResponse{Text: fallback}
}

// ParsedResponse holds the full parsed result from an LLM response.
type ParsedResponse struct {
	Text          string
	Behavior      string
	AffinityDelta float64
	Note          string
}

func parseResponse(raw string) ParsedResponse {
	// Tier 1: Direct JSON parse
	var parsed struct {
		Text          string  `json:"text"`
		Behavior      string  `json:"behavior"`
		AffinityDelta float64 `json:"affinityDelta"`
		Note          string  `json:"note"`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err == nil && parsed.Text != "" {
		return ParsedResponse{
			Text: parsed.Text, Behavior: parsed.Behavior,
			AffinityDelta: parsed.AffinityDelta, Note: parsed.Note,
		}
	}

	// Tier 2: Extract JSON from surrounding text
	re := regexp.MustCompile(`\{[^}]*"text"\s*:\s*"[^"]*"[^}]*\}`)
	if match := re.FindString(raw); match != "" {
		if err := json.Unmarshal([]byte(match), &parsed); err == nil && parsed.Text != "" {
			return ParsedResponse{
				Text: parsed.Text, Behavior: parsed.Behavior,
				AffinityDelta: parsed.AffinityDelta, Note: parsed.Note,
			}
		}
	}

	// Tier 3: Use raw text if short enough (neutral affinity)
	cleaned := strings.ReplaceAll(raw, "```json", "")
	cleaned = strings.ReplaceAll(cleaned, "```", "")
	cleaned = strings.TrimSpace(cleaned)

	if len(cleaned) > 0 && len(cleaned) <= 150 {
		return ParsedResponse{Text: cleaned, AffinityDelta: 0.02}
	}

	return ParsedResponse{}
}
