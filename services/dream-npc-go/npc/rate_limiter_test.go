package npc

import (
	"sync"
	"sync/atomic"
	"testing"
)

func TestRateReservationIsAtomic(t *testing.T) {
	limiter := NewRateLimiter()
	var accepted atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if ok, _ := limiter.Check("same-player"); ok {
				accepted.Add(1)
			}
		}()
	}
	wg.Wait()
	if accepted.Load() != 6 {
		t.Fatalf("accepted %d requests, expected 6", accepted.Load())
	}
}
