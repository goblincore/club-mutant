package npc

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

// Mem0Client is a thin HTTP client for the mem0 Platform REST API.
// If MEM0_API_KEY is not set, all methods are safe no-ops.
type Mem0Client struct {
	apiKey string
	client *http.Client
}

var mem0Client *Mem0Client

const mem0BaseURL = "https://api.mem0.ai/v1"

// InitMem0 initializes the mem0 client from MEM0_API_KEY env var.
// If the env var is empty, mem0Client stays nil and all calls are no-ops.
func InitMem0() {
	apiKey := os.Getenv("MEM0_API_KEY")
	if apiKey == "" {
		log.Println("[mem0] MEM0_API_KEY not set — memory disabled")
		return
	}
	mem0Client = &Mem0Client{
		apiKey: apiKey,
		client: &http.Client{Timeout: 3 * time.Second},
	}
	log.Println("[mem0] Memory enabled")
}

// Mem0Memory represents a single memory result from search.
type Mem0Memory struct {
	ID     string `json:"id"`
	Memory string `json:"memory"`
}

type mem0SearchRequest struct {
	Query   string             `json:"query"`
	Filters mem0SearchFilters  `json:"filters"`
	TopK    int                `json:"top_k,omitempty"`
	Version string             `json:"version,omitempty"`
}

type mem0SearchFilters struct {
	AND []mem0FilterCondition `json:"AND"`
}

type mem0FilterCondition struct {
	UserID string `json:"user_id,omitempty"`
}

type mem0SearchResponse struct {
	Results []Mem0Memory `json:"results"`
}

type mem0AddRequest struct {
	Messages []mem0Message `json:"messages"`
	UserID   string        `json:"user_id"`
}

type mem0Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Search retrieves relevant memories for a user. Returns nil on any error.
func Mem0Search(query, userID string, limit int) []Mem0Memory {
	if mem0Client == nil || userID == "" {
		return nil
	}
	if limit <= 0 {
		limit = 5
	}

	body := mem0SearchRequest{
		Query: query,
		Filters: mem0SearchFilters{
			AND: []mem0FilterCondition{{UserID: userID}},
		},
		TopK:    limit,
		Version: "v2",
	}
	jsonData, err := json.Marshal(body)
	if err != nil {
		return nil
	}

	req, err := http.NewRequest("POST", "https://api.mem0.ai/v2/memories/search/", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Token "+mem0Client.apiKey)

	resp, err := mem0Client.client.Do(req)
	if err != nil {
		log.Printf("[mem0] Search failed: %v\n", err)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("[mem0] Search error %d: %s\n", resp.StatusCode, string(respBody))
		return nil
	}

	// Read body once for flexible parsing
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil
	}

	// mem0 search returns an array of memory objects directly
	var memories []Mem0Memory
	if err := json.Unmarshal(respBody, &memories); err == nil && len(memories) > 0 {
		return memories
	}

	// Fallback: try wrapped { "results": [...] } format
	var wrapped mem0SearchResponse
	if err := json.Unmarshal(respBody, &wrapped); err == nil {
		return wrapped.Results
	}

	log.Printf("[mem0] Search decode failed for response: %s\n", string(respBody[:min(len(respBody), 200)]))
	return nil
}

// Mem0Add stores a conversation pair as memory. Fire-and-forget — errors are logged but never returned.
func Mem0Add(userMessage, assistantMessage, userID string) {
	if mem0Client == nil || userID == "" {
		return
	}

	body := mem0AddRequest{
		Messages: []mem0Message{
			{Role: "user", Content: userMessage},
			{Role: "assistant", Content: assistantMessage},
		},
		UserID: userID,
	}
	jsonData, err := json.Marshal(body)
	if err != nil {
		return
	}

	req, err := http.NewRequest("POST", mem0BaseURL+"/memories/", bytes.NewBuffer(jsonData))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Token "+mem0Client.apiKey)

	resp, err := mem0Client.client.Do(req)
	if err != nil {
		log.Printf("[mem0] Add failed: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("[mem0] Add error %d: %s\n", resp.StatusCode, string(respBody))
	}
}

