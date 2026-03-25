package npc

import (
	"database/sql"
	"log"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// RelationshipStore manages persistent relationship data in SQLite.
type RelationshipStore struct {
	mu sync.Mutex
	db *sql.DB
}

// NewRelationshipStore opens (or creates) the relationships table in the given SQLite DB.
func NewRelationshipStore(dbPath string) (*RelationshipStore, error) {
	db, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, err
	}

	// Migration: create relationships table if it doesn't exist
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS relationships (
			player_id TEXT NOT NULL,
			personality_id TEXT NOT NULL,
			tier INTEGER DEFAULT 0,
			affinity REAL DEFAULT 0.0,
			interactions INTEGER DEFAULT 0,
			last_seen TIMESTAMP,
			notes TEXT,
			PRIMARY KEY (player_id, personality_id)
		)
	`)
	if err != nil {
		db.Close()
		return nil, err
	}

	log.Println("[relationships] Store initialized")
	return &RelationshipStore{db: db}, nil
}

// GetRelationship retrieves a relationship, applying decay if stale. Returns nil if not found.
func (rs *RelationshipStore) GetRelationship(playerID, personalityID string) *Relationship {
	rs.mu.Lock()
	defer rs.mu.Unlock()

	var rel Relationship
	var lastSeen sql.NullTime
	var notes sql.NullString

	err := rs.db.QueryRow(
		`SELECT player_id, personality_id, tier, affinity, interactions, last_seen, notes
		 FROM relationships WHERE player_id = ? AND personality_id = ?`,
		playerID, personalityID,
	).Scan(&rel.PlayerID, &rel.PersonalityID, &rel.Tier, &rel.Affinity,
		&rel.Interactions, &lastSeen, &notes)

	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		log.Printf("[relationships] GetRelationship error: %v", err)
		return nil
	}

	if lastSeen.Valid {
		rel.LastSeen = lastSeen.Time
	}
	if notes.Valid {
		rel.Notes = notes.String
	}

	// Apply decay if stale
	originalAffinity := rel.Affinity
	ApplyAffinityDecay(&rel)
	if rel.Affinity != originalAffinity {
		// Persist the decayed value
		rs.upsertLocked(&rel)
	}

	return &rel
}

// UpdateAfterChat updates the relationship after a chat interaction.
func (rs *RelationshipStore) UpdateAfterChat(playerID, personalityID string, affinityDelta float64, note string) {
	rs.mu.Lock()
	defer rs.mu.Unlock()

	// Get or create relationship
	var rel Relationship
	var lastSeen sql.NullTime
	var notes sql.NullString

	err := rs.db.QueryRow(
		`SELECT player_id, personality_id, tier, affinity, interactions, last_seen, notes
		 FROM relationships WHERE player_id = ? AND personality_id = ?`,
		playerID, personalityID,
	).Scan(&rel.PlayerID, &rel.PersonalityID, &rel.Tier, &rel.Affinity,
		&rel.Interactions, &lastSeen, &notes)

	if err == sql.ErrNoRows {
		rel = Relationship{
			PlayerID:      playerID,
			PersonalityID: personalityID,
			Tier:          TierStranger,
			Affinity:      0.0,
			Interactions:  0,
		}
	} else if err != nil {
		log.Printf("[relationships] UpdateAfterChat read error: %v", err)
		return
	} else {
		if lastSeen.Valid {
			rel.LastSeen = lastSeen.Time
		}
		if notes.Valid {
			rel.Notes = notes.String
		}
	}

	// Update
	rel.Interactions++
	rel.Affinity = clampFloat(rel.Affinity+affinityDelta, 0, 1)
	rel.LastSeen = time.Now()
	if note != "" {
		rel.Notes = note // Latest note overwrites (LLM generates context-aware notes)
	}

	// Check tier advancement
	CheckTierAdvancement(&rel)

	rs.upsertLocked(&rel)
}

// upsertLocked inserts or updates a relationship. Must be called with mu held.
func (rs *RelationshipStore) upsertLocked(rel *Relationship) {
	_, err := rs.db.Exec(`
		INSERT INTO relationships (player_id, personality_id, tier, affinity, interactions, last_seen, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(player_id, personality_id) DO UPDATE SET
			tier = excluded.tier,
			affinity = excluded.affinity,
			interactions = excluded.interactions,
			last_seen = excluded.last_seen,
			notes = excluded.notes
	`, rel.PlayerID, rel.PersonalityID, rel.Tier, rel.Affinity,
		rel.Interactions, rel.LastSeen, rel.Notes)

	if err != nil {
		log.Printf("[relationships] Upsert error: %v", err)
	}
}

// Close closes the database connection.
func (rs *RelationshipStore) Close() error {
	return rs.db.Close()
}
