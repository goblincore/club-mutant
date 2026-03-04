package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

// JobPriority determines queue ordering
type JobPriority int

const (
	PriorityNormal JobPriority = 0
	PriorityHigh   JobPriority = 1 // "next up" tracks
)

// JobStatus tracks the lifecycle of a prefetch job
type JobStatus string

const (
	StatusQueued     JobStatus = "queued"
	StatusInProgress JobStatus = "in_progress"
	StatusCompleted  JobStatus = "completed"
	StatusFailed     JobStatus = "failed"
)

// PrefetchJob represents a single prefetch work item
type PrefetchJob struct {
	VideoID   string      `json:"videoId"`
	Priority  JobPriority `json:"priority"`
	Status    JobStatus   `json:"status"`
	Attempts  int         `json:"attempts"`
	Error     string      `json:"error,omitempty"`
	CreatedAt time.Time   `json:"createdAt"`
	StartedAt *time.Time  `json:"startedAt,omitempty"`
	DoneAt    *time.Time  `json:"doneAt,omitempty"`
	NextRetry *time.Time  `json:"nextRetry,omitempty"`
}

// QueueStats exposes aggregate queue metrics
type QueueStats struct {
	QueueLength    int `json:"queueLength"`
	InFlight       int `json:"inFlight"`
	CompletedCount int `json:"completedCount"`
	FailedCount    int `json:"failedCount"`
	TotalEnqueued  int `json:"totalEnqueued"`
}

// PrefetchQueue manages an in-memory work queue with bounded workers
type PrefetchQueue struct {
	mu      sync.Mutex
	queue   []*PrefetchJob          // pending jobs (priority-ordered)
	active  map[string]*PrefetchJob // videoID -> job currently being processed
	history []*PrefetchJob          // completed/failed jobs (ring buffer)
	seen    map[string]struct{}     // dedup: videoIDs currently queued or active

	server   *Server
	workers  int
	maxRetry int
	notify   chan struct{} // signal to wake workers
	ctx      context.Context
	cancel   context.CancelFunc
	wg       sync.WaitGroup

	// Stats counters
	completedCount int
	failedCount    int
	totalEnqueued  int
}

const (
	DefaultWorkers   = 2
	DefaultMaxRetry  = 2
	MaxHistorySize   = 50
	RetryBaseDelay   = 5 * time.Second
	RetryMultiplier  = 3
)

// Dedicated semaphore for prefetch yt-dlp processes (separate from user-facing)
var prefetchSemaphore = make(chan struct{}, 1)

func NewPrefetchQueue(server *Server, workers int) *PrefetchQueue {
	ctx, cancel := context.WithCancel(context.Background())
	return &PrefetchQueue{
		queue:    make([]*PrefetchJob, 0),
		active:   make(map[string]*PrefetchJob),
		history:  make([]*PrefetchJob, 0, MaxHistorySize),
		seen:     make(map[string]struct{}),
		server:   server,
		workers:  workers,
		maxRetry: DefaultMaxRetry,
		notify:   make(chan struct{}, 1),
		ctx:      ctx,
		cancel:   cancel,
	}
}

func (pq *PrefetchQueue) Start() {
	for i := 0; i < pq.workers; i++ {
		pq.wg.Add(1)
		go pq.worker(i)
	}
	log.Printf("[prefetch-queue] Started %d workers", pq.workers)
}

func (pq *PrefetchQueue) Stop() {
	log.Printf("[prefetch-queue] Shutting down, draining in-flight jobs...")
	pq.cancel()
	pq.wg.Wait()
	log.Printf("[prefetch-queue] All workers stopped")
}

// Enqueue adds a video to the prefetch queue. Returns false if already
// queued, in-flight, or already cached.
func (pq *PrefetchQueue) Enqueue(videoID string, priority JobPriority) bool {
	cacheKey := videoID + ":video"

	// Skip if already in video cache (memory or disk)
	if _, found := pq.server.videoCache.Get(cacheKey); found {
		return false
	}
	if pq.server.diskCache != nil {
		if _, found := pq.server.diskCache.Get(cacheKey); found {
			return false
		}
	}

	pq.mu.Lock()
	defer pq.mu.Unlock()

	// Dedup: skip if already queued or in-flight
	if _, exists := pq.seen[videoID]; exists {
		return false
	}

	job := &PrefetchJob{
		VideoID:   videoID,
		Priority:  priority,
		Status:    StatusQueued,
		Attempts:  0,
		CreatedAt: time.Now(),
	}

	// Insert high-priority jobs before normal-priority ones
	inserted := false
	if priority == PriorityHigh {
		for i, existing := range pq.queue {
			if existing.Priority < priority {
				// Insert at position i
				pq.queue = append(pq.queue[:i+1], pq.queue[i:]...)
				pq.queue[i] = job
				inserted = true
				break
			}
		}
	}
	if !inserted {
		pq.queue = append(pq.queue, job)
	}

	pq.seen[videoID] = struct{}{}
	pq.totalEnqueued++

	// Non-blocking notify to wake a worker
	select {
	case pq.notify <- struct{}{}:
	default:
	}

	log.Printf("[prefetch-queue] Enqueued %s (priority=%d, queueLen=%d)", videoID, priority, len(pq.queue))
	return true
}

func (pq *PrefetchQueue) worker(id int) {
	defer pq.wg.Done()
	log.Printf("[prefetch-queue] Worker %d started", id)

	for {
		select {
		case <-pq.ctx.Done():
			log.Printf("[prefetch-queue] Worker %d shutting down", id)
			return
		case <-pq.notify:
		}

		for {
			if pq.ctx.Err() != nil {
				return
			}

			job := pq.dequeue()
			if job == nil {
				break
			}

			pq.processJob(id, job)
		}
	}
}

