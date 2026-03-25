package npc

import (
	"math/rand"
	"sync"
	"time"
)

// TriggerID identifies a proactive behavior trigger.
type TriggerID string

const (
	TriggerGreetNewcomer    TriggerID = "greet_newcomer"
	TriggerWelcomeBack      TriggerID = "welcome_back"
	TriggerReactToMusic     TriggerID = "react_to_music"
	TriggerNoticeWallflower TriggerID = "notice_wallflower"
	TriggerBreakSilence     TriggerID = "break_silence"
	TriggerReactToEnergy    TriggerID = "react_to_energy"
	TriggerShareThought     TriggerID = "share_thought"
)

// Trigger defines a proactive behavior with conditions and probability.
type Trigger struct {
	ID          TriggerID
	Priority    int
	Probability float64
	Cooldown    time.Duration
	PerPlayer   bool // if true, cooldown is per-player (otherwise global)
	Condition   func(snapshot WorldSnapshot, state *InnerState, ctx *TriggerContext) (bool, string) // returns (should_fire, target_playerID)
}

// TriggerContext tracks cooldowns and per-session state.
type TriggerContext struct {
	mu               sync.Mutex
	lastGlobalAction time.Time
	globalCooldowns  map[TriggerID]time.Time // triggerID → last fired
	playerCooldowns  map[string]map[TriggerID]bool // playerID → triggerID → fired this session
	lastMusicPlaying string
}

func NewTriggerContext() *TriggerContext {
	return &TriggerContext{
		globalCooldowns: make(map[TriggerID]time.Time),
		playerCooldowns: make(map[string]map[TriggerID]bool),
	}
}

// CanFire checks global constraints and trigger-specific cooldowns.
func (tc *TriggerContext) CanFire(trigger Trigger, targetPlayerID string, snapshot WorldSnapshot) bool {
	tc.mu.Lock()
	defer tc.mu.Unlock()

	// Global: minimum 60s between any proactive action
	if time.Since(tc.lastGlobalAction) < 60*time.Second {
		return false
	}

	// Suppressed during active conversation (any player chatted < 30s ago)
	for _, p := range snapshot.Players {
		if p.LastChatAge >= 0 && p.LastChatAge < 30 {
			return false
		}
	}

	// Check trigger-specific cooldown
	if trigger.PerPlayer {
		if targetPlayerID == "" {
			return false
		}
		if playerMap, ok := tc.playerCooldowns[targetPlayerID]; ok {
			if playerMap[trigger.ID] {
				return false // already fired for this player this session
			}
		}
	} else {
		if lastFired, ok := tc.globalCooldowns[trigger.ID]; ok {
			if time.Since(lastFired) < trigger.Cooldown {
				return false
			}
		}
	}

	return true
}

// RecordFire records that a trigger has fired.
func (tc *TriggerContext) RecordFire(trigger Trigger, targetPlayerID string) {
	tc.mu.Lock()
	defer tc.mu.Unlock()

	tc.lastGlobalAction = time.Now()

	if trigger.PerPlayer && targetPlayerID != "" {
		if tc.playerCooldowns[targetPlayerID] == nil {
			tc.playerCooldowns[targetPlayerID] = make(map[TriggerID]bool)
		}
		tc.playerCooldowns[targetPlayerID][trigger.ID] = true
	} else {
		tc.globalCooldowns[trigger.ID] = time.Now()
	}
}

// UpdateMusic tracks music changes for react-to-music trigger.
func (tc *TriggerContext) UpdateMusic(current string) (changed bool) {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	if current != tc.lastMusicPlaying {
		tc.lastMusicPlaying = current
		return true
	}
	return false
}

// DefineTriggers returns the ordered list of proactive triggers.
func DefineTriggers(relStore *RelationshipStore) []Trigger {
	return []Trigger{
		{
			ID: TriggerGreetNewcomer, Priority: 1, Probability: 0.9,
			Cooldown: 0, PerPlayer: true,
			Condition: func(snap WorldSnapshot, state *InnerState, ctx *TriggerContext) (bool, string) {
				for _, p := range snap.Players {
					if p.IsNew {
						return true, p.ID
					}
				}
				return false, ""
			},
		},
		{
			ID: TriggerWelcomeBack, Priority: 2, Probability: 0.8,
			Cooldown: 0, PerPlayer: true,
			Condition: func(snap WorldSnapshot, state *InnerState, ctx *TriggerContext) (bool, string) {
				if relStore == nil {
					return false, ""
				}
				for _, p := range snap.Players {
					if p.IsNew {
						rel := relStore.GetRelationship(p.ID, "lily_bartender")
						if rel != nil && rel.Tier >= TierAcquaintance {
							return true, p.ID
						}
					}
				}
				return false, ""
			},
		},
		{
			ID: TriggerReactToMusic, Priority: 3, Probability: 0.4,
			Cooldown: 120 * time.Second, PerPlayer: false,
			Condition: func(snap WorldSnapshot, state *InnerState, ctx *TriggerContext) (bool, string) {
				if snap.MusicPlaying == "" {
					return false, ""
				}
				// Only fire if music changed since last heartbeat
				changed := ctx.UpdateMusic(snap.MusicPlaying)
				return changed, ""
			},
		},
		{
			ID: TriggerNoticeWallflower, Priority: 4, Probability: 0.3,
			Cooldown: 0, PerPlayer: true,
			Condition: func(snap WorldSnapshot, state *InnerState, ctx *TriggerContext) (bool, string) {
				for _, p := range snap.Players {
					if !p.IsNew && p.LastChatAge == -1 {
						// Player present and has never chatted
						return true, p.ID
					}
				}
				return false, ""
			},
		},
		{
			ID: TriggerBreakSilence, Priority: 5, Probability: 0.25,
			Cooldown: 180 * time.Second, PerPlayer: false,
			Condition: func(snap WorldSnapshot, state *InnerState, ctx *TriggerContext) (bool, string) {
				return snap.SilenceDuration > 120 && state != nil && state.SocialDesire > 0.7, ""
			},
		},
		{
			ID: TriggerReactToEnergy, Priority: 6, Probability: 0.2,
			Cooldown: 180 * time.Second, PerPlayer: false,
			Condition: func(snap WorldSnapshot, state *InnerState, ctx *TriggerContext) (bool, string) {
				return snap.RecentChatCount > 5 && state != nil && state.Energy > 0.6, ""
			},
		},
		{
			ID: TriggerShareThought, Priority: 7, Probability: 0.15,
			Cooldown: 120 * time.Second, PerPlayer: false,
			Condition: func(snap WorldSnapshot, state *InnerState, ctx *TriggerContext) (bool, string) {
				return state != nil && state.Thought != "" && state.SocialDesire > 0.5, ""
			},
		},
	}
}

// EvaluateTriggers evaluates triggers in priority order. Returns the first trigger that fires, or nil.
func EvaluateTriggers(triggers []Trigger, snapshot WorldSnapshot, state *InnerState, ctx *TriggerContext) (*Trigger, string) {
	// Inner state modulation: suppress all triggers when energy < 0.2 or socialDesire < 0.3
	if state != nil && (state.Energy < 0.2 || state.SocialDesire < 0.3) {
		return nil, ""
	}

	for i := range triggers {
		t := &triggers[i]
		shouldFire, targetID := t.Condition(snapshot, state, ctx)
		if !shouldFire {
			continue
		}
		if !ctx.CanFire(*t, targetID, snapshot) {
			continue
		}
		// Probability gate
		if rand.Float64() > t.Probability {
			continue
		}
		return t, targetID
	}
	return nil, ""
}
