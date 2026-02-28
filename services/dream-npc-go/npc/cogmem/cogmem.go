package cogmem

import (
	"context"
	"log"
	"sort"
	"sync"
)

// scored pairs a memory+vector with its computed similarity to the query.
type scored struct {
	memoryWithVector
	similarity float64
}

// CogMem is the cognitive memory engine.
// It provides Search and Add methods as drop-in replacements for mem0.
type CogMem struct {
	store       *Store
	embedder    *Embedder
	classifier  *Classifier
	config      Config
	mu          sync.RWMutex
	cancelDecay context.CancelFunc
}

// Init creates a CogMem instance, runs DB migrations, and starts the decay worker.
func Init(cfg Config) (*CogMem, error) {
	cfg.ApplyDefaults()

	store, err := NewStore(cfg.DBPath)
	if err != nil {
		return nil, err
	}

	embedder := NewEmbedder(cfg.GeminiAPIKey, cfg.EmbedDimension)
	classifier := NewClassifier(cfg.GeminiAPIKey)

	cm := &CogMem{
		store:      store,
		embedder:   embedder,
		classifier: classifier,
		config:     cfg,
	}

	cm.startDecayWorker(cfg.DecayInterval)
	log.Printf("[cogmem] Initialized (db=%s, dim=%d, decay=%v)", cfg.DBPath, cfg.EmbedDimension, cfg.DecayInterval)

	return cm, nil
}

// Search retrieves relevant memories for a user, scored by the composite formula.
// This is the drop-in replacement for Mem0Search.
func (cm *CogMem) Search(query, userID string, limit int, weights SectorWeights) []SearchResult {
	if userID == "" {
		return nil
	}
	if limit <= 0 {
		limit = 5
	}
	if weights == nil {
		weights = DefaultSectorWeights()
	}

	// 1. Embed the query
	queryVec, err := cm.embedder.Embed(query, "RETRIEVAL_QUERY")
	if err != nil {
		log.Printf("[cogmem] Embed query failed: %v", err)
		return nil
	}

	// 2. Load all memories + vectors for this user
	candidates, err := cm.store.GetMemoriesWithVectors(userID)
	if err != nil {
		log.Printf("[cogmem] Load memories failed: %v", err)
		return nil
	}
	if len(candidates) == 0 {
		return nil
	}

	// 3. Compute similarity for each candidate
	var scoredCandidates []scored
	for _, c := range candidates {
		if c.Vector == nil {
			continue
		}
		sim := CosineSimilarity(queryVec, c.Vector)
		scoredCandidates = append(scoredCandidates, scored{c, sim})
	}

	// Sort by similarity, take top candidates for waypoint expansion
	sort.Slice(scoredCandidates, func(i, j int) bool {
		return scoredCandidates[i].similarity > scoredCandidates[j].similarity
	})

	// Cap candidates for expansion (top 20 by similarity)
	expandLimit := 20
	if len(scoredCandidates) < expandLimit {
		expandLimit = len(scoredCandidates)
	}
	topCandidates := scoredCandidates[:expandLimit]

	// 4. Expand via waypoint graph (one-hop)
	seedMWVs := make([]memoryWithVector, len(topCandidates))
	for i, sc := range topCandidates {
		seedMWVs[i] = sc.memoryWithVector
	}
	linkWeights := ExpandViaWaypoints(cm.store, seedMWVs, userID)

	// 5. Compute composite scores with personality weights
	var results []SearchResult
	for _, sc := range scoredCandidates {
		sectorWeight := weights[sc.Sector]
		if sectorWeight == 0 {
			sectorWeight = 1.0
		}

		linkWeight := linkWeights[sc.ID] // 0 if not linked

		days := DaysSince(sc.LastAccessedAt)
		composite := CompositeScore(sc.similarity, sc.DecayScore, days, linkWeight, sectorWeight)

		results = append(results, SearchResult{
			Memory:         sc.Memory,
			CompositeScore: composite,
			Similarity:     sc.similarity,
		})
	}

	// 6. Sort by composite score, take top-k
	sort.Slice(results, func(i, j int) bool {
		return results[i].CompositeScore > results[j].CompositeScore
	})
	if len(results) > limit {
		results = results[:limit]
	}

	// 6b. High-salience guarantee: always surface the user's most important
	// memories even if their semantic similarity to the current query is low.
	// This ensures explicit user requests ("call me X", "greet me with Y")
	// are never lost just because the new query doesn't match semantically.
	results = guaranteeHighSalience(results, scoredCandidates, weights, linkWeights, limit)

	// 7. Reinforce accessed memories
	for _, r := range results {
		if err := cm.store.ReinforceSalience(r.ID, 0.15); err != nil {
			log.Printf("[cogmem] Reinforce failed for memory %d: %v", r.ID, err)
		}
	}

	return results
}