func (pq *PrefetchQueue) dequeue() *PrefetchJob {
	pq.mu.Lock()
	defer pq.mu.Unlock()

	now := time.Now()
	for i, job := range pq.queue {
		// Skip jobs that aren't ready for retry yet
		if job.NextRetry != nil && now.Before(*job.NextRetry) {
			continue
		}

		// Remove from queue, add to active
		pq.queue = append(pq.queue[:i], pq.queue[i+1:]...)
		job.Status = StatusInProgress
		startedAt := time.Now()
		job.StartedAt = &startedAt
		pq.active[job.VideoID] = job
		return job
	}
	return nil
}

func (pq *PrefetchQueue) processJob(workerID int, job *PrefetchJob) {
	log.Printf("[prefetch-queue] Worker %d processing %s (attempt %d/%d)",
		workerID, job.VideoID, job.Attempts+1, pq.maxRetry+1)

	job.Attempts++
	err := pq.doPrefetch(job.VideoID)

	pq.mu.Lock()
	defer pq.mu.Unlock()

	delete(pq.active, job.VideoID)

	if err == nil {
		now := time.Now()
		job.Status = StatusCompleted
		job.DoneAt = &now
		job.Error = ""
		pq.completedCount++
		delete(pq.seen, job.VideoID)
		pq.addToHistory(job)
		log.Printf("[prefetch-queue] Completed %s", job.VideoID)
	} else {
		job.Error = err.Error()
		if job.Attempts <= pq.maxRetry {
			// Re-queue with exponential backoff
			delay := RetryBaseDelay * time.Duration(intPow(RetryMultiplier, job.Attempts-1))
			retryAt := time.Now().Add(delay)
			job.NextRetry = &retryAt
			job.Status = StatusQueued
			pq.queue = append(pq.queue, job)
			log.Printf("[prefetch-queue] Retrying %s in %v (attempt %d/%d): %v",
				job.VideoID, delay, job.Attempts, pq.maxRetry+1, err)

			// Schedule a wake-up after the retry delay
			go func() {
				time.Sleep(delay)
				select {
				case pq.notify <- struct{}{}:
				default:
				}
			}()
		} else {
			now := time.Now()
			job.Status = StatusFailed
			job.DoneAt = &now
			pq.failedCount++
			delete(pq.seen, job.VideoID)
			pq.addToHistory(job)
			log.Printf("[prefetch-queue] Failed %s after %d attempts: %v",
				job.VideoID, job.Attempts, err)
		}
	}
}

// doPrefetch resolves a video via yt-dlp and caches the bytes.
// Uses a dedicated prefetch semaphore (separate from user-facing requests).
func (pq *PrefetchQueue) doPrefetch(videoID string) error {
	cacheKey := videoID + ":video"

	// Resolve via singleflight. Pass the dedicated prefetch semaphore so we
	// don't compete with user-facing /resolve and /proxy for yt-dlp slots.
	result, err, _ := resolveGroup.Do("prefetch:"+cacheKey, func() (interface{}, error) {
		return pq.server.resolveWithYtDlpInternal(videoID, true, false, false, prefetchSemaphore)
	})
	if err != nil {
		return fmt.Errorf("resolve failed: %w", err)
	}

	resolved := result.(*ResolveResponse)
	pq.server.resolveCache.Set(cacheKey, *resolved, 5*time.Minute)

	// Fetch video bytes
	req, err := http.NewRequest("GET", resolved.URL, nil)
	if err != nil {
		return fmt.Errorf("request creation failed: %w", err)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Origin", "https://www.youtube.com")
	req.Header.Set("Referer", "https://www.youtube.com/")

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, MaxCacheableVideoSize))
	if err != nil {
		return fmt.Errorf("read failed: %w", err)
	}

	// Cache in memory
	pq.server.videoCache.Set(cacheKey, data)

	// Cache on disk
	if pq.server.diskCache != nil {
		pq.server.diskCache.Set(cacheKey, data)
	}

	log.Printf("[prefetch-queue] Cached %s (%d bytes)", videoID, len(data))
	return nil
}

func (pq *PrefetchQueue) addToHistory(job *PrefetchJob) {
	if len(pq.history) >= MaxHistorySize {
		pq.history = pq.history[1:]
	}
	pq.history = append(pq.history, job)
}

func (pq *PrefetchQueue) Stats() QueueStats {
	pq.mu.Lock()
	defer pq.mu.Unlock()
	return QueueStats{
		QueueLength:    len(pq.queue),
		InFlight:       len(pq.active),
		CompletedCount: pq.completedCount,
		FailedCount:    pq.failedCount,
		TotalEnqueued:  pq.totalEnqueued,
	}
}

// Jobs returns a snapshot of all tracked jobs (queue + active + history)
func (pq *PrefetchQueue) Jobs() []*PrefetchJob {
	pq.mu.Lock()
	defer pq.mu.Unlock()

	result := make([]*PrefetchJob, 0, len(pq.queue)+len(pq.active)+len(pq.history))
	for _, j := range pq.active {
		result = append(result, j)
	}
	for _, j := range pq.queue {
		result = append(result, j)
	}
	for _, j := range pq.history {
		result = append(result, j)
	}
	return result
}

func intPow(base, exp int) int {
	result := 1
	for i := 0; i < exp; i++ {
		result *= base
	}
	return result
}
