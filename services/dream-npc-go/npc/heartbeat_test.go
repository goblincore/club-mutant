package npc

import (
	"testing"
	"time"
)

func TestTriggerContext_GlobalCooldown(t *testing.T) {
	ctx := NewTriggerContext()

	trigger := Trigger{
		ID:        TriggerReactToMusic,
		PerPlayer: false,
		Cooldown:  120 * time.Second,
	}

	snap := WorldSnapshot{Players: []PlayerPresence{{ID: "a", Name: "Alice", LastChatAge: 60}}}

	// First fire should be allowed
	if !ctx.CanFire(trigger, "", snap) {
		t.Error("first fire should be allowed")
	}

	// Record the fire
	ctx.RecordFire(trigger, "")

	// Second fire should be blocked (global 60s minimum)
	if ctx.CanFire(trigger, "", snap) {
		t.Error("should be blocked by 60s global minimum")
	}
}

func TestTriggerContext_PerPlayerCooldown(t *testing.T) {
	ctx := NewTriggerContext()

	trigger := Trigger{
		ID:        TriggerGreetNewcomer,
		PerPlayer: true,
	}

	snap := WorldSnapshot{Players: []PlayerPresence{{ID: "a", Name: "Alice", LastChatAge: 60}}}

	// Fire for player a
	ctx.RecordFire(trigger, "a")

	// Manually set lastGlobalAction to past to bypass global cooldown
	ctx.mu.Lock()
	ctx.lastGlobalAction = time.Now().Add(-2 * time.Minute)
	ctx.mu.Unlock()

	// Player a should be blocked
	if ctx.CanFire(trigger, "a", snap) {
		t.Error("should be blocked for same player")
	}

	// Player b should be allowed
	if !ctx.CanFire(trigger, "b", snap) {
		t.Error("should be allowed for different player")
	}
}

func TestTriggerContext_SuppressedDuringConversation(t *testing.T) {
	ctx := NewTriggerContext()

	trigger := Trigger{
		ID:        TriggerBreakSilence,
		PerPlayer: false,
		Cooldown:  180 * time.Second,
	}

	// Player chatted 10 seconds ago → suppress
	snap := WorldSnapshot{
		Players: []PlayerPresence{{ID: "a", Name: "Alice", LastChatAge: 10}},
	}

	if ctx.CanFire(trigger, "", snap) {
		t.Error("should be suppressed when player chatted < 30s ago")
	}
}

func TestTriggerContext_MusicChange(t *testing.T) {
	ctx := NewTriggerContext()

	changed := ctx.UpdateMusic("Song A")
	if !changed {
		t.Error("first music set should count as change")
	}

	changed = ctx.UpdateMusic("Song A")
	if changed {
		t.Error("same music should not count as change")
	}

	changed = ctx.UpdateMusic("Song B")
	if !changed {
		t.Error("different music should count as change")
	}
}

func TestEvaluateTriggers_InnerStateModulation_LowEnergy(t *testing.T) {
	triggers := DefineTriggers(nil)
	ctx := NewTriggerContext()

	state := &InnerState{
		Mood:         "exhausted",
		Energy:       0.1, // below 0.2 threshold
		SocialDesire: 0.8,
	}

	snap := WorldSnapshot{
		Players:         []PlayerPresence{{ID: "a", Name: "Alice", IsNew: true, LastChatAge: 60}},
		SilenceDuration: 200,
		RecentChatCount: 0,
	}

	trigger, _ := EvaluateTriggers(triggers, snap, state, ctx)
	if trigger != nil {
		t.Error("all triggers should be suppressed when energy < 0.2")
	}
}

func TestEvaluateTriggers_InnerStateModulation_LowSocialDesire(t *testing.T) {
	triggers := DefineTriggers(nil)
	ctx := NewTriggerContext()

	state := &InnerState{
		Mood:         "contemplative",
		Energy:       0.8,
		SocialDesire: 0.2, // below 0.3 threshold
	}

	snap := WorldSnapshot{
		Players:         []PlayerPresence{{ID: "a", Name: "Alice", IsNew: true, LastChatAge: 60}},
		SilenceDuration: 200,
	}

	trigger, _ := EvaluateTriggers(triggers, snap, state, ctx)
	if trigger != nil {
		t.Error("all triggers should be suppressed when socialDesire < 0.3")
	}
}

