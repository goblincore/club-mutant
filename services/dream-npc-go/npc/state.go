package npc

import (
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"
)

// StateManager holds ephemeral inner state for each NPC personality.
// State is in-memory only — resets on service restart.
type StateManager struct {
	mu        sync.RWMutex
	states    map[string]*InnerState    // personalityID → current state
	snapshots map[string]*WorldSnapshot // personalityID → previous snapshot
}

func NewStateManager() *StateManager {
	return &StateManager{
		states:    make(map[string]*InnerState),
		snapshots: make(map[string]*WorldSnapshot),
	}
}

// GetState returns the current inner state for a personality (may be nil).
func (sm *StateManager) GetState(personalityID string) *InnerState {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.states[personalityID]
}

// UpdateState evaluates the world snapshot and updates inner state if needed.
// Returns the (possibly unchanged) inner state.
func (sm *StateManager) UpdateState(personalityID string, snapshot WorldSnapshot) *InnerState {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	current := sm.states[personalityID]
	prev := sm.snapshots[personalityID]

	// Change detection: skip LLM call if nothing meaningful changed AND < 5 minutes elapsed
	if current != nil && prev != nil && !sm.hasChanged(prev, &snapshot) &&
		time.Since(current.UpdatedAt) < 5*time.Minute {
		return current
	}

	// Look up personality for reflection prompt
	personality, ok := Personalities[personalityID]
	if !ok {
		return current
	}

	reflectionPrompt := personality.ReflectionPrompt
	if reflectionPrompt == "" {
		// No reflection prompt configured — skip inner monologue
		return current
	}

	// Build reflection prompt
	prompt := sm.buildReflectionPrompt(reflectionPrompt, current, snapshot)

	// Call LLM for reflection
	raw := CallGemini(ReflectionConfig, reflectionPrompt, nil, prompt)
	if raw == "" {
		return current
	}

	// Parse inner state from response
	newState := sm.parseInnerState(raw)
	if newState == nil {
		return current
	}

	newState.UpdatedAt = time.Now()
	sm.states[personalityID] = newState
	sm.snapshots[personalityID] = &snapshot

	return newState
}

// hasChanged detects meaningful changes between snapshots.
func (sm *StateManager) hasChanged(prev, curr *WorldSnapshot) bool {
	// Player count changed
	if len(prev.Players) != len(curr.Players) {
		return true
	}

	// Different player set
	prevIDs := playerIDs(prev.Players)
	currIDs := playerIDs(curr.Players)
	if prevIDs != currIDs {
		return true
	}

	// New player arrived
	for _, p := range curr.Players {
		if p.IsNew {
			return true
		}
	}

	// Music changed
	if prev.MusicPlaying != curr.MusicPlaying {
		return true
	}

	// Conversation happened (was silent, now has recent chat)
	if prev.RecentChatCount == 0 && curr.RecentChatCount > 0 {
		return true
	}

	// Significant silence change (crossed a 60s threshold)
	if (prev.SilenceDuration/60) != (curr.SilenceDuration/60) {
		return true
	}

	return false
}

func playerIDs(players []PlayerPresence) string {
	ids := make([]string, len(players))
	for i, p := range players {
		ids[i] = p.ID
	}
	sort.Strings(ids)
	return strings.Join(ids, ",")
}

func (sm *StateManager) buildReflectionPrompt(reflectionPrompt string, current *InnerState, snapshot WorldSnapshot) string {
	var parts []string

	// World state
	parts = append(parts, fmt.Sprintf("CURRENT SCENE:\n- %d people in the bar", len(snapshot.Players)))
	if snapshot.MusicPlaying != "" {
		parts = append(parts, fmt.Sprintf("- Playing: %s", snapshot.MusicPlaying))
	} else {
		parts = append(parts, "- No music playing")
	}
	if snapshot.SilenceDuration > 60 {
		parts = append(parts, fmt.Sprintf("- It's been quiet for %d seconds", snapshot.SilenceDuration))
	}
	if snapshot.RecentChatCount > 0 {
		parts = append(parts, fmt.Sprintf("- %d messages in the last minute", snapshot.RecentChatCount))
	}
	parts = append(parts, fmt.Sprintf("- Time: %s", snapshot.TimeOfDay))

	// Player details
	if len(snapshot.Players) > 0 {
		var playerDescs []string
		for _, p := range snapshot.Players {
			desc := p.Name
			if p.IsNew {
				desc += " (just arrived)"
			} else if p.LastChatAge >= 0 && p.LastChatAge < 60 {
				desc += " (chatting)"
			} else if p.LastChatAge == -1 {
				desc += " (hasn't said anything)"
			}
			playerDescs = append(playerDescs, desc)
		}
		parts = append(parts, "- People: "+strings.Join(playerDescs, ", "))
	}

	// Recent messages for vibe
	if len(snapshot.RecentMessages) > 0 {
		parts = append(parts, "- Recent conversation vibe: "+strings.Join(snapshot.RecentMessages, " / "))
	}

	// Previous state
	if current != nil {
		parts = append(parts, fmt.Sprintf("\nYOUR PREVIOUS STATE:\nMood: %s | Energy: %.1f | Social desire: %.1f\nThought: %q",
			current.Mood, current.Energy, current.SocialDesire, current.Thought))
	}

	parts = append(parts, "\nGiven what's happening, how are you feeling right now? Respond as JSON only: {\"mood\": \"...\", \"energy\": 0.0-1.0, \"socialDesire\": 0.0-1.0, \"thought\": \"...\"}")

	return strings.Join(parts, "\n")
}

func (sm *StateManager) parseInnerState(raw string) *InnerState {
	var state InnerState

	// Try direct parse
	if err := json.Unmarshal([]byte(raw), &state); err == nil && state.Mood != "" {
		state.Energy = clampFloat(state.Energy, 0, 1)
		state.SocialDesire = clampFloat(state.SocialDesire, 0, 1)
		return &state
	}

	// Try extracting JSON from text
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start >= 0 && end > start {
		if err := json.Unmarshal([]byte(raw[start:end+1]), &state); err == nil && state.Mood != "" {
			state.Energy = clampFloat(state.Energy, 0, 1)
			state.SocialDesire = clampFloat(state.SocialDesire, 0, 1)
			return &state
		}
	}

	log.Printf("[state] Failed to parse inner state: %s", raw)
	return nil
}

func clampFloat(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// FormatForPrompt formats the inner state for injection into chat prompts.
func FormatInnerStateForPrompt(state *InnerState) string {
	if state == nil {
		return ""
	}
	return fmt.Sprintf("CURRENT INNER STATE (this colors your responses — don't describe it explicitly):\nMood: %s | Energy: %.1f | Feeling: %q",
		state.Mood, state.Energy, state.Thought)
}
