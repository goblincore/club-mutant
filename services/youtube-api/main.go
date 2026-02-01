package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/raitonoberu/ytsearch"
	"golang.org/x/sync/singleflight"
)

type VideoResult struct {
	ID           string `json:"id"`
	Type         string `json:"type"`
	Title        string `json:"title"`
	ChannelTitle string `json:"channelTitle"`
	Duration     string `json:"duration"`
	IsLive       bool   `json:"isLive"`
	Thumbnail    string `json:"thumbnail"`
}

type SearchResponse struct {
	Items   []VideoResult `json:"items"`
	Query   string        `json:"query"`
	Cached  bool          `json:"cached"`
	CacheAt int64         `json:"cacheAt,omitempty"`
}

type CacheEntry struct {
	Response  SearchResponse
	ExpiresAt time.Time
}

type Cache struct {
	mu      sync.RWMutex
	entries map[string]CacheEntry
	ttl     time.Duration
}

func NewCache(ttl time.Duration) *Cache {
	c := &Cache{
		entries: make(map[string]CacheEntry),
		ttl:     ttl,
	}

	go c.cleanupLoop()

	return c
}

func (c *Cache) Get(key string) (SearchResponse, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, exists := c.entries[key]
	if !exists {
		return SearchResponse{}, false
	}

	if time.Now().After(entry.ExpiresAt) {
		return SearchResponse{}, false
	}

	return entry.Response, true
}

func (c *Cache) Set(key string, response SearchResponse) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.entries[key] = CacheEntry{
		Response:  response,
		ExpiresAt: time.Now().Add(c.ttl),
	}
}

func (c *Cache) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		c.mu.Lock()
		now := time.Now()
		for key, entry := range c.entries {
			if now.After(entry.ExpiresAt) {
				delete(c.entries, key)
			}
		}
		c.mu.Unlock()
	}
}

type ResolveResponse struct {
	VideoID     string `json:"videoId"`
	URL         string `json:"url"`
	ExpiresAtMs *int64 `json:"expiresAtMs"`
	ResolvedAt  int64  `json:"resolvedAtMs"`
	VideoOnly   bool   `json:"videoOnly"`
	Quality     string `json:"quality"`
}

type ResolveCache struct {
	mu      sync.RWMutex
	entries map[string]ResolveCacheEntry
}

type ResolveCacheEntry struct {
	Response  ResolveResponse
	ExpiresAt time.Time
}

func NewResolveCache() *ResolveCache {
	c := &ResolveCache{
		entries: make(map[string]ResolveCacheEntry),
	}

	go c.cleanupLoop()

	return c
}

func (c *ResolveCache) Get(key string) (ResolveResponse, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, exists := c.entries[key]
	if !exists {
		return ResolveResponse{}, false
	}

	if time.Now().After(entry.ExpiresAt) {
		return ResolveResponse{}, false
	}

	return entry.Response, true
}

func (c *ResolveCache) Set(key string, response ResolveResponse, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.entries[key] = ResolveCacheEntry{
		Response:  response,
		ExpiresAt: time.Now().Add(ttl),
	}
}

func (c *ResolveCache) cleanupLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	for range ticker.C {
		c.mu.Lock()
		now := time.Now()
		for key, entry := range c.entries {
			if now.After(entry.ExpiresAt) {
				delete(c.entries, key)
			}
		}
		c.mu.Unlock()
	}
}

type Server struct {
	searchCache  *Cache
	resolveCache *ResolveCache
	videoCache   *VideoCache
}

// Shared HTTP client with connection pooling
var httpClient = &http.Client{
	Transport: &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	},
}

// VideoCache stores video bytes in memory with LRU eviction
type VideoCache struct {
	mu        sync.RWMutex
	entries   map[string]*VideoCacheEntry
	maxSize   int64
	curSize   int64
	lruOrder  []string
}

type VideoCacheEntry struct {
	data      []byte
	expiresAt time.Time
	size      int64
}

const DefaultVideoCacheMaxSize = 100 * 1024 * 1024 // 100MB

func NewVideoCache(maxSize int64) *VideoCache {
	vc := &VideoCache{
		entries:  make(map[string]*VideoCacheEntry),
		maxSize:  maxSize,
		lruOrder: make([]string, 0),
	}

	go vc.cleanupLoop()

	return vc
}

