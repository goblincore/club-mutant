package cogmem

import (
	"regexp"
	"strings"
)

// --- Entity extraction ---

// ExtractEntities pulls out entities from memory content using simple heuristics.
// For NPC chat, this covers player names, music artists, quoted strings, and topics.
func ExtractEntities(content string) []Entity {
	var entities []Entity
	seen := make(map[string]bool)

	add := func(text, entityType string) {
		text = strings.TrimSpace(text)
		lower := strings.ToLower(text)
		if text == "" || len(text) < 2 || len(text) > 60 || seen[lower] {
			return
		}
		seen[lower] = true
		entities = append(entities, Entity{Text: text, Type: entityType})
	}

	// 1. Player names in brackets: [PlayerName]: message
	bracketRe := regexp.MustCompile(`\[([A-Za-z0-9_]+)\]`)
	for _, match := range bracketRe.FindAllStringSubmatch(content, -1) {
		add(match[1], "person")
	}

	// 2. Quoted strings (potential song names, topics, etc.)
	quoteRe := regexp.MustCompile(`"([^"]{2,40})"`)
	for _, match := range quoteRe.FindAllStringSubmatch(content, -1) {
		add(match[1], "topic")
	}

	// 3. Known music artists (from Lily's personality knowledge)
	musicArtists := []string{
		"Denki Groove", "Cornelius", "YMO", "Haruomi Hosono", "Towa Tei",
		"Aphex Twin", "Boards of Canada", "Nujabes", "DJ Shadow",
		"Massive Attack", "Portishead", "Curtis Mayfield", "Stevie Wonder",
		"Kraftwerk",
	}
	lower := strings.ToLower(content)
	for _, artist := range musicArtists {
		if strings.Contains(lower, strings.ToLower(artist)) {
			add(artist, "music_artist")
		}
	}

	// 4. Capitalized multi-word phrases (potential proper nouns, not at sentence start)
	// Match sequences like "Nebula Fizz", "Petal Dust Sour"
	properRe := regexp.MustCompile(`(?:^|[.!?]\s+|\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)`)
	for _, match := range properRe.FindAllStringSubmatch(content, 5) {
		text := strings.TrimSpace(match[1])
		// Skip common phrases that aren't entities
		if !isCommonPhrase(text) {
			add(text, "topic")
		}
	}

	return entities
}

// isCommonPhrase filters out false-positive proper nouns.
func isCommonPhrase(s string) bool {
	common := []string{
		"The", "This", "That", "What", "When", "Where", "How", "Why",
		"I Am", "You Are", "We Are", "They Are",
	}
	lower := strings.ToLower(s)
	for _, c := range common {
		if strings.ToLower(c) == lower {
			return true
		}
	}
	return false
}

// --- Waypoint graph expansion ---

// ExpandViaWaypoints performs one-hop graph expansion from seed memories.
// Returns additional memories linked through shared waypoints (entities).
func ExpandViaWaypoints(store *Store, seedMemories []memoryWithVector, userID string) map[int64]float64 {
	linkWeights := make(map[int64]float64)

	// Collect seed memory IDs
	seedIDs := make(map[int64]bool)
	for _, m := range seedMemories {
		seedIDs[m.ID] = true
	}

	// For each seed memory, get its waypoints, then get other memories sharing those waypoints
	for _, m := range seedMemories {
		waypointIDs, err := store.GetAssociatedWaypointIDs(m.ID)
		if err != nil {
			continue
		}

		for _, wpID := range waypointIDs {
			linked, err := store.GetMemoriesByWaypoint(wpID, userID, seedIDs)
			if err != nil {
				continue
			}
			for _, lm := range linked {
				// Propagate link weight: 0.8 multiplier per hop
				if w := 0.8; w > linkWeights[lm.ID] {
					linkWeights[lm.ID] = w
				}
			}
		}
	}

	return linkWeights
}
