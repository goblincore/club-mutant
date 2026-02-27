package cogmem

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Embedder generates vector embeddings via the Gemini API.
type Embedder struct {
	apiKey    string
	dimension int
	client    *http.Client
}

// NewEmbedder creates an embedding client for gemini-embedding-001.
func NewEmbedder(apiKey string, dimension int) *Embedder {
	return &Embedder{
		apiKey:    apiKey,
		dimension: dimension,
		client:    &http.Client{Timeout: 5 * time.Second},
	}
}

// Embed generates a vector for the given text.
// taskType should be "RETRIEVAL_QUERY" for search queries or "RETRIEVAL_DOCUMENT" for stored memories.
func (e *Embedder) Embed(text, taskType string) ([]float32, error) {
	if e.apiKey == "" {
		return nil, fmt.Errorf("no API key")
	}

	url := "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=" + e.apiKey

	reqBody := geminiEmbedRequest{
		Content: geminiEmbedContent{
			Parts: []geminiEmbedPart{{Text: text}},
		},
		TaskType:             taskType,
		OutputDimensionality: e.dimension,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("gemini embed %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
	}

	var geminiResp geminiEmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&geminiResp); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}

	if len(geminiResp.Embedding.Values) == 0 {
		return nil, fmt.Errorf("empty embedding returned")
	}

	// Convert float64 response to float32 for compact storage
	vec := make([]float32, len(geminiResp.Embedding.Values))
	for i, v := range geminiResp.Embedding.Values {
		vec[i] = float32(v)
	}
	return vec, nil
}

// --- Gemini Embed API types ---

type geminiEmbedRequest struct {
	Content              geminiEmbedContent `json:"content"`
	TaskType             string             `json:"taskType"`
	OutputDimensionality int                `json:"outputDimensionality"`
}

type geminiEmbedContent struct {
	Parts []geminiEmbedPart `json:"parts"`
}

type geminiEmbedPart struct {
	Text string `json:"text"`
}

type geminiEmbedResponse struct {
	Embedding geminiEmbedValues `json:"embedding"`
}

type geminiEmbedValues struct {
	Values []float64 `json:"values"`
}
