package npc

import (
	"sync"
	"time"
)

type RateWindow struct {
	Count   int
	ResetAt int64
}

type RateLimits struct {
	Minute RateWindow
	Hour   RateWindow
	Day    RateWindow
}

type RateLimiter struct {
	mu          sync.Mutex
	sessions    map[string]*RateLimits
	global      *RateLimits
	limitSessM  int
	limitSessH  int
	limitSessD  int
	limitGlobM  int
	limitGlobH  int
	limitGlobD  int
}

func NewRateLimiter() *RateLimiter {
	return &RateLimiter{
		sessions:   make(map[string]*RateLimits),
		global:     &RateLimits{},
		limitSessM: 6,
		limitSessH: 60,
		limitSessD: 200,
		limitGlobM: 30,
		limitGlobH: 500,
		limitGlobD: 5000,
	}
}

func (rl *RateLimiter) Check(sessionKey string) (bool, int64) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now().UnixMilli()
	
	// Global limits
	if ok, retry := checkWindow(&rl.global.Minute, rl.limitGlobM, 60_000, now); !ok {
		return false, retry
	}
	if ok, retry := checkWindow(&rl.global.Hour, rl.limitGlobH, 3600_000, now); !ok {
		return false, retry
	}
	if ok, retry := checkWindow(&rl.global.Day, rl.limitGlobD, 86400_000, now); !ok {
		return false, retry
	}

	// Session limits
	sess, exists := rl.sessions[sessionKey]
	if !exists {
		sess = &RateLimits{
			Minute: RateWindow{ResetAt: now + 60_000},
			Hour:   RateWindow{ResetAt: now + 3600_000},
			Day:    RateWindow{ResetAt: now + 86400_000},
		}
		rl.sessions[sessionKey] = sess
	}

	if ok, retry := checkWindow(&sess.Minute, rl.limitSessM, 60_000, now); !ok {
		return false, retry
	}
	if ok, retry := checkWindow(&sess.Hour, rl.limitSessH, 3600_000, now); !ok {
		return false, retry
	}
	if ok, retry := checkWindow(&sess.Day, rl.limitSessD, 86400_000, now); !ok {
		return false, retry
	}

	return true, 0
}

func (rl *RateLimiter) Record(sessionKey string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	rl.global.Minute.Count++
	rl.global.Hour.Count++
	rl.global.Day.Count++

	if sess, ok := rl.sessions[sessionKey]; ok {
		sess.Minute.Count++
		sess.Hour.Count++
		sess.Day.Count++
	}
}

func checkWindow(w *RateWindow, limit int, durationMs int64, now int64) (bool, int64) {
	if now > w.ResetAt {
		w.Count = 0
		w.ResetAt = now + durationMs
	}
	if w.Count >= limit {
		return false, w.ResetAt - now
	}
	return true, 0
}
