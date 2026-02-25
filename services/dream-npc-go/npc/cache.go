package npc

import (
	"strings"
	"sync"
	"time"
	"unicode"
)

type CacheEntry struct {
	Text      string
	Behavior  string
	ExpiresAt int64
}

type LRUCache struct {
	mu      sync.Mutex
	entries map[string]CacheEntry
	maxSize int
	ttlMs   int64
}

func NewCache(maxSize int, ttlMs int64) *LRUCache {
	return &LRUCache{
		entries: make(map[string]CacheEntry),
		maxSize: maxSize,
		ttlMs:   ttlMs,
	}
}

func (c *LRUCache) Get(key string) (CacheEntry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry, ok := c.entries[key]
	if !ok {
		return CacheEntry{}, false
	}

	if time.Now().UnixMilli() > entry.ExpiresAt {
		delete(c.entries, key)
		return CacheEntry{}, false
	}

	return entry, true
}

func (c *LRUCache) Set(key string, text string, behavior string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// LRU eviction (simple random eviction for simplicity if max size reached)
	if len(c.entries) >= c.maxSize {
		for k := range c.entries {
			delete(c.entries, k)
			break
		}
	}

	c.entries[key] = CacheEntry{
		Text:      text,
		Behavior:  behavior,
		ExpiresAt: time.Now().UnixMilli() + c.ttlMs,
	}
}

func GetCacheKey(personalityID, message string) string {
	var sb strings.Builder
	for _, r := range message {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsSpace(r) {
			sb.WriteRune(unicode.ToLower(r))
		}
	}
	normalized := strings.Join(strings.Fields(sb.String()), " ")
	return personalityID + "::" + normalized
}
