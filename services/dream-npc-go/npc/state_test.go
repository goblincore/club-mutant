package npc

import (
	"testing"
	"time"
)

func TestStateManager_NewStateIsNil(t *testing.T) {
	sm := NewStateManager()
	state := sm.GetState("lily_bartender")
	if state != nil {
		t.Error("expected nil state for new personality")
	}
}

func TestStateManager_HasChanged_NewPlayer(t *testing.T) {
	sm := NewStateManager()

	prev := &WorldSnapshot{
		Players: []PlayerPresence{{ID: "a", Name: "Alice"}},
	}
	curr := &WorldSnapshot{
		Players: []PlayerPresence{
			{ID: "a", Name: "Alice"},
			{ID: "b", Name: "Bob", IsNew: true},
		},
	}

	if !sm.hasChanged(prev, curr) {
		t.Error("expected change when new player arrives")
	}
}

func TestStateManager_HasChanged_PlayerLeft(t *testing.T) {
	sm := NewStateManager()

	prev := &WorldSnapshot{
		Players: []PlayerPresence{
			{ID: "a", Name: "Alice"},
			{ID: "b", Name: "Bob"},
		},
	}
	curr := &WorldSnapshot{
		Players: []PlayerPresence{{ID: "a", Name: "Alice"}},
	}

	if !sm.hasChanged(prev, curr) {
		t.Error("expected change when player leaves")
	}
}

func TestStateManager_HasChanged_MusicChanged(t *testing.T) {
	sm := NewStateManager()

	prev := &WorldSnapshot{MusicPlaying: "Song A"}
	curr := &WorldSnapshot{MusicPlaying: "Song B"}

	if !sm.hasChanged(prev, curr) {
		t.Error("expected change when music changes")
	}
}

func TestStateManager_HasChanged_ConversationStarted(t *testing.T) {
	sm := NewStateManager()

	prev := &WorldSnapshot{RecentChatCount: 0}
	curr := &WorldSnapshot{RecentChatCount: 3}

	if !sm.hasChanged(prev, curr) {
		t.Error("expected change when conversation starts")
	}
}

func TestStateManager_HasChanged_NoChange(t *testing.T) {
	sm := NewStateManager()

	snap := &WorldSnapshot{
		Players:      []PlayerPresence{{ID: "a", Name: "Alice"}},
		MusicPlaying: "Song A",
	}

	if sm.hasChanged(snap, snap) {
		t.Error("expected no change for identical snapshots")
	}
}

func TestStateManager_ParseInnerState(t *testing.T) {
	sm := NewStateManager()

	raw := `{"mood":"melancholy","energy":0.3,"socialDesire":0.7,"thought":"quiet night..."}`
	state := sm.parseInnerState(raw)
	if state == nil {
		t.Fatal("expected non-nil state")
	}
	if state.Mood != "melancholy" {
		t.Errorf("expected mood melancholy, got %s", state.Mood)
	}
	if state.Energy != 0.3 {
		t.Errorf("expected energy 0.3, got %f", state.Energy)
	}
	if state.SocialDesire != 0.7 {
		t.Errorf("expected socialDesire 0.7, got %f", state.SocialDesire)
	}
}

func TestStateManager_ParseInnerState_WithSurroundingText(t *testing.T) {
	sm := NewStateManager()

	raw := `Here's how I feel: {"mood":"warm","energy":0.8,"socialDesire":0.6,"thought":"fun crowd tonight"}`
	state := sm.parseInnerState(raw)
	if state == nil {
		t.Fatal("expected non-nil state from wrapped JSON")
	}
	if state.Mood != "warm" {
		t.Errorf("expected mood warm, got %s", state.Mood)
	}
}

func TestStateManager_ParseInnerState_Clamping(t *testing.T) {
	sm := NewStateManager()

	raw := `{"mood":"buzzing","energy":1.5,"socialDesire":-0.3,"thought":"whoa"}`
	state := sm.parseInnerState(raw)
	if state == nil {
		t.Fatal("expected non-nil state")
	}
	if state.Energy != 1.0 {
		t.Errorf("expected energy clamped to 1.0, got %f", state.Energy)
	}
	if state.SocialDesire != 0.0 {
		t.Errorf("expected socialDesire clamped to 0.0, got %f", state.SocialDesire)
	}
}

func TestFormatInnerStateForPrompt(t *testing.T) {
	state := &InnerState{
		Mood:    "contemplative",
		Energy:  0.4,
		Thought: "thinking about the stars",
	}
	result := FormatInnerStateForPrompt(state)
	if result == "" {
		t.Error("expected non-empty prompt")
	}
	if result == "" || len(result) < 20 {
		t.Error("expected substantial prompt text")
	}
}

func TestFormatInnerStateForPrompt_Nil(t *testing.T) {
	result := FormatInnerStateForPrompt(nil)
	if result != "" {
		t.Error("expected empty string for nil state")
	}
}

func TestClampFloat(t *testing.T) {
	tests := []struct {
		v, min, max, want float64
	}{
		{0.5, 0, 1, 0.5},
		{-0.1, 0, 1, 0},
		{1.5, 0, 1, 1},
		{0, 0, 1, 0},
		{1, 0, 1, 1},
	}
	for _, tt := range tests {
		got := clampFloat(tt.v, tt.min, tt.max)
		if got != tt.want {
			t.Errorf("clampFloat(%f, %f, %f) = %f, want %f", tt.v, tt.min, tt.max, got, tt.want)
		}
	}
}

func TestBuildReflectionPrompt(t *testing.T) {
	sm := NewStateManager()

	snapshot := WorldSnapshot{
		Players: []PlayerPresence{
			{ID: "a", Name: "Alice", IsNew: true},
			{ID: "b", Name: "Bob", LastChatAge: 30},
		},
		MusicPlaying:    "Denki Groove - Nothing's Gonna Change",
		SilenceDuration: 0,
		RecentChatCount: 3,
		TimeOfDay:       "evening",
	}

	prompt := sm.buildReflectionPrompt("You are Lily.", nil, snapshot)
	if prompt == "" {
		t.Error("expected non-empty prompt")
	}

	// Should mention players and music
	if !contains(prompt, "Alice") {
		t.Error("expected prompt to mention Alice")
	}
	if !contains(prompt, "Denki Groove") {
		t.Error("expected prompt to mention music")
	}
}

func TestBuildReflectionPrompt_WithPreviousState(t *testing.T) {
	sm := NewStateManager()

	prev := &InnerState{
		Mood:         "warm",
		Energy:       0.7,
		SocialDesire: 0.6,
		Thought:      "nice crowd tonight",
		UpdatedAt:    time.Now(),
	}

	snapshot := WorldSnapshot{
		Players: []PlayerPresence{{ID: "a", Name: "Alice"}},
		TimeOfDay: "evening",
	}

	prompt := sm.buildReflectionPrompt("You are Lily.", prev, snapshot)
	if !contains(prompt, "warm") {
		t.Error("expected prompt to include previous mood")
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstring(s, substr))
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