func (vc *VideoCache) Get(key string) ([]byte, bool) {
	vc.mu.Lock()
	defer vc.mu.Unlock()

	entry, exists := vc.entries[key]
	if !exists {
		return nil, false
	}

	if time.Now().After(entry.expiresAt) {
		vc.removeEntryLocked(key)
		return nil, false
	}

	// Move to end of LRU (most recently used)
	vc.touchLocked(key)

	return entry.data, true
}

func (vc *VideoCache) Set(key string, data []byte, ttl time.Duration) {
	vc.mu.Lock()
	defer vc.mu.Unlock()

	size := int64(len(data))

	// Don't cache if single item exceeds max size
	if size > vc.maxSize {
		return
	}

	// Remove existing entry if present
	if existing, exists := vc.entries[key]; exists {
		vc.curSize -= existing.size
		vc.removeFromLRULocked(key)
	}

	// Evict LRU entries until we have space
	for vc.curSize+size > vc.maxSize && len(vc.lruOrder) > 0 {
		oldest := vc.lruOrder[0]
		vc.removeEntryLocked(oldest)
	}

	vc.entries[key] = &VideoCacheEntry{
		data:      data,
		expiresAt: time.Now().Add(ttl),
		size:      size,
	}
	vc.curSize += size
	vc.lruOrder = append(vc.lruOrder, key)

	log.Printf("[video-cache] Cached %s (%d bytes, total: %d/%d MB)", key, size, vc.curSize/(1024*1024), vc.maxSize/(1024*1024))
}

func (vc *VideoCache) removeEntryLocked(key string) {
	if entry, exists := vc.entries[key]; exists {
		vc.curSize -= entry.size
		delete(vc.entries, key)
		vc.removeFromLRULocked(key)
		log.Printf("[video-cache] Evicted %s", key)
	}
}

func (vc *VideoCache) removeFromLRULocked(key string) {
	for i, k := range vc.lruOrder {
		if k == key {
			vc.lruOrder = append(vc.lruOrder[:i], vc.lruOrder[i+1:]...)
			break
		}
	}
}

func (vc *VideoCache) touchLocked(key string) {
	vc.removeFromLRULocked(key)
	vc.lruOrder = append(vc.lruOrder, key)
}

func (vc *VideoCache) cleanupLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	for range ticker.C {
		vc.mu.Lock()
		now := time.Now()
		for key, entry := range vc.entries {
			if now.After(entry.expiresAt) {
				vc.removeEntryLocked(key)
			}
		}
		vc.mu.Unlock()
	}
}

func (vc *VideoCache) Stats() (entries int, size int64, maxSize int64) {
	vc.mu.RLock()
	defer vc.mu.RUnlock()
	return len(vc.entries), vc.curSize, vc.maxSize
}

var videoIDRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{11}$`)

func isValidVideoID(id string) bool {
	return videoIDRegex.MatchString(id)
}

func parseExpiresFromURL(rawURL string) *int64 {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil
	}

	expireStr := parsed.Query().Get("expire")
	if expireStr == "" {
		return nil
	}

	expireSec, err := strconv.ParseInt(expireStr, 10, 64)
	if err != nil {
		return nil
	}

	expireMs := expireSec * 1000
	return &expireMs
}

func detectQualityFromURL(rawURL string, videoOnly bool) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "unknown"
	}

	itag := parsed.Query().Get("itag")

	// Common YouTube itag -> resolution mapping
	itagResolutions := map[string]string{
		"17":  "144p",
		"160": "144p",
		"278": "144p",
		"36":  "240p",
		"133": "240p",
		"242": "240p",
		"18":  "360p",
		"134": "360p",
		"243": "360p",
		"22":  "720p",
		"135": "480p",
		"136": "720p",
		"137": "1080p",
	}

	resolution := "unknown"
	if res, ok := itagResolutions[itag]; ok {
		resolution = res
	}

	if videoOnly {
		return resolution + " video-only"
	}
	return resolution + " combined"
}

const cookiesFilePath = "/tmp/youtube_cookies.txt"

// Semaphore to limit concurrent yt-dlp processes (prevents OOM)
var ytdlpSemaphore = make(chan struct{}, 2)

// Singleflight to coalesce duplicate requests for the same video
var resolveGroup singleflight.Group

// initCookiesFile writes YouTube cookies from env var to a file (called once at startup)
func initCookiesFile() {
	cookies := os.Getenv("YOUTUBE_COOKIES")
	if cookies == "" {
		log.Println("[cookies] No YOUTUBE_COOKIES env var set, age-restricted videos may fail")
		return
	}

	if err := os.WriteFile(cookiesFilePath, []byte(cookies), 0600); err != nil {
		log.Printf("[cookies] Failed to write cookies file: %v", err)
		return
	}

	log.Println("[cookies] YouTube cookies file initialized")
}

// isBotDetectionError checks if the error indicates YouTube bot detection
func isBotDetectionError(stderr string) bool {
	botIndicators := []string{
		"Sign in to confirm you're not a bot",
		"bot detection",
		"Please sign in",
		"HTTP Error 403",
		"confirmed your age",
	}
	stderrLower := strings.ToLower(stderr)
	for _, indicator := range botIndicators {
		if strings.Contains(stderrLower, strings.ToLower(indicator)) {
			return true
		}
	}
	return false
}

// resolveWithYtDlp calls yt-dlp - tries without PO token first, retries with PO on bot detection
func (s *Server) resolveWithYtDlp(videoID string, videoOnly bool) (*ResolveResponse, error) {
	// Try without PO token first (faster for videos that don't need it)
	result, err := s.resolveWithYtDlpInternal(videoID, videoOnly, false)
	if err == nil {
		return result, nil
	}

	// Check if it's a bot detection error - if so, retry with PO token
	log.Printf("[yt-dlp] First attempt failed for %s, retrying with PO token", videoID)
	return s.resolveWithYtDlpInternal(videoID, videoOnly, true)
}

// resolveWithYtDlpInternal is the actual yt-dlp call with optional PO token support
func (s *Server) resolveWithYtDlpInternal(videoID string, videoOnly bool, usePOToken bool) (*ResolveResponse, error) {
	// Acquire semaphore to limit concurrent yt-dlp processes
	ytdlpSemaphore <- struct{}{}
	defer func() { <-ytdlpSemaphore }()

	ytURL := "https://www.youtube.com/watch?v=" + videoID

	// Prefer lowest resolution for smallest file size
	// - Use 'bv' (best video) for video-only streams, 'best' for combined streams
	// - 144p video-only is ~1.5MB for a 3min video
	formatArg := "best[height<=144][ext=mp4]/best[height<=240][ext=mp4]/best[height<=360][ext=mp4]/best[ext=mp4]/best"
	if videoOnly {
		formatArg = "bv[height<=144][ext=mp4]/bv[height<=240][ext=mp4]/bv[height<=360][ext=mp4]/bv[ext=mp4]/bv"
	}

	args := []string{
		ytURL,
		"-f", formatArg,
		"-g",
		"--no-playlist",
		"--no-warnings",
		"--quiet",
		"--no-cache-dir",
	}

	// Only add PO token args if needed
	if usePOToken {
		potProviderURL := os.Getenv("POT_PROVIDER_URL")
		if potProviderURL == "" {
			potProviderURL = "http://club-mutant-pot-provider.internal:4416"
		}
		args = append(args,
			"--js-runtimes", "node",
			"--remote-components", "ejs:github",
			"--extractor-args", "youtubepot-bgutilhttp:base_url="+potProviderURL,
		)
	}

	// Add cookies if available
	if _, err := os.Stat(cookiesFilePath); err == nil {
		args = append(args, "--cookies", cookiesFilePath)
	}

	// Shorter timeout without PO (15s), longer with PO (60s)
	timeout := 15 * time.Second
	if usePOToken {
		timeout = 60 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "yt-dlp", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	startTime := time.Now()
	err := cmd.Run()
	elapsed := time.Since(startTime)

	poLabel := "without PO"
	if usePOToken {
		poLabel = "with PO"
	}

	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			log.Printf("[yt-dlp] TIMEOUT after %v for %s (%s)", elapsed, videoID, poLabel)
		} else {
			log.Printf("[yt-dlp] Failed for %s after %v (%s): %v, stderr: %s", videoID, elapsed, poLabel, err, stderr.String())
		}
		return nil, err
	}

	log.Printf("[yt-dlp] Completed %s in %v (%s)", videoID, elapsed, poLabel)

	resolvedURL := strings.TrimSpace(strings.Split(stdout.String(), "\n")[0])
	if resolvedURL == "" {
		return nil, fmt.Errorf("yt-dlp returned empty URL")
	}

	// Detect resolution from URL parameters (itag) or default
	qualityLabel := detectQualityFromURL(resolvedURL, videoOnly)
	log.Printf("[yt-dlp] Resolved %s -> %s", videoID, qualityLabel)

	return &ResolveResponse{
		VideoID:     videoID,
		URL:         resolvedURL,
		ExpiresAtMs: parseExpiresFromURL(resolvedURL),
		ResolvedAt:  time.Now().UnixMilli(),
		VideoOnly:   videoOnly,
		Quality:     qualityLabel,
	}, nil
}

func (s *Server) handleResolve(w http.ResponseWriter, r *http.Request) {
	videoID := r.PathValue("videoId")
	if videoID == "" {
		videoID = strings.TrimPrefix(r.URL.Path, "/resolve/")
	}
	videoID = strings.TrimSpace(videoID)

	if !isValidVideoID(videoID) {
		http.Error(w, "Invalid video ID", http.StatusBadRequest)
		return
	}

	videoOnly := r.URL.Query().Get("videoOnly") != "false"
	cacheKey := videoID
	if videoOnly {
		cacheKey += ":video"
	}

	if cached, found := s.resolveCache.Get(cacheKey); found {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cached)
		return
	}

	// Use singleflight to coalesce duplicate requests for the same video
	result, err, shared := resolveGroup.Do(cacheKey, func() (interface{}, error) {
		log.Printf("[resolve] Resolving %s via yt-dlp (videoOnly=%v)", videoID, videoOnly)
		return s.resolveWithYtDlp(videoID, videoOnly)
	})

	if shared {
		log.Printf("[resolve] Request for %s was coalesced with another in-flight request", videoID)
	}

	if err != nil {
		log.Printf("[resolve] yt-dlp failed for %s: %v", videoID, err)
		http.Error(w, "Failed to resolve video", http.StatusInternalServerError)
		return
	}

	resolved := result.(*ResolveResponse)
	s.resolveCache.Set(cacheKey, *resolved, 5*time.Minute)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resolved)
}

func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
	videoID := r.PathValue("videoId")
	if videoID == "" {
		videoID = strings.TrimPrefix(r.URL.Path, "/proxy/")
	}
	videoID = strings.TrimSpace(videoID)

	if !isValidVideoID(videoID) {
		http.Error(w, "Invalid video ID", http.StatusBadRequest)
		return
	}

	videoOnly := r.URL.Query().Get("videoOnly") != "false"
	cacheKey := videoID
	if videoOnly {
		cacheKey += ":video"
	}

	rangeHeader := r.Header.Get("Range")

	// Check video byte cache first (only for non-range requests or initial request)
	if rangeHeader == "" || rangeHeader == "bytes=0-" {
		if cachedData, found := s.videoCache.Get(cacheKey); found {
			log.Printf("[proxy] Video cache hit for %s (%d bytes)", videoID, len(cachedData))
			w.Header().Set("Content-Type", "video/mp4")
			w.Header().Set("Content-Length", strconv.Itoa(len(cachedData)))
			w.Header().Set("Accept-Ranges", "bytes")
			w.Header().Set("Cache-Control", "no-cache")
			w.WriteHeader(http.StatusOK)
			w.Write(cachedData)
			return
		}
	}

	resolved, found := s.resolveCache.Get(cacheKey)
	if !found {
		// Use singleflight to coalesce duplicate requests
		result, err, _ := resolveGroup.Do(cacheKey, func() (interface{}, error) {
			log.Printf("[proxy] Resolving %s via yt-dlp (videoOnly=%v)", videoID, videoOnly)
			return s.resolveWithYtDlp(videoID, videoOnly)
		})

		if err != nil {
			log.Printf("[proxy] yt-dlp failed for %s: %v", videoID, err)
			http.Error(w, "Failed to resolve video", http.StatusInternalServerError)
			return
		}

		ytdlpResolved := result.(*ResolveResponse)
		s.resolveCache.Set(cacheKey, *ytdlpResolved, 5*time.Minute)
		resolved = *ytdlpResolved
	}

	req, err := http.NewRequest("GET", resolved.URL, nil)
	if err != nil {
		http.Error(w, "Failed to create upstream request", http.StatusInternalServerError)
		return
	}

	if rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}

	// Use shared client with connection pooling for better performance
	resp, err := httpClient.Do(req)
	if err != nil {
		log.Printf("[proxy] Upstream request failed for %s: %v", videoID, err)
		http.Error(w, "Upstream request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	log.Printf("[proxy] Upstream response for %s: status=%d, content-length=%s", videoID, resp.StatusCode, resp.Header.Get("Content-Length"))

	// If YouTube returns an error, log it and pass through
	if resp.StatusCode >= 400 {
		log.Printf("[proxy] YouTube returned error %d for %s", resp.StatusCode, videoID)
	}

	// Set content type - default to video/mp4 if not provided
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "video/mp4"
	}
	w.Header().Set("Content-Type", contentType)

	if cl := resp.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}
	if cr := resp.Header.Get("Content-Range"); cr != "" {
		w.Header().Set("Content-Range", cr)
	}
	w.Header().Set("Accept-Ranges", "bytes")

	// Safari needs these for proper video handling
	w.Header().Set("Cache-Control", "no-cache")

	w.WriteHeader(resp.StatusCode)

	// For non-range requests, try to cache the video bytes
	shouldCache := rangeHeader == "" && resp.StatusCode == http.StatusOK
	var videoData []byte
	if shouldCache {
		videoData = make([]byte, 0, 5*1024*1024) // Pre-allocate 5MB
	}

	// Use a larger buffer for more efficient streaming (128KB)
	buf := make([]byte, 128*1024)
	bytesWritten := int64(0)

	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			_, writeErr := w.Write(buf[:n])
			if writeErr != nil {
				log.Printf("[proxy] Write error for %s after %d bytes: %v", videoID, bytesWritten, writeErr)
				break
			}
			bytesWritten += int64(n)

			// Accumulate data for caching (limit to 10MB to avoid memory issues)
			if shouldCache && len(videoData)+n <= 10*1024*1024 {
				videoData = append(videoData, buf[:n]...)
			}
		}

		if readErr != nil {
			if readErr != io.EOF {
				log.Printf("[proxy] Read error for %s after %d bytes: %v", videoID, bytesWritten, readErr)
			}
			break
		}
	}

	log.Printf("[proxy] Streamed %d bytes for %s", bytesWritten, videoID)

	// Cache the video if we got a full response
	if shouldCache && len(videoData) > 0 && len(videoData) <= 10*1024*1024 {
		s.videoCache.Set(cacheKey, videoData, 5*time.Minute)
	}
}

// handlePrefetch pre-fetches and caches a video for faster subsequent access
func (s *Server) handlePrefetch(w http.ResponseWriter, r *http.Request) {
	videoID := r.PathValue("videoId")
	if videoID == "" {
		http.Error(w, "Missing video ID", http.StatusBadRequest)
		return
	}

	if !isValidVideoID(videoID) {
		http.Error(w, "Invalid video ID", http.StatusBadRequest)
		return
	}

	cacheKey := videoID + ":video"

	// Check if already cached
	if _, found := s.videoCache.Get(cacheKey); found {
		log.Printf("[prefetch] Already cached: %s", videoID)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "already_cached"})
		return
	}

	// Start prefetch in background
	go func() {
		log.Printf("[prefetch] Starting prefetch for %s", videoID)

		// Resolve the video URL
		result, err, _ := resolveGroup.Do(cacheKey, func() (interface{}, error) {
			return s.resolveWithYtDlp(videoID, true)
		})

		if err != nil {
			log.Printf("[prefetch] Resolve failed for %s: %v", videoID, err)
			return
		}

		resolved := result.(*ResolveResponse)
		s.resolveCache.Set(cacheKey, *resolved, 5*time.Minute)

		// Fetch the video bytes
		resp, err := http.Get(resolved.URL)
		if err != nil {
			log.Printf("[prefetch] Fetch failed for %s: %v", videoID, err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			log.Printf("[prefetch] Bad status for %s: %d", videoID, resp.StatusCode)
			return
		}

		// Read up to 10MB
		data, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
		if err != nil {
			log.Printf("[prefetch] Read failed for %s: %v", videoID, err)
			return
		}

		s.videoCache.Set(cacheKey, data, 5*time.Minute)
		log.Printf("[prefetch] Cached %s (%d bytes)", videoID, len(data))
	}()

	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"status": "prefetching"})
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "Missing query parameter 'q'", http.StatusBadRequest)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 10
	if limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 && parsed <= 50 {
			limit = parsed
		}
	}

	cacheKey := query + ":" + strconv.Itoa(limit)

	if cached, found := s.searchCache.Get(cacheKey); found {
		cached.Cached = true
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cached)
		return
	}

	search := ytsearch.VideoSearch(query)
	results, err := search.Next()
	if err != nil {
		log.Printf("Search error for query '%s': %v", query, err)
		http.Error(w, "Search failed", http.StatusInternalServerError)
		return
	}

	items := make([]VideoResult, 0, limit)
	for i, video := range results.Videos {
		if i >= limit {
			break
		}

		thumbnail := ""
		if len(video.Thumbnails) > 0 {
			thumbnail = video.Thumbnails[0].URL
		}

		items = append(items, VideoResult{
			ID:           video.ID,
			Type:         "video",
			Title:        video.Title,
			ChannelTitle: video.Channel.Title,
			Duration:     formatDuration(video.Duration),
			IsLive:       video.Duration == 0,
			Thumbnail:    thumbnail,
		})
	}

	response := SearchResponse{
		Items:   items,
		Query:   query,
		Cached:  false,
		CacheAt: time.Now().Unix(),
	}

	s.searchCache.Set(cacheKey, response)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// prewarmPOToken warms up the PO token provider cache by making a request
// This is done in the background on startup to reduce first-request latency
func prewarmPOToken() {
	potProviderURL := os.Getenv("POT_PROVIDER_URL")
	if potProviderURL == "" {
		potProviderURL = "http://club-mutant-pot-provider.internal:4416"
	}

	// The provider caches tokens, so hitting it once warms the cache
	url := potProviderURL + "/pot?client=WEB"

	log.Printf("[prewarm] Warming up PO token provider at %s", potProviderURL)
	start := time.Now()

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		log.Printf("[prewarm] PO token provider unreachable: %v", err)
		return
	}
	defer resp.Body.Close()

	elapsed := time.Since(start)
	if resp.StatusCode == http.StatusOK {
		log.Printf("[prewarm] PO token provider warmed up in %v", elapsed)
	} else {
		log.Printf("[prewarm] PO token provider returned %d after %v", resp.StatusCode, elapsed)
	}
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	// Initialize cookies file from env var if set
	initCookiesFile()

	cacheTTLSeconds := 3600
	if ttlStr := os.Getenv("YOUTUBE_API_CACHE_TTL"); ttlStr != "" {
		if parsed, err := strconv.Atoi(ttlStr); err == nil && parsed > 0 {
			cacheTTLSeconds = parsed
		}
	}

	var videoCacheSize int64 = DefaultVideoCacheMaxSize
	if sizeStr := os.Getenv("VIDEO_CACHE_SIZE_MB"); sizeStr != "" {
		if parsed, err := strconv.Atoi(sizeStr); err == nil && parsed > 0 {
			videoCacheSize = int64(parsed) * 1024 * 1024
		}
	}

	server := &Server{
		searchCache:  NewCache(time.Duration(cacheTTLSeconds) * time.Second),
		resolveCache: NewResolveCache(),
		videoCache:   NewVideoCache(videoCacheSize),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /search", server.handleSearch)
	mux.HandleFunc("GET /resolve/{videoId}", server.handleResolve)
	mux.HandleFunc("GET /proxy/{videoId}", server.handleProxy)
	mux.HandleFunc("POST /prefetch/{videoId}", server.handlePrefetch)
	mux.HandleFunc("GET /health", server.handleHealth)

	handler := corsMiddleware(loggingMiddleware(mux))

	log.Printf("YouTube API service starting on port %s", port)
	log.Printf("Cache TTL: %d seconds", cacheTTLSeconds)

	// Pre-warm PO token cache in background
	go prewarmPOToken()

	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func formatDuration(seconds int) string {
	if seconds == 0 {
		return "LIVE"
	}

	hours := seconds / 3600
	minutes := (seconds % 3600) / 60
	secs := seconds % 60

	if hours > 0 {
		return strconv.Itoa(hours) + ":" + padZero(minutes) + ":" + padZero(secs)
	}

	return strconv.Itoa(minutes) + ":" + padZero(secs)
}

func padZero(n int) string {
	if n < 10 {
		return "0" + strconv.Itoa(n)
	}

	return strconv.Itoa(n)
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