func TestEvaluateTriggers_GreetNewcomer(t *testing.T) {
	triggers := DefineTriggers(nil)
	ctx := NewTriggerContext()

	state := &InnerState{
		Mood:         "warm",
		Energy:       0.7,
		SocialDesire: 0.8,
	}

	snap := WorldSnapshot{
		Players: []PlayerPresence{{ID: "a", Name: "Alice", IsNew: true, LastChatAge: -1}},
	}

	// Run multiple times — with 90% probability, should fire at least once in 20 attempts
	fired := false
	for i := 0; i < 20; i++ {
		freshCtx := NewTriggerContext()
		trigger, targetID := EvaluateTriggers(triggers, snap, state, freshCtx)
		if trigger != nil && trigger.ID == TriggerGreetNewcomer {
			fired = true
			if targetID != "a" {
				t.Errorf("expected target 'a', got %q", targetID)
			}
			break
		}
	}
	if !fired {
		t.Error("greet_newcomer should have fired at least once in 20 attempts (90% probability)")
	}
	_ = ctx // silence unused
}

func TestEvaluateTriggers_NoPlayersNoAction(t *testing.T) {
	triggers := DefineTriggers(nil)
	ctx := NewTriggerContext()

	state := &InnerState{Energy: 0.8, SocialDesire: 0.8}
	snap := WorldSnapshot{Players: []PlayerPresence{}}

	trigger, _ := EvaluateTriggers(triggers, snap, state, ctx)
	// No triggers should match with empty player list
	// (greet_newcomer needs isNew, welcome_back needs isNew + relationship, etc.)
	if trigger != nil {
		t.Errorf("expected no trigger with empty players, got %s", trigger.ID)
	}
}

func TestEvaluateTriggers_BreakSilence(t *testing.T) {
	triggers := DefineTriggers(nil)

	state := &InnerState{
		Mood:         "contemplative",
		Energy:       0.5,
		SocialDesire: 0.8, // > 0.7 threshold
	}

	snap := WorldSnapshot{
		Players:         []PlayerPresence{{ID: "a", Name: "Alice", LastChatAge: 200}}, // not chatting recently
		SilenceDuration: 200, // > 120s threshold
		RecentChatCount: 0,
	}

	// With 25% probability, need more attempts
	fired := false
	for i := 0; i < 50; i++ {
		freshCtx := NewTriggerContext()
		trigger, _ := EvaluateTriggers(triggers, snap, state, freshCtx)
		if trigger != nil && trigger.ID == TriggerBreakSilence {
			fired = true
			break
		}
	}
	if !fired {
		t.Error("break_silence should have fired at least once in 50 attempts (25% probability)")
	}
}

func TestParseResponse_WithAffinityDelta(t *testing.T) {
	raw := `{"text":"oh that's a great track...","behavior":"turn_to_player","affinityDelta":0.05,"note":"genuine music interest"}`
	parsed := parseResponse(raw)
	if parsed.Text != "oh that's a great track..." {
		t.Errorf("unexpected text: %s", parsed.Text)
	}
	if parsed.AffinityDelta != 0.05 {
		t.Errorf("expected affinityDelta 0.05, got %f", parsed.AffinityDelta)
	}
	if parsed.Note != "genuine music interest" {
		t.Errorf("unexpected note: %s", parsed.Note)
	}
}

func TestParseResponse_RawTextFallback(t *testing.T) {
	raw := "hey there, welcome to the bar"
	parsed := parseResponse(raw)
	if parsed.Text != raw {
		t.Errorf("expected raw text, got %s", parsed.Text)
	}
	if parsed.AffinityDelta != 0.02 {
		t.Errorf("expected default affinityDelta 0.02, got %f", parsed.AffinityDelta)
	}
}

func TestParseResponse_EmptyOnLongText(t *testing.T) {
	raw := "This is a very long response that exceeds the 150 character limit for raw text fallback. It keeps going and going with more words and more text until it passes the threshold easily."
	parsed := parseResponse(raw)
	if parsed.Text != "" {
		t.Error("expected empty text for long raw response")
	}
}
