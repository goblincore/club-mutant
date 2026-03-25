package npc

import (
	"fmt"
	"math"
	"time"
)

// Tier thresholds for advancement
var tierThresholds = map[RelationshipTier]struct {
	MinInteractions int
	MinAffinity     float64
}{
	TierAcquaintance: {3, 0.3},
	TierRegular:      {8, 0.6},
	TierFriend:       {15, 0.8},
	TierConfidant:    {25, 0.9},
}

// TierFloor returns the minimum affinity for a given tier (used for decay floor).
func TierFloor(tier RelationshipTier) float64 {
	switch tier {
	case TierAcquaintance:
		return 0.3
	case TierRegular:
		return 0.6
	case TierFriend:
		return 0.8
	case TierConfidant:
		return 0.9
	default:
		return 0.0
	}
}

// TierName returns a human-readable name for a relationship tier.
func TierName(tier RelationshipTier) string {
	switch tier {
	case TierStranger:
		return "Stranger"
	case TierAcquaintance:
		return "Acquaintance"
	case TierRegular:
		return "Regular"
	case TierFriend:
		return "Friend"
	case TierConfidant:
		return "Confidant"
	default:
		return "Unknown"
	}
}

// TierGuidance returns behavioral guidance for the NPC at a given tier.
func TierGuidance(tier RelationshipTier) string {
	switch tier {
	case TierStranger:
		return "Be polite and professional. Welcoming but boundaried."
	case TierAcquaintance:
		return "You can remember their name, ask follow-up questions, be slightly warmer."
	case TierRegular:
		return "You can share opinions freely, reference past conversations naturally, be relaxed and warm."
	case TierFriend:
		return "You can share personal stories, be vulnerable, ask for their opinion on things that matter to you."
	case TierConfidant:
		return "You can confide fears, ask for advice, drop the bartender persona somewhat. This person truly knows you."
	default:
		return ""
	}
}

// CheckTierAdvancement checks if a relationship should advance to the next tier.
// Only advances one tier at a time.
func CheckTierAdvancement(rel *Relationship) bool {
	nextTier := rel.Tier + 1
	threshold, ok := tierThresholds[nextTier]
	if !ok {
		return false // already at max tier
	}
	if rel.Interactions >= threshold.MinInteractions && rel.Affinity >= threshold.MinAffinity {
		rel.Tier = nextTier
		return true
	}
	return false
}

// ApplyAffinityDecay decays affinity for stale relationships.
// If the player hasn't visited in 14+ days, affinity decays by 0.02/day.
// The floor is the minimum affinity for the current tier.
func ApplyAffinityDecay(rel *Relationship) {
	daysSinceLastSeen := time.Since(rel.LastSeen).Hours() / 24
	if daysSinceLastSeen < 14 {
		return
	}

	decayDays := daysSinceLastSeen - 14
	decay := decayDays * 0.02
	floor := TierFloor(rel.Tier)
	rel.Affinity = math.Max(floor, rel.Affinity-decay)
}

// FormatRelationshipForPrompt formats a relationship for injection into chat prompts.
func FormatRelationshipForPrompt(rel *Relationship) string {
	if rel == nil || rel.Tier == TierStranger {
		return ""
	}
	result := fmt.Sprintf("RELATIONSHIP WITH THIS PERSON:\nTier: %s (%d conversations, affinity %.2f)",
		TierName(rel.Tier), rel.Interactions, rel.Affinity)
	if rel.Notes != "" {
		result += fmt.Sprintf("\nYour notes: %q", rel.Notes)
	}
	result += fmt.Sprintf("\nGuidance: %s", TierGuidance(rel.Tier))
	return result
}
