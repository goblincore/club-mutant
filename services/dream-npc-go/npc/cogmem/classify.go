package cogmem

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// Classifier determines which cognitive sector a memory belongs to.
// Uses a keyword heuristic first (zero-cost), falls back to Gemini for ambiguous content.
type Classifier struct {
	apiKey string
	client *http.Client
}

// NewClassifier creates a sector classifier.
func NewClassifier(apiKey string) *Classifier {
	return &Classifier{
		apiKey: apiKey,
		client: &http.Client{Timeout: 5 * time.Second},
	}
}

// Classify determines the sector for a piece of memory content.
func (c *Classifier) Classify(content string) Sector {
	sector, confidence := c.heuristicClassify(content)
	if confidence >= 0.6 {
		return sector
	}

	// Low confidence: try Gemini for disambiguation
	if c.apiKey != "" {
		if geminiSector, err := c.geminiClassify(content); err == nil {
			return geminiSector
		} else {
			log.Printf("[cogmem] Gemini classify fallback failed: %v", err)
		}
	}

	return sector // fallback to heuristic even if low confidence
}

// heuristicClassify uses keyword matching to classify content into a sector.
// Returns the best sector and a confidence score (0.0-1.0).
func (c *Classifier) heuristicClassify(content string) (Sector, float64) {
	lower := strings.ToLower(content)

	scores := map[Sector]float64{
		SectorEpisodic:   0,
		SectorSemantic:   0,
		SectorProcedural: 0,
		SectorEmotional:  0,
		SectorReflective: 0,
	}

	// Episodic: events, temporal experiences
	episodicSignals := []string{
		"last time", "remember when", "yesterday", "came in", "visited",
		"was here", "stopped by", "showed up", "dropped by", "earlier",
		"that time", "the other day", "first time", "came back", "returned",
	}
	for _, s := range episodicSignals {
		if strings.Contains(lower, s) {
			scores[SectorEpisodic] += 0.3
		}
	}

	// Semantic: facts, knowledge, preferences
	semanticSignals := []string{
		"likes", "prefers", "is a", "works at", "always", "favorite",
		"usually", "enjoys", "listens to", "fan of", "into", "plays",
		"from", "lives in", "speaks", "knows about",
	}
	for _, s := range semanticSignals {
		if strings.Contains(lower, s) {
			scores[SectorSemantic] += 0.3
		}
	}

	// Procedural: skills, how-to, capabilities
	proceduralSignals := []string{
		"how to", "can do", "knows how", "skill", "technique",
		"method", "approach", "process", "step", "instruction",
	}
	for _, s := range proceduralSignals {
		if strings.Contains(lower, s) {
			scores[SectorProcedural] += 0.3
		}
	}

	// Emotional: feelings, sentiments, reactions
	emotionalSignals := []string{
		"feel", "love", "hate", "happy", "sad", "enjoy", "afraid",
		"angry", "excited", "nervous", "comfortable", "miss", "appreciate",
		"friendly", "rude", "kind", "warm", "cold", "annoyed", "grateful",
		"sweet", "nice", "mean", "fun", "boring",
	}
	for _, s := range emotionalSignals {
		if strings.Contains(lower, s) {
			scores[SectorEmotional] += 0.3
		}
	}

	// Reflective: patterns, insights, meta-observations
	reflectiveSignals := []string{
		"pattern", "notice that", "tend to", "seem to", "often",
		"every time", "consistently", "in general", "overall",
		"reflects", "suggests", "implies", "correlat",
	}
	for _, s := range reflectiveSignals {
		if strings.Contains(lower, s) {
			scores[SectorReflective] += 0.3
		}
	}

	// Find highest scoring sector
	bestSector := SectorSemantic // default
	bestScore := 0.0
	for sector, score := range scores {
		if score > bestScore {
			bestScore = score
			bestSector = sector
		}
	}

	// Normalize confidence: cap at 1.0
	confidence := bestScore
	if confidence > 1.0 {
		confidence = 1.0
	}

	return bestSector, confidence
}

// geminiClassify uses Gemini to classify content when heuristics are ambiguous.
func (c *Classifier) geminiClassify(content string) (Sector, error) {
	url := "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" + c.apiKey

	prompt := `Classify this memory into exactly one sector. Reply with ONLY the sector name, nothing else.
Sectors: episodic (events/experiences), semantic (facts/knowledge), emotional (feelings/sentiment), procedural (skills/how-to), reflective (patterns/insights)

Memory: "` + content + `"`

	reqBody := map[string]any{
		"contents": []map[string]any{
			{"role": "user", "parts": []map[string]any{{"text": prompt}}},
		},
		"generationConfig": map[string]any{
			"maxOutputTokens": 10,
			"temperature":     0.0,
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return SectorSemantic, err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return SectorSemantic, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return SectorSemantic, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return SectorSemantic, &classifyError{status: resp.StatusCode, body: string(body)}
	}

	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&geminiResp); err != nil {
		return SectorSemantic, err
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return SectorSemantic, &classifyError{body: "empty response"}
	}

	text := strings.TrimSpace(strings.ToLower(geminiResp.Candidates[0].Content.Parts[0].Text))
	switch {
	case strings.Contains(text, "episodic"):
		return SectorEpisodic, nil
	case strings.Contains(text, "semantic"):
		return SectorSemantic, nil
	case strings.Contains(text, "procedural"):
		return SectorProcedural, nil
	case strings.Contains(text, "emotional"):
		return SectorEmotional, nil
	case strings.Contains(text, "reflective"):
		return SectorReflective, nil
	default:
		return SectorSemantic, nil
	}
}

type classifyError struct {
	status int
	body   string
}

func (e *classifyError) Error() string {
	if e.status > 0 {
		return "gemini classify " + http.StatusText(e.status) + ": " + e.body
	}
	return "gemini classify: " + e.body
}
