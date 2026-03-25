package npc

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
)

// GeminiCallConfig controls generation parameters for a Gemini API call.
type GeminiCallConfig struct {
	Model       string
	MaxTokens   int
	Temperature float64
	TopP        float64
}

// DefaultChatConfig is used for normal NPC chat responses.
var DefaultChatConfig = GeminiCallConfig{
	Model:       "gemini-2.5-flash-lite",
	MaxTokens:   160,
	Temperature: 0.9,
	TopP:        0.95,
}

// ReflectionConfig is used for inner monologue reflections (cheap, short).
var ReflectionConfig = GeminiCallConfig{
	Model:       "gemini-2.5-flash-lite",
	MaxTokens:   100,
	Temperature: 0.9,
	TopP:        0.95,
}

// ProactiveConfig is used for heartbeat-triggered proactive speech (very short).
var ProactiveConfig = GeminiCallConfig{
	Model:       "gemini-2.5-flash-lite",
	MaxTokens:   80,
	Temperature: 0.9,
	TopP:        0.95,
}

// CallGemini makes a parameterized call to the Gemini API.
func CallGemini(config GeminiCallConfig, systemPrompt string, history []Message, message string) string {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		log.Println("[dreamNpc] No GEMINI_API_KEY set")
		return ""
	}

	url := "https://generativelanguage.googleapis.com/v1beta/models/" + config.Model + ":generateContent?key=" + apiKey

	reqBody := GeminiRequest{
		SystemInstruction: GeminiInstruction{Parts: []GeminiPart{{Text: systemPrompt}}},
		Contents:          []GeminiContent{},
		GenerationConfig: GeminiConfig{
			MaxOutputTokens: config.MaxTokens,
			Temperature:     config.Temperature,
			TopP:            config.TopP,
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
