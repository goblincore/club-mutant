package npc

import "time"

type NpcChatRequest struct {
	PersonalityID string    `json:"personalityId"`
	Message       string    `json:"message"`
	History       []Message `json:"history,omitempty"`
	MusicContext  string    `json:"musicContext,omitempty"`
	SenderName    string    `json:"senderName,omitempty"`
	RoomID        string    `json:"roomId,omitempty"`
	PlayerID      string    `json:"playerId,omitempty"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type NpcChatResponse struct {
	Text          string  `json:"text"`
	Behavior      string  `json:"behavior,omitempty"`
	AffinityDelta float64 `json:"affinityDelta,omitempty"`
	Note          string  `json:"note,omitempty"`
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
	ReflectionPrompt string // abbreviated personality for inner monologue reflections
	FallbackPhrases []string
	SectorWeights   map[string]float64 // dualmem sector weights (episodic, semantic, procedural, emotional, reflective)
}

// --- Inner Life types ---

type InnerState struct {
	Mood         string    `json:"mood"`
	Energy       float64   `json:"energy"`
	SocialDesire float64   `json:"socialDesire"`
	Thought      string    `json:"thought"`
	UpdatedAt    time.Time `json:"-"`
}

type WorldSnapshot struct {
	Players         []PlayerPresence `json:"players"`
	MusicPlaying    string           `json:"musicPlaying"`
	SilenceDuration int              `json:"silenceDuration"`
	RecentChatCount int              `json:"recentChatCount"`
	RecentMessages  []string         `json:"recentMessages,omitempty"`
	TimeOfDay       string           `json:"timeOfDay"`
}

type PlayerPresence struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	LastChatAge int    `json:"lastChatAge"`
	IsNew       bool   `json:"isNew"`
}

type HeartbeatResponse struct {
	Action   string `json:"action"`
	Text     string `json:"text,omitempty"`
	Target   string `json:"target,omitempty"`
	Behavior string `json:"behavior,omitempty"`
}

// --- Relationship types ---

type RelationshipTier int

const (
	TierStranger     RelationshipTier = iota // Default
	TierAcquaintance                         // ~3 conversations
	TierRegular                              // ~8 conversations, affinity > 0.6
	TierFriend                               // ~15 conversations, affinity > 0.8
	TierConfidant                            // ~25 conversations, affinity > 0.9
)

type Relationship struct {
	PlayerID      string           `json:"playerId"`
	PersonalityID string           `json:"personalityId"`
	Tier          RelationshipTier `json:"tier"`
	Affinity      float64          `json:"affinity"`
	Interactions  int              `json:"interactions"`
	LastSeen      time.Time        `json:"lastSeen"`
	Notes         string           `json:"notes"`
}
