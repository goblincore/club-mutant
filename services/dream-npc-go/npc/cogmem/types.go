package cogmem

import "time"

// Sector represents one of the 5 cognitive memory sectors.
type Sector string

const (
	SectorEpisodic   Sector = "episodic"   // Events, temporal experiences
	SectorSemantic   Sector = "semantic"   // Facts, knowledge
	SectorProcedural Sector = "procedural" // Skills, capabilities
	SectorEmotional  Sector = "emotional"  // Feelings, sentiments
	SectorReflective Sector = "reflective" // Insights, meta-cognition
)

// SectorDecayLambda maps each sector to its exponential decay rate (per day).
// Lower lambda = slower decay (memories persist longer).
var SectorDecayLambda = map[Sector]float64{
	SectorEpisodic:   0.005, // hot — events linger long
	SectorSemantic:   0.02,  // warm — facts persist
	SectorProcedural: 0.02,  // warm
	SectorEmotional:  0.005, // hot — feelings persist
	SectorReflective: 0.05,  // cold — insights fade fastest
}

// SectorWeights defines per-personality retrieval weighting.
// Values are multipliers on a sector's contribution to composite score.
type SectorWeights map[Sector]float64

// DefaultSectorWeights returns equal weighting across all sectors.
func DefaultSectorWeights() SectorWeights {
	return SectorWeights{
		SectorEpisodic:   1.0,
		SectorSemantic:   1.0,
		SectorProcedural: 1.0,
		SectorEmotional:  1.0,
		SectorReflective: 1.0,
	}
}

// Memory is the core memory record stored in SQLite.
type Memory struct {
	ID             int64
	Content        string
	Sector         Sector
	Salience       float64 // 0.0 – 1.0
	DecayScore     float64 // Current decayed salience
	LastAccessedAt time.Time
	AccessCount    int
	CreatedAt      time.Time
	UserID         string // e.g. "lily_bartender:player123"
	Summary        string // Short text injected into prompts
}

// SearchResult is a scored memory returned from retrieval.
type SearchResult struct {
	Memory
	CompositeScore float64
	Similarity     float64
}

// Entity represents an extracted entity for the waypoint graph.
type Entity struct {
	Text string
	Type string // "person", "music_artist", "song", "topic", "place"
}

// Config holds CogMem initialization parameters.
type Config struct {
	DBPath             string        // Path to SQLite file (default: ./data/cogmem.db)
	GeminiAPIKey       string        // For embeddings + classification
	EmbedDimension     int           // Default 768
	DecayInterval      time.Duration // Default 12h
	MaxMemoriesPerUser int           // Default 500
	MinDecayScore      float64       // Memories below this are deleted (default 0.01)
}

// ApplyDefaults fills zero-valued fields with sensible defaults.
func (c *Config) ApplyDefaults() {
	if c.DBPath == "" {
		c.DBPath = "./data/cogmem.db"
	}
	if c.EmbedDimension == 0 {
		c.EmbedDimension = 768
	}
	if c.DecayInterval == 0 {
		c.DecayInterval = 12 * time.Hour
	}
	if c.MaxMemoriesPerUser == 0 {
		c.MaxMemoriesPerUser = 500
	}
	if c.MinDecayScore == 0 {
		c.MinDecayScore = 0.01
	}
}
