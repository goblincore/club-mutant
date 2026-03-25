package npc

import (
	"fmt"
	"log"
	"strings"
	"sync/atomic"
	"time"
)

// HeartbeatHandler processes heartbeat requests from the Colyseus server.
type HeartbeatHandler struct {
	stateManager *StateManager
	relStore     *RelationshipStore
	triggerCtx   *TriggerContext
	triggers     []Trigger

	// Observability counters
	totalHeartbeats atomic.Int64
	llmCalls        atomic.Int64
	triggersFired   atomic.Int64
}

func NewHeartbeatHandler(sm *StateManager, rs *RelationshipStore) *HeartbeatHandler {
	return &HeartbeatHandler{
		stateManager: sm,
		relStore:     rs,
		triggerCtx:   NewTriggerContext(),
		triggers:     DefineTriggers(rs),
	}
}

// HandleHeartbeat processes a heartbeat and returns what the NPC should do.
func (hh *HeartbeatHandler) HandleHeartbeat(personalityID string, snapshot WorldSnapshot) HeartbeatResponse {
	start := time.Now()
	hh.totalHeartbeats.Add(1)

	// No players → no action
	if len(snapshot.Players) == 0 {
		return HeartbeatResponse{Action: "none"}
	}

	// Layer 1: Update inner state
	llmCalled := false
	prevState := hh.stateManager.GetState(personalityID)
	state := hh.stateManager.UpdateState(personalityID, snapshot)
	if state != prevState {
		llmCalled = true
		hh.llmCalls.Add(1)
	}

	// Layer 3: Evaluate proactive triggers
	trigger, targetID := EvaluateTriggers(hh.triggers, snapshot, state, hh.triggerCtx)

	var response HeartbeatResponse
	triggerName := ""

	if trigger != nil {
		// Generate proactive speech
		text := hh.generateProactiveText(personalityID, trigger, targetID, snapshot, state)
		if text != "" {
			hh.triggerCtx.RecordFire(*trigger, targetID)
			hh.triggersFired.Add(1)
			triggerName = string(trigger.ID)
			response = HeartbeatResponse{
				Action:   "speak",
				Text:     text,
				Target:   targetID,
				Behavior: "turn_to_player",
			}
		} else {
			response = HeartbeatResponse{Action: "none"}
		}
	} else {
		response = HeartbeatResponse{Action: "none"}
	}

	// Structured observability log
	latency := time.Since(start).Milliseconds()
	log.Printf(`{"event":"heartbeat","personality":"%s","players":%d,"llm_called":%t,"trigger_fired":"%s","latency_ms":%d}`,
		personalityID, len(snapshot.Players), llmCalled, triggerName, latency)

	// Log counters every 100 heartbeats
	total := hh.totalHeartbeats.Load()
	if total%100 == 0 {
		log.Printf(`{"event":"heartbeat_stats","total":%d,"llm_calls":%d,"triggers_fired":%d}`,
			total, hh.llmCalls.Load(), hh.triggersFired.Load())
	}

	return response
}

// generateProactiveText generates a short utterance for a proactive trigger.
func (hh *HeartbeatHandler) generateProactiveText(personalityID string, trigger *Trigger, targetID string, snapshot WorldSnapshot, state *InnerState) string {
	personality, ok := Personalities[personalityID]
	if !ok {
		return ""
	}

	// Build minimal prompt
	var parts []string

	parts = append(parts, fmt.Sprintf("TRIGGER: %s", trigger.ID))

	// Target player info
	if targetID != "" {
		for _, p := range snapshot.Players {
			if p.ID == targetID {
				parts = append(parts, fmt.Sprintf("TARGET: %s", p.Name))
				if p.IsNew {
					parts = append(parts, "(just arrived)")
				}
				break
			}
		}
		// Relationship context for targeted speech
		if hh.relStore != nil {
			if rel := hh.relStore.GetRelationship(targetID, personalityID); rel != nil && rel.Tier > TierStranger {
				parts = append(parts, fmt.Sprintf("RELATIONSHIP: %s (tier: %s)", rel.Notes, TierName(rel.Tier)))
			}
		}
	}

	// Inner state
	if state != nil {
		parts = append(parts, fmt.Sprintf("YOUR MOOD: %s (energy: %.1f)", state.Mood, state.Energy))
		if state.Thought != "" {
			parts = append(parts, fmt.Sprintf("YOUR THOUGHT: %q", state.Thought))
		}
	}

	// Scene context
	if snapshot.MusicPlaying != "" {
		parts = append(parts, fmt.Sprintf("MUSIC: %s", snapshot.MusicPlaying))
	}
	parts = append(parts, fmt.Sprintf("PEOPLE: %d, TIME: %s", len(snapshot.Players), snapshot.TimeOfDay))

	// Instruction
	parts = append(parts, "\nSay something brief and natural (1-2 sentences max). Respond with just the text, no JSON.")

	prompt := strings.Join(parts, "\n")

	// Use abbreviated personality as system prompt
	sysPrompt := personality.ReflectionPrompt
	if sysPrompt == "" {
		sysPrompt = personality.SystemPrompt
	}

	raw := CallGemini(ProactiveConfig, sysPrompt, nil, prompt)
	if raw == "" {
		return ""
	}

	// Clean up the response — remove JSON wrapping if present
	cleaned := strings.TrimSpace(raw)
	cleaned = strings.Trim(cleaned, "\"")
	cleaned = strings.ReplaceAll(cleaned, "```", "")

	// Try to extract text from JSON if the LLM returned JSON anyway
	parsed := parseResponse(raw)
	if parsed.Text != "" {
		return parsed.Text
	}

	if len(cleaned) > 0 && len(cleaned) <= 200 {
		return cleaned
	}

	return ""
}
