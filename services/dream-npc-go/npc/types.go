package npc

type NpcChatRequest struct {
	PersonalityID string    `json:"personalityId"`
	Message       string    `json:"message"`
	History       []Message `json:"history,omitempty"`
	MusicContext  string    `json:"musicContext,omitempty"`
	SenderName    string    `json:"senderName,omitempty"`
	RoomID        string    `json:"roomId,omitempty"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type NpcChatResponse struct {
	Text     string `json:"text"`
	Behavior string `json:"behavior,omitempty"`
}

type NpcErrorResponse struct {
	Error        string `json:"error"`
	RetryAfterMs int64  `json:"retryAfterMs,omitempty"`
}

type GeminiRequest struct {
	SystemInstruction GeminiInstruction  `json:"system_instruction"`
	Contents          []GeminiContent    `json:"contents"`
	GenerationConfig  GeminiConfig       `json:"generationConfig"`
}

type GeminiInstruction struct {
	Parts []GeminiPart `json:"parts"`
}

type GeminiContent struct {
	Role  string       `json:"role"`
	Parts []GeminiPart `json:"parts"`
}

type GeminiPart struct {
	Text string `json:"text"`
}

type GeminiConfig struct {
	MaxOutputTokens int     `json:"maxOutputTokens"`
	Temperature     float64 `json:"temperature"`
	TopP            float64 `json:"topP"`
}

type GeminiResponse struct {
	Candidates []GeminiCandidate `json:"candidates"`
}

type GeminiCandidate struct {
	Content GeminiContent `json:"content"`
}

type NpcPersonality struct {
	ID              string
	SystemPrompt    string
	FallbackPhrases []string
}
