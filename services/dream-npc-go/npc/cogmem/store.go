package cogmem

import (
	"database/sql"
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

// Store wraps a SQLite connection for cognitive memory persistence.
type Store struct {
	db *sql.DB
}

// NewStore opens (or creates) the SQLite database and runs migrations.
func NewStore(path string) (*Store, error) {
	// Ensure parent directory exists
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, fmt.Errorf("cogmem: mkdir %s: %w", filepath.Dir(path), err)
	}

	db, err := sql.Open("sqlite", path+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("cogmem: open db: %w", err)
	}

	// Single connection avoids write contention for our scale
	db.SetMaxOpenConns(1)

	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("cogmem: migrate: %w", err)
	}
	return s, nil
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS memories (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			content         TEXT    NOT NULL,
			sector          TEXT    NOT NULL DEFAULT 'semantic',
			salience        REAL    NOT NULL DEFAULT 0.5,
			decay_score     REAL    NOT NULL DEFAULT 0.5,
			last_accessed_at TEXT   NOT NULL DEFAULT (datetime('now')),
			access_count    INTEGER NOT NULL DEFAULT 0,
			created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
			summary         TEXT    NOT NULL DEFAULT '',
			user_id         TEXT    NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
		CREATE INDEX IF NOT EXISTS idx_memories_sector  ON memories(sector);

		CREATE TABLE IF NOT EXISTS vectors (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			memory_id       INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
			sector          TEXT    NOT NULL,
			vector          BLOB    NOT NULL,
			embedding_model TEXT    NOT NULL DEFAULT 'gemini-embedding-001'
		);
		CREATE INDEX IF NOT EXISTS idx_vectors_memory_id ON vectors(memory_id);

		CREATE TABLE IF NOT EXISTS waypoints (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			entity_text TEXT NOT NULL UNIQUE,
			entity_type TEXT NOT NULL DEFAULT 'unknown'
		);
		CREATE INDEX IF NOT EXISTS idx_waypoints_entity ON waypoints(entity_text);

		CREATE TABLE IF NOT EXISTS associations (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			memory_id   INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
			waypoint_id INTEGER NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE,
			weight      REAL    NOT NULL DEFAULT 0.5,
			UNIQUE(memory_id, waypoint_id)
		);
		CREATE INDEX IF NOT EXISTS idx_assoc_memory   ON associations(memory_id);
		CREATE INDEX IF NOT EXISTS idx_assoc_waypoint ON associations(waypoint_id);

		PRAGMA foreign_keys = ON;
	`)
	return err
}

// --- Vector encoding ---

// EncodeVector converts a float32 slice to a little-endian byte blob.
func EncodeVector(v []float32) []byte {
	buf := make([]byte, len(v)*4)
	for i, f := range v {
		binary.LittleEndian.PutUint32(buf[i*4:], math.Float32bits(f))
	}
	return buf
}

// DecodeVector converts a little-endian byte blob back to a float32 slice.
func DecodeVector(b []byte) []float32 {
	v := make([]float32, len(b)/4)
	for i := range v {
		v[i] = math.Float32frombits(binary.LittleEndian.Uint32(b[i*4:]))
	}
	return v
}

// --- Memory CRUD ---

// InsertMemory stores a new memory row and returns its ID.
func (s *Store) InsertMemory(m Memory) (int64, error) {
	res, err := s.db.Exec(`
		INSERT INTO memories (content, sector, salience, decay_score, summary, user_id)
		VALUES (?, ?, ?, ?, ?, ?)`,
		m.Content, string(m.Sector), m.Salience, m.Salience, m.Summary, m.UserID,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// InsertVector stores an embedding blob linked to a memory.
func (s *Store) InsertVector(memoryID int64, sector Sector, vec []float32) error {
	_, err := s.db.Exec(`
		INSERT INTO vectors (memory_id, sector, vector) VALUES (?, ?, ?)`,
		memoryID, string(sector), EncodeVector(vec),
	)
	return err
}

// memoryWithVector pairs a Memory with its embedding for scoring.
type memoryWithVector struct {
	Memory
	Vector []float32
}

// GetMemoriesWithVectors loads all memories (with vectors) for a given user.
// At NPC scale (~50-500 per user) this is fast enough to score in Go.
func (s *Store) GetMemoriesWithVectors(userID string) ([]memoryWithVector, error) {
	rows, err := s.db.Query(`
		SELECT m.id, m.content, m.sector, m.salience, m.decay_score,
		       m.last_accessed_at, m.access_count, m.created_at, m.summary, m.user_id,
		       v.vector
		FROM memories m
		LEFT JOIN vectors v ON v.memory_id = m.id
		WHERE m.user_id = ?
		ORDER BY m.created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []memoryWithVector
	for rows.Next() {
		var mwv memoryWithVector
		var lastAccessed, created string
		var vecBlob []byte

		if err := rows.Scan(
			&mwv.ID, &mwv.Content, &mwv.Sector, &mwv.Salience, &mwv.DecayScore,
			&lastAccessed, &mwv.AccessCount, &created, &mwv.Summary, &mwv.UserID,
			&vecBlob,
		); err != nil {
			return nil, err
		}

		mwv.LastAccessedAt, _ = time.Parse("2006-01-02 15:04:05", lastAccessed)
		mwv.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created)
		if vecBlob != nil {
			mwv.Vector = DecodeVector(vecBlob)
		}
		results = append(results, mwv)
	}
	return results, rows.Err()
}

