package npc

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestTierAdvancement_StrangerToAcquaintance(t *testing.T) {
	rel := &Relationship{
		Tier:         TierStranger,
		Interactions: 3,
		Affinity:     0.3,
	}
	if !CheckTierAdvancement(rel) {
		t.Error("expected tier advancement from Stranger to Acquaintance")
	}
	if rel.Tier != TierAcquaintance {
		t.Errorf("expected TierAcquaintance, got %d", rel.Tier)
	}
}

func TestTierAdvancement_InsufficientInteractions(t *testing.T) {
	rel := &Relationship{
		Tier:         TierStranger,
		Interactions: 2, // need 3
		Affinity:     0.5,
	}
	if CheckTierAdvancement(rel) {
		t.Error("should not advance with insufficient interactions")
	}
}

func TestTierAdvancement_InsufficientAffinity(t *testing.T) {
	rel := &Relationship{
		Tier:         TierStranger,
		Interactions: 10,
		Affinity:     0.2, // need 0.3
	}
	if CheckTierAdvancement(rel) {
		t.Error("should not advance with insufficient affinity")
	}
}

func TestTierAdvancement_OnlyOneStep(t *testing.T) {
	rel := &Relationship{
		Tier:         TierStranger,
		Interactions: 100,
		Affinity:     1.0,
	}
	CheckTierAdvancement(rel)
	if rel.Tier != TierAcquaintance {
		t.Errorf("should only advance one tier, got %d", rel.Tier)
	}
}

func TestTierAdvancement_MaxTier(t *testing.T) {
	rel := &Relationship{
		Tier:         TierConfidant,
		Interactions: 100,
		Affinity:     1.0,
	}
	if CheckTierAdvancement(rel) {
		t.Error("should not advance past max tier")
	}
}

func TestTierAdvancement_RegularToFriend(t *testing.T) {
	rel := &Relationship{
		Tier:         TierRegular,
		Interactions: 15,
		Affinity:     0.8,
	}
	if !CheckTierAdvancement(rel) {
		t.Error("expected tier advancement from Regular to Friend")
	}
	if rel.Tier != TierFriend {
		t.Errorf("expected TierFriend, got %d", rel.Tier)
	}
}

func TestAffinityDecay_RecentVisit(t *testing.T) {
	rel := &Relationship{
		Tier:     TierRegular,
		Affinity: 0.75,
		LastSeen: time.Now().Add(-10 * 24 * time.Hour), // 10 days ago
	}
	originalAffinity := rel.Affinity
	ApplyAffinityDecay(rel)
	if rel.Affinity != originalAffinity {
		t.Error("should not decay within 14 days")
	}
}

func TestAffinityDecay_StaleVisit(t *testing.T) {
	rel := &Relationship{
		Tier:     TierRegular,
		Affinity: 0.75,
		LastSeen: time.Now().Add(-20 * 24 * time.Hour), // 20 days ago (14 grace + 6 decay days)
	}
	ApplyAffinityDecay(rel)
	// 6 days of decay at 0.02/day = 0.12 decay → 0.75 - 0.12 = 0.63
	expected := 0.63
	if rel.Affinity < expected-0.01 || rel.Affinity > expected+0.01 {
		t.Errorf("expected affinity ~%.2f, got %.2f", expected, rel.Affinity)
	}
}

func TestAffinityDecay_FloorAtTierMinimum(t *testing.T) {
	rel := &Relationship{
		Tier:     TierRegular,
		Affinity: 0.65,
		LastSeen: time.Now().Add(-100 * 24 * time.Hour), // long gone
	}
	ApplyAffinityDecay(rel)
	if rel.Affinity < 0.6 {
		t.Errorf("affinity should not drop below tier floor 0.6, got %.2f", rel.Affinity)
	}
}

func TestAffinityDecay_StrangerFloorIsZero(t *testing.T) {
	rel := &Relationship{
		Tier:     TierStranger,
		Affinity: 0.1,
		LastSeen: time.Now().Add(-100 * 24 * time.Hour),
	}
	ApplyAffinityDecay(rel)
	if rel.Affinity < 0 {
		t.Error("affinity should not go negative")
	}
}

func TestTierName(t *testing.T) {
	tests := []struct {
		tier RelationshipTier
		want string
	}{
		{TierStranger, "Stranger"},
		{TierAcquaintance, "Acquaintance"},
		{TierRegular, "Regular"},
		{TierFriend, "Friend"},
		{TierConfidant, "Confidant"},
	}
	for _, tt := range tests {
		if got := TierName(tt.tier); got != tt.want {
			t.Errorf("TierName(%d) = %s, want %s", tt.tier, got, tt.want)
		}
	}
}

