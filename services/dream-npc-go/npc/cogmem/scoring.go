package cogmem

import (
	"math"
	"time"
)

// --- Composite scoring ---

// CompositeScore computes the CaviraOSS-inspired blended relevance score.
//
//	composite = (0.6×similarity + 0.2×salience + 0.1×recency + 0.1×linkWeight) × sectorWeight
func CompositeScore(similarity, salience, daysSinceAccess, linkWeight, sectorWeight float64) float64 {
	recency := math.Exp(-0.02 * daysSinceAccess)
	raw := 0.6*similarity + 0.2*salience + 0.1*recency + 0.1*linkWeight
	return raw * sectorWeight
}

// --- Cosine similarity ---

// CosineSimilarity computes the cosine similarity between two float32 vectors.
// Returns 0 if either vector is zero-length or zero-norm.
func CosineSimilarity(a, b []float32) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}

	var dot, normA, normB float64
	for i := range a {
		ai, bi := float64(a[i]), float64(b[i])
		dot += ai * bi
		normA += ai * ai
		normB += bi * bi
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

// --- Decay ---

// DecayFactor computes the exponential decay multiplier for a memory.
//
//	decay = exp(-λ × days / (salience + 0.1))
//
// Higher salience dampens decay (important memories last longer).
func DecayFactor(lambda, daysSinceAccess, salience float64) float64 {
	return math.Exp(-lambda * daysSinceAccess / (salience + 0.1))
}

// DaysSince computes fractional days between a past time and now.
func DaysSince(t time.Time) float64 {
	return time.Since(t).Hours() / 24.0
}