// --- Waypoint CRUD ---

// UpsertWaypoint inserts or finds a waypoint by entity text, returns its ID.
func (s *Store) UpsertWaypoint(text, entityType string) (int64, error) {
	_, err := s.db.Exec(`
		INSERT INTO waypoints (entity_text, entity_type) VALUES (?, ?)
		ON CONFLICT(entity_text) DO UPDATE SET entity_type = excluded.entity_type`,
		text, entityType,
	)
	if err != nil {
		return 0, err
	}

	var id int64
	err = s.db.QueryRow(`SELECT id FROM waypoints WHERE entity_text = ?`, text).Scan(&id)
	return id, err
}

// InsertAssociation links a memory to a waypoint with a weight.
func (s *Store) InsertAssociation(memoryID, waypointID int64, weight float64) error {
	_, err := s.db.Exec(`
		INSERT INTO associations (memory_id, waypoint_id, weight) VALUES (?, ?, ?)
		ON CONFLICT(memory_id, waypoint_id) DO UPDATE SET weight = MAX(weight, excluded.weight)`,
		memoryID, waypointID, weight,
	)
	return err
}

// GetAssociatedWaypointIDs returns waypoint IDs linked to a memory.
func (s *Store) GetAssociatedWaypointIDs(memoryID int64) ([]int64, error) {
	rows, err := s.db.Query(`SELECT waypoint_id FROM associations WHERE memory_id = ?`, memoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// GetMemoriesByWaypoint returns memories linked to a waypoint, excluding a set of IDs.
func (s *Store) GetMemoriesByWaypoint(waypointID int64, userID string, excludeIDs map[int64]bool) ([]memoryWithVector, error) {
	rows, err := s.db.Query(`
		SELECT m.id, m.content, m.sector, m.salience, m.decay_score,
		       m.last_accessed_at, m.access_count, m.created_at, m.summary, m.user_id,
		       v.vector, a.weight
		FROM associations a
		JOIN memories m ON m.id = a.memory_id
		LEFT JOIN vectors v ON v.memory_id = m.id
		WHERE a.waypoint_id = ? AND m.user_id = ?`,
		waypointID, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []memoryWithVector
	for rows.Next() {
		var mwv memoryWithVector
		var lastAccessed, created string
		var vecBlob []byte
		var linkWeight float64

		if err := rows.Scan(
			&mwv.ID, &mwv.Content, &mwv.Sector, &mwv.Salience, &mwv.DecayScore,
			&lastAccessed, &mwv.AccessCount, &created, &mwv.Summary, &mwv.UserID,
			&vecBlob, &linkWeight,
		); err != nil {
			return nil, err
		}

		if excludeIDs[mwv.ID] {
			continue
		}

		mwv.LastAccessedAt, _ = time.Parse("2006-01-02 15:04:05", lastAccessed)
		mwv.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", created)
		if vecBlob != nil {
			mwv.Vector = DecodeVector(vecBlob)
		}
		results = append(results, mwv)
	}
	return results, rows.Err()
}

// --- Reinforcement ---

// ReinforceSalience boosts a memory's salience and updates its access timestamp.
func (s *Store) ReinforceSalience(memoryID int64, boost float64) error {
	_, err := s.db.Exec(`
		UPDATE memories
		SET salience = MIN(salience + ?, 1.0),
		    decay_score = MIN(decay_score + ?, 1.0),
		    last_accessed_at = datetime('now'),
		    access_count = access_count + 1
		WHERE id = ?`,
		boost, boost, memoryID,
	)
	return err
}

// --- Decay sweep ---

// RunDecaySweep applies exponential decay to all memories and prunes dead ones.
// Returns count of memories updated and deleted.
func (s *Store) RunDecaySweep(minScore float64) (updated int, deleted int, err error) {
	tx, err := s.db.Begin()
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()

	// Load all memories for decay calculation
	rows, err := tx.Query(`
		SELECT id, sector, salience, last_accessed_at FROM memories`)
	if err != nil {
		return 0, 0, err
	}

	type decayUpdate struct {
		id    int64
		score float64
	}
	var updates []decayUpdate
	var toDelete []int64

	now := time.Now()
	for rows.Next() {
		var id int64
		var sector string
		var salience float64
		var lastAccessed string

		if err := rows.Scan(&id, &sector, &salience, &lastAccessed); err != nil {
			rows.Close()
			return 0, 0, err
		}

		accessTime, _ := time.Parse("2006-01-02 15:04:05", lastAccessed)
		days := now.Sub(accessTime).Hours() / 24.0

		lambda := SectorDecayLambda[Sector(sector)]
		if lambda == 0 {
			lambda = 0.02 // default warm
		}

		newScore := salience * math.Exp(-lambda*days/(salience+0.1))

		if newScore < minScore {
			toDelete = append(toDelete, id)
		} else {
			updates = append(updates, decayUpdate{id, newScore})
		}
	}
	rows.Close()

	// Apply updates
	stmt, err := tx.Prepare(`UPDATE memories SET decay_score = ? WHERE id = ?`)
	if err != nil {
		return 0, 0, err
	}
	for _, u := range updates {
		stmt.Exec(u.score, u.id)
	}
	stmt.Close()

	// Delete dead memories (cascades to vectors + associations)
	for _, id := range toDelete {
		tx.Exec(`DELETE FROM memories WHERE id = ?`, id)
	}

	// Decay association weights
	tx.Exec(`UPDATE associations SET weight = weight * 0.995`)
	tx.Exec(`DELETE FROM associations WHERE weight < 0.05`)

	// Clean up orphaned waypoints
	tx.Exec(`DELETE FROM waypoints WHERE id NOT IN (SELECT DISTINCT waypoint_id FROM associations)`)

	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}

	return len(updates), len(toDelete), nil
}

// --- Memory cap enforcement ---

// EnforceMemoryLimit deletes the oldest low-salience memories if a user exceeds the limit.
func (s *Store) EnforceMemoryLimit(userID string, maxCount int) error {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM memories WHERE user_id = ?`, userID).Scan(&count); err != nil {
		return err
	}
	if count <= maxCount {
		return nil
	}

	excess := count - maxCount
	_, err := s.db.Exec(`
		DELETE FROM memories WHERE id IN (
			SELECT id FROM memories
			WHERE user_id = ?
			ORDER BY decay_score ASC, created_at ASC
			LIMIT ?
		)`, userID, excess,
	)
	return err
}

// Close shuts down the database connection.
func (s *Store) Close() error {
	return s.db.Close()
}