func TestFormatRelationshipForPrompt_Stranger(t *testing.T) {
	rel := &Relationship{Tier: TierStranger}
	result := FormatRelationshipForPrompt(rel)
	if result != "" {
		t.Error("strangers should produce empty prompt")
	}
}

func TestFormatRelationshipForPrompt_Regular(t *testing.T) {
	rel := &Relationship{
		Tier:         TierRegular,
		Interactions: 10,
		Affinity:     0.72,
		Notes:        "Loves ambient music",
	}
	result := FormatRelationshipForPrompt(rel)
	if result == "" {
		t.Error("expected non-empty prompt for Regular tier")
	}
}

// ── Store Tests (SQLite) ──

func tempDBPath(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	return filepath.Join(dir, "test.db")
}

func TestRelationshipStore_CreateAndGet(t *testing.T) {
	store, err := NewRelationshipStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// Initially nil
	rel := store.GetRelationship("player1", "lily_bartender")
	if rel != nil {
		t.Error("expected nil for non-existent relationship")
	}

	// Update creates a new relationship
	store.UpdateAfterChat("player1", "lily_bartender", 0.05, "likes music")

	rel = store.GetRelationship("player1", "lily_bartender")
	if rel == nil {
		t.Fatal("expected relationship after chat")
	}
	if rel.Interactions != 1 {
		t.Errorf("expected 1 interaction, got %d", rel.Interactions)
	}
	if rel.Affinity < 0.04 || rel.Affinity > 0.06 {
		t.Errorf("expected affinity ~0.05, got %.2f", rel.Affinity)
	}
	if rel.Notes != "likes music" {
		t.Errorf("expected notes 'likes music', got %q", rel.Notes)
	}
}

func TestRelationshipStore_TierProgression(t *testing.T) {
	store, err := NewRelationshipStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// Simulate multiple chats to advance from Stranger to Acquaintance
	for i := 0; i < 4; i++ {
		store.UpdateAfterChat("player1", "lily_bartender", 0.1, "good vibes")
	}

	rel := store.GetRelationship("player1", "lily_bartender")
	if rel == nil {
		t.Fatal("expected relationship")
	}
	if rel.Tier < TierAcquaintance {
		t.Errorf("expected at least Acquaintance tier after 4 chats with high affinity, got tier %d (affinity %.2f, interactions %d)",
			rel.Tier, rel.Affinity, rel.Interactions)
	}
}

func TestRelationshipStore_AffinityClamp(t *testing.T) {
	store, err := NewRelationshipStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// Massive positive delta should be clamped
	store.UpdateAfterChat("player1", "lily_bartender", 5.0, "")
	rel := store.GetRelationship("player1", "lily_bartender")
	if rel == nil {
		t.Fatal("expected relationship")
	}
	if rel.Affinity > 1.0 {
		t.Errorf("affinity should be clamped to 1.0, got %.2f", rel.Affinity)
	}
}

func TestRelationshipStore_NegativeDelta(t *testing.T) {
	store, err := NewRelationshipStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// Start with some affinity
	store.UpdateAfterChat("player1", "lily_bartender", 0.3, "")
	// Apply negative
	store.UpdateAfterChat("player1", "lily_bartender", -0.5, "rude")

	rel := store.GetRelationship("player1", "lily_bartender")
	if rel == nil {
		t.Fatal("expected relationship")
	}
	if rel.Affinity < 0 {
		t.Errorf("affinity should not go below 0, got %.2f", rel.Affinity)
	}
}

func TestRelationshipStore_MultiplePersonalities(t *testing.T) {
	store, err := NewRelationshipStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	store.UpdateAfterChat("player1", "lily_bartender", 0.1, "")
	store.UpdateAfterChat("player1", "watcher", 0.2, "")

	lily := store.GetRelationship("player1", "lily_bartender")
	watcher := store.GetRelationship("player1", "watcher")

	if lily == nil || watcher == nil {
		t.Fatal("expected both relationships")
	}
	if lily.Affinity == watcher.Affinity {
		t.Error("expected different affinities for different personalities")
	}
}

func init() {
	// Ensure temp dir exists for tests
	os.MkdirAll(os.TempDir(), 0755)
}
