package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/kkdai/youtube/v2"
	"github.com/raitonoberu/ytsearch"
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
	ytClient     *youtube.Client
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

	videoOnly := r.URL.Query().Get("videoOnly") == "true"
	cacheKey := videoID
	if videoOnly {
		cacheKey += ":video"
	}

	if cached, found := s.resolveCache.Get(cacheKey); found {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cached)
		return
	}

	video, err := s.ytClient.GetVideo(videoID)
	if err != nil {
		log.Printf("[resolve] Failed to get video %s: %v", videoID, err)
		http.Error(w, "Failed to resolve video", http.StatusInternalServerError)
		return
	}

	var selectedFormat *youtube.Format
	var quality string

	if videoOnly {
		for i := range video.Formats {
			f := &video.Formats[i]
			if f.AudioChannels == 0 && f.Height > 0 && f.Height <= 360 {
				if selectedFormat == nil || f.Height < selectedFormat.Height {
					selectedFormat = f
				}
			}
		}

		if selectedFormat == nil {
			for i := range video.Formats {
				f := &video.Formats[i]
				if f.AudioChannels == 0 && f.Height > 0 {
					if selectedFormat == nil || f.Height < selectedFormat.Height {
						selectedFormat = f
					}
				}
			}
		}

		quality = "video-only"
	} else {
		formats := video.Formats.WithAudioChannels()
		for i := range formats {
			f := &formats[i]
			if f.Height > 0 && f.Height <= 360 {
				if selectedFormat == nil || f.Height < selectedFormat.Height {
					selectedFormat = f
				}
			}
		}

		if selectedFormat == nil && len(formats) > 0 {
			selectedFormat = &formats[len(formats)-1]
		}

		quality = "combined"
	}

	if selectedFormat == nil {
		log.Printf("[resolve] No suitable format found for %s", videoID)
		http.Error(w, "No suitable format found", http.StatusNotFound)
		return
	}

	streamURL, err := s.ytClient.GetStreamURL(video, selectedFormat)
	if err != nil {
		log.Printf("[resolve] Failed to get stream URL for %s: %v", videoID, err)
		http.Error(w, "Failed to get stream URL", http.StatusInternalServerError)
		return
	}

	qualityLabel := quality
	if selectedFormat.Height > 0 {
		qualityLabel = strconv.Itoa(selectedFormat.Height) + "p " + quality
	}

	response := ResolveResponse{
		VideoID:     videoID,
		URL:         streamURL,
		ExpiresAtMs: parseExpiresFromURL(streamURL),
		ResolvedAt:  time.Now().UnixMilli(),
		VideoOnly:   videoOnly,
		Quality:     qualityLabel,
	}

	ttl := 50 * time.Second
	if response.ExpiresAtMs != nil {
		untilExpiry := time.Until(time.UnixMilli(*response.ExpiresAtMs))
		if untilExpiry > 2*time.Minute {
			ttl = untilExpiry - time.Minute
		}
	}

	s.resolveCache.Set(cacheKey, response, ttl)

	log.Printf("[resolve] %s -> %s", videoID, qualityLabel)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
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

	resolved, found := s.resolveCache.Get(cacheKey)
	if !found {
		video, err := s.ytClient.GetVideo(videoID)
		if err != nil {
			log.Printf("[proxy] Failed to get video %s: %v", videoID, err)
			http.Error(w, "Failed to resolve video", http.StatusInternalServerError)
			return
		}

		var selectedFormat *youtube.Format

		if videoOnly {
			for i := range video.Formats {
				f := &video.Formats[i]
				if f.AudioChannels == 0 && f.Height > 0 && f.Height <= 360 {
					if selectedFormat == nil || f.Height < selectedFormat.Height {
						selectedFormat = f
					}
				}
			}

			if selectedFormat == nil {
				for i := range video.Formats {
					f := &video.Formats[i]
					if f.AudioChannels == 0 && f.Height > 0 {
						if selectedFormat == nil || f.Height < selectedFormat.Height {
							selectedFormat = f
						}
					}
				}
			}
		} else {
			formats := video.Formats.WithAudioChannels()
			for i := range formats {
				f := &formats[i]
				if f.Height > 0 && f.Height <= 360 {
					if selectedFormat == nil || f.Height < selectedFormat.Height {
						selectedFormat = f
					}
				}
			}

			if selectedFormat == nil && len(formats) > 0 {
				selectedFormat = &formats[len(formats)-1]
			}
		}

		if selectedFormat == nil {
			http.Error(w, "No suitable format found", http.StatusNotFound)
			return
		}

		streamURL, err := s.ytClient.GetStreamURL(video, selectedFormat)
		if err != nil {
			http.Error(w, "Failed to get stream URL", http.StatusInternalServerError)
			return
		}

		resolved = ResolveResponse{
			VideoID:     videoID,
			URL:         streamURL,
			ExpiresAtMs: parseExpiresFromURL(streamURL),
			ResolvedAt:  time.Now().UnixMilli(),
			VideoOnly:   videoOnly,
		}

		ttl := 50 * time.Second
		if resolved.ExpiresAtMs != nil {
			untilExpiry := time.Until(time.UnixMilli(*resolved.ExpiresAtMs))
			if untilExpiry > 2*time.Minute {
				ttl = untilExpiry - time.Minute
			}
		}

		s.resolveCache.Set(cacheKey, resolved, ttl)
	}

	req, err := http.NewRequest("GET", resolved.URL, nil)
	if err != nil {
		http.Error(w, "Failed to create upstream request", http.StatusInternalServerError)
		return
	}

	if rangeHeader := r.Header.Get("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[proxy] Upstream request failed for %s: %v", videoID, err)
		http.Error(w, "Upstream request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}
	if cr := resp.Header.Get("Content-Range"); cr != "" {
		w.Header().Set("Content-Range", cr)
	}
	w.Header().Set("Accept-Ranges", "bytes")

	w.WriteHeader(resp.StatusCode)

	bytesWritten, err := io.Copy(w, resp.Body)
	if err != nil {
		log.Printf("[proxy] Stream copy error for %s after %d bytes: %v", videoID, bytesWritten, err)
	}
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

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	cacheTTLSeconds := 3600
	if ttlStr := os.Getenv("YOUTUBE_API_CACHE_TTL"); ttlStr != "" {
		if parsed, err := strconv.Atoi(ttlStr); err == nil && parsed > 0 {
			cacheTTLSeconds = parsed
		}
	}

	server := &Server{
		searchCache:  NewCache(time.Duration(cacheTTLSeconds) * time.Second),
		resolveCache: NewResolveCache(),
		ytClient:     &youtube.Client{},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /search", server.handleSearch)
	mux.HandleFunc("GET /resolve/{videoId}", server.handleResolve)
	mux.HandleFunc("GET /proxy/{videoId}", server.handleProxy)
	mux.HandleFunc("GET /health", server.handleHealth)

	handler := corsMiddleware(loggingMiddleware(mux))

	log.Printf("YouTube API service starting on port %s", port)
	log.Printf("Cache TTL: %d seconds", cacheTTLSeconds)

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
