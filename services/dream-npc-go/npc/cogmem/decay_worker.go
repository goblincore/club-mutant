package cogmem

import (
	"context"
	"log"
	"time"
)

// startDecayWorker runs a background goroutine that periodically applies decay
// to all memories and prunes dead associations.
func (cm *CogMem) startDecayWorker(interval time.Duration) {
	ctx, cancel := context.WithCancel(context.Background())
	cm.cancelDecay = cancel

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				updated, deleted, err := cm.store.RunDecaySweep(cm.config.MinDecayScore)
				if err != nil {
					log.Printf("[cogmem] Decay sweep error: %v", err)
				} else if updated > 0 || deleted > 0 {
					log.Printf("[cogmem] Decay sweep: %d updated, %d deleted", updated, deleted)
				}
			case <-ctx.Done():
				return
			}
		}
	}()
}