// Add stores a new memory from a conversation exchange.
// This is the drop-in replacement for Mem0Add. Safe to call from a goroutine.
func (cm *CogMem) Add(userMessage, assistantMessage, userID string) {
	if userID == "" {
		return
	}

	cm.mu.Lock()
	defer cm.mu.Unlock()

	// 1. Combine messages into memory content
	content := userMessage + " | " + assistantMessage

	// 2. Classify sector
	sector := cm.classifier.Classify(content)

	// 3. Generate embedding
	vec, err := cm.embedder.Embed(content, "RETRIEVAL_DOCUMENT")
	if err != nil {
		// Graceful degradation: store without vector
		log.Printf("[cogmem] Embed failed, storing without vector: %v", err)
	}

	// 4. Generate summary (captures both sides of the conversation)
	summary := buildConversationSummary(userMessage, assistantMessage, 200)

	// 5. Store memory
	mem := Memory{
		Content:  content,
		Sector:   sector,
		Salience: 0.5,
		UserID:   userID,
		Summary:  summary,
	}
	memID, err := cm.store.InsertMemory(mem)
	if err != nil {
		log.Printf("[cogmem] Insert memory failed: %v", err)
		return
	}

	// 6. Store vector (if embedding succeeded)
	if vec != nil {
		if err := cm.store.InsertVector(memID, sector, vec); err != nil {
			log.Printf("[cogmem] Insert vector failed: %v", err)
		}
	}

	// 7. Extract entities and create waypoint associations
	entities := ExtractEntities(content)
	for _, entity := range entities {
		wpID, err := cm.store.UpsertWaypoint(entity.Text, entity.Type)
		if err != nil {
			continue
		}
		cm.store.InsertAssociation(memID, wpID, 0.5)
	}

	// 8. Enforce per-user memory cap
	if err := cm.store.EnforceMemoryLimit(userID, cm.config.MaxMemoriesPerUser); err != nil {
		log.Printf("[cogmem] Enforce limit failed: %v", err)
	}

	log.Printf("[cogmem] Stored memory #%d [%s] for %s (%d entities)", memID, sector, userID, len(entities))
}

// Close shuts down the decay worker and closes the database.
func (cm *CogMem) Close() error {
	if cm.cancelDecay != nil {
		cm.cancelDecay()
	}
	return cm.store.Close()
}

// guaranteeHighSalience ensures the user's highest-salience memories appear in
// results even if their semantic similarity to the current query is low.
// This prevents explicit user requests ("greet me with X") from being buried
// when the new query is a casual greeting that doesn't match semantically.
func guaranteeHighSalience(results []SearchResult, allScored []scored, weights SectorWeights, linkWeights map[int64]float64, limit int) []SearchResult {
	const salienceThreshold = 0.6 // only boost memories that have been reinforced
	const maxBoosts = 2           // inject at most 2 high-salience memories

	// Collect IDs already in results
	inResults := make(map[int64]bool)
	for _, r := range results {
		inResults[r.ID] = true
	}

	// Find high-salience memories not yet in results
	var candidates []SearchResult
	for _, sc := range allScored {
		if inResults[sc.ID] || sc.Salience < salienceThreshold {
			continue
		}
		sectorWeight := weights[sc.Sector]
		if sectorWeight == 0 {
			sectorWeight = 1.0
		}
		lw := linkWeights[sc.ID]
		days := DaysSince(sc.LastAccessedAt)
		composite := CompositeScore(sc.similarity, sc.DecayScore, days, lw, sectorWeight)
		candidates = append(candidates, SearchResult{
			Memory:         sc.Memory,
			CompositeScore: composite,
			Similarity:     sc.similarity,
		})
	}

	if len(candidates) == 0 {
		return results
	}

	// Sort candidates by salience (highest first)
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Salience > candidates[j].Salience
	})

	// Inject top high-salience candidates, replacing the lowest-scored results
	injected := 0
	for _, c := range candidates {
		if injected >= maxBoosts {
			break
		}
		if len(results) >= limit {
			// Replace the lowest-scored result
			results[len(results)-1] = c
		} else {
			results = append(results, c)
		}
		injected++
	}

	return results
}

// buildConversationSummary creates a summary from both sides of the exchange.
// Prioritizes the user message since that's what matters for recall.
// Format: "user message → npc response" with 60/40 budget split.
func buildConversationSummary(userMessage, assistantMessage string, maxLen int) string {
	// Budget: ~60% for user message, ~40% for NPC response
	userBudget := maxLen * 60 / 100
	npcBudget := maxLen - userBudget - 5 // account for " → " separator

	userPart := truncateSummary(userMessage, userBudget)
	npcPart := truncateSummary(assistantMessage, npcBudget)

	return userPart + " → " + npcPart
}

// truncateSummary returns the first n characters of s, breaking at a word boundary.
func truncateSummary(s string, n int) string {
	if len(s) <= n {
		return s
	}
	// Find last space before limit
	cut := n
	for cut > 0 && s[cut] != ' ' {
		cut--
	}
	if cut == 0 {
		cut = n
	}
	return s[:cut] + "..."
}
