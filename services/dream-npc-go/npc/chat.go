package npc

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/goblincore/geoffreyengram/dualmem"
)

var (
	cache       *LRUCache
	rateLimiter *RateLimiter
	client      *http.Client
	dmEngine    *dualmem.Engine
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

	if len(contextParts) > 0 {
		sysPrompt += "\n\nCONTEXT:\n" + strings.Join(contextParts, "\n")
	}

	// Call Gemini
	rawResponse := callGemini(sysPrompt, req.History, req.Message)

	if rawResponse != "" {
		parsedText, parsedBehavior := parseResponse(rawResponse)
		if parsedText != "" {
			cache.Set(cacheKey, parsedText, parsedBehavior)

			// Store conversation in memory (fire-and-forget)
			if memUserID != "" && dmEngine != nil {
				go dmEngine.Add(req.Message, parsedText, memUserID)
			}

			return 200, NpcChatResponse{Text: parsedText, Behavior: parsedBehavior}
		}
	}

	// Fallback
	fallback := personality.FallbackPhrases[time.Now().UnixNano()%int64(len(personality.FallbackPhrases))]
	return 200, NpcChatResponse{Text: fallback}
}

func callGemini(systemPrompt string, history []Message, message string) string {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		log.Println("[dreamNpc] No GEMINI_API_KEY set")
		return ""
	}

	geminiModel := "gemini-2.5-flash-lite"
	url := "https://generativelanguage.googleapis.com/v1beta/models/" + geminiModel + ":generateContent?key=" + apiKey

	reqBody := GeminiRequest{
		SystemInstruction: GeminiInstruction{Parts: []GeminiPart{{Text: systemPrompt}}},
		Contents:          []GeminiContent{},
		GenerationConfig: GeminiConfig{
			MaxOutputTokens: 160,
			Temperature:     0.9,
			TopP:            0.95,
		},
	}

	for _, msg := range history {
		role := "model"
		if msg.Role == "user" {
			role = "user"
		}
		reqBody.Contents = append(reqBody.Contents, GeminiContent{
			Role:  role,
			Parts: []GeminiPart{{Text: msg.Content}},
		})
	}

	reqBody.Contents = append(reqBody.Contents, GeminiContent{
		Role:  "user",
		Parts: []GeminiPart{{Text: message}},
	})

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return ""
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return ""
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		log.Println("[dreamNpc] Gemini API call failed:", err)
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("[dreamNpc] Gemini API error: %d %s\n", resp.StatusCode, string(bodyBytes))
		return ""
	}

	var geminiResp GeminiResponse
	if err := json.NewDecoder(resp.Body).Decode(&geminiResp); err != nil {
		return ""
	}

	if len(geminiResp.Candidates) > 0 && len(geminiResp.Candidates[0].Content.Parts) > 0 {
		return geminiResp.Candidates[0].Content.Parts[0].Text
	}
	return ""
}

func parseResponse(raw string) (string, string) {
	// Tier 1: Direct JSON parse
	var parsed struct {
		Text     string `json:"text"`
		Behavior string `json:"behavior"`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err == nil && parsed.Text != "" {
		return parsed.Text, parsed.Behavior
	}

	// Tier 2: Extract JSON from surrounding text
	re := regexp.MustCompile(`\{[^}]*"text"\s*:\s*"[^"]*"[^}]*\}`)
	if match := re.FindString(raw); match != "" {
		if err := json.Unmarshal([]byte(match), &parsed); err == nil && parsed.Text != "" {
			return parsed.Text, parsed.Behavior
		}
	}

	// Tier 3: Use raw text if short enough
	cleaned := strings.ReplaceAll(raw, "```json", "")
	cleaned = strings.ReplaceAll(cleaned, "```", "")
	cleaned = strings.TrimSpace(cleaned)

	if len(cleaned) > 0 && len(cleaned) <= 150 {
		return cleaned, ""
	}

	return "", ""
}
