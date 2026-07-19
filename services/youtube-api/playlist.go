package main

// Public-playlist fetch via InnerTube browse (browseId "VL<playlistId>").
// Same hand-rolled approach as innertube.go search: no API key quota, no
// OAuth, direct connection (InnerTube does not need the residential proxy).
//
// Playlist markup (verified live 2026-07): items are lockupViewModel entries
// directly under itemSectionRenderer.contents, with an inline
// continuationItemRenderer after every ~100 items. Continuation requests
// only return items when the context carries the visitorData issued by the
// initial response. The legacy playlistVideoRenderer shape is still parsed
// as a fallback; unknown renderers are skipped silently and a zero-item page
// with a title is logged as a drift canary.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

const (
	innertubeBrowseURL = "https://www.youtube.com/youtubei/v1/browse?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
	// InnerTube pages are ~100 items; 6 requests caps a pathological playlist
	// at roughly maxPlaylistItems without hammering YouTube.
	maxPlaylistItems        = 500
	maxContinuationRequests = 6
	playlistCacheTTL        = 6 * time.Hour
)

var (
	errPlaylistNotFound = errors.New("playlist not found or private")
	playlistIDRegex     = regexp.MustCompile(`^[A-Za-z0-9_-]{10,64}$`)
	playlistGroup       singleflight.Group
)

type PlaylistItem struct {
	VideoID   string `json:"videoId"`
	Title     string `json:"title"`
	Duration  int    `json:"duration"` // seconds, 0 for live/unknown
	Thumbnail string `json:"thumbnail,omitempty"`
}

type PlaylistResponse struct {
	PlaylistID string         `json:"playlistId"`
	Title      string         `json:"title"`
	Items      []PlaylistItem `json:"items"`
	ItemCount  int            `json:"itemCount"`
	// DeclaredCount is the "N videos" total from the playlist header when
	// available (0 = unknown). Anonymous InnerTube sessions stop paginating
	// at ~200 items (2026 server-side cap), so ItemCount can be lower.
	DeclaredCount int   `json:"declaredCount"`
	Truncated     bool  `json:"truncated"`
	Cached        bool  `json:"cached"`
	CacheAt       int64 `json:"cacheAt,omitempty"`
}

// PlaylistCache mirrors the search Cache pattern (main.go) for
// PlaylistResponse values.
type PlaylistCache struct {
	mu      sync.RWMutex
	entries map[string]playlistCacheEntry
	ttl     time.Duration
}

type playlistCacheEntry struct {
	Response  PlaylistResponse
	ExpiresAt time.Time
}

func NewPlaylistCache(ttl time.Duration) *PlaylistCache {
	c := &PlaylistCache{
		entries: make(map[string]playlistCacheEntry),
		ttl:     ttl,
	}
	go c.cleanupLoop()
	return c
}

func (c *PlaylistCache) Get(key string) (PlaylistResponse, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	entry, exists := c.entries[key]
	if !exists || time.Now().After(entry.ExpiresAt) {
		return PlaylistResponse{}, false
	}
	return entry.Response, true
}

func (c *PlaylistCache) Set(key string, response PlaylistResponse) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key] = playlistCacheEntry{
		Response:  response,
		ExpiresAt: time.Now().Add(c.ttl),
	}
}

func (c *PlaylistCache) cleanupLoop() {
	ticker := time.NewTicker(30 * time.Minute)
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

// innertubeBrowse POSTs one browse request (initial or continuation) and
// decodes the response.
func innertubeBrowse(body map[string]interface{}) (map[string]interface{}, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, innertubeBrowseURL, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("User-Agent", innertubeUserAgent)

	resp, err := innertubeClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// InnerTube 400s on malformed/nonexistent browse IDs rather than
	// returning an alert.
	if resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusNotFound {
		return nil, errPlaylistNotFound
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("innertube browse returned status %d", resp.StatusCode)
	}

	var data map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("innertube browse decode failed: %w", err)
	}
	return data, nil
}

// innertubeBrowseContext builds the request context; visitorData must be
// echoed back on continuation requests or YouTube returns empty pages.
func innertubeBrowseContext(visitorData string) map[string]interface{} {
	client := map[string]interface{}{
		"clientName":       "WEB",
		"clientVersion":    innertubeClientVersion,
		"newVisitorCookie": true,
		"hl":               "en",
		"gl":               "US",
	}
	if visitorData != "" {
		client["visitorData"] = visitorData
	}
	return map[string]interface{}{
		"client": client,
		"user":   map[string]interface{}{"lockedSafetyMode": false},
	}
}

// playlistSectionItems flattens the initial browse response's sections into
// one renderer item list. Sections are itemSectionRenderer (whose contents
// hold the items, possibly wrapped in a legacy playlistVideoListRenderer)
// with continuationItemRenderer entries appearing either inline in the item
// list or as sibling sections; both feed the same collector.
func playlistSectionItems(data map[string]interface{}) []interface{} {
	tabs, _ := dig(data, "contents", "twoColumnBrowseResultsRenderer", "tabs").([]interface{})
	if len(tabs) == 0 {
		return nil
	}
	sections, _ := dig(tabs[0], "tabRenderer", "content", "sectionListRenderer", "contents").([]interface{})

	var flat []interface{}
	for _, section := range sections {
		if items, ok := dig(section, "itemSectionRenderer", "contents").([]interface{}); ok {
			if len(items) > 0 {
				if nested, ok := dig(items[0], "playlistVideoListRenderer", "contents").([]interface{}); ok {
					items = nested
				}
			}
			flat = append(flat, items...)
			continue
		}
		// Sibling continuation section (small playlists).
		flat = append(flat, section)
	}
	return flat
}

// innertubeBrowsePlaylist fetches a public playlist's title and items,
// following continuation tokens up to maxItems.
func innertubeBrowsePlaylist(playlistID string, maxItems int) (*PlaylistResponse, error) {
	data, err := innertubeBrowse(map[string]interface{}{
		"context":  innertubeBrowseContext(""),
		"browseId": "VL" + playlistID,
	})
	if err != nil {
		return nil, err
	}

	if playlistBrowseHasError(data) {
		return nil, errPlaylistNotFound
	}

	title := playlistTitle(data)
	visitorData, _ := dig(data, "responseContext", "visitorData").(string)

	resp := &PlaylistResponse{
		PlaylistID:    playlistID,
		Title:         title,
		DeclaredCount: playlistDeclaredCount(data),
	}
	seen := make(map[string]bool)
	token := collectPlaylistItems(playlistSectionItems(data), &resp.Items, seen, maxItems)

	if len(resp.Items) == 0 && token == "" && title == "" {
		return nil, errPlaylistNotFound
	}
	if len(resp.Items) == 0 && (title != "" || token != "") {
		log.Printf("[playlist] WARNING: zero items parsed for %s (title=%q, continuation=%v) — possible InnerTube markup drift", playlistID, title, token != "")
	}

	for requests := 1; token != "" && len(resp.Items) < maxItems && requests < maxContinuationRequests; requests++ {
		before := len(resp.Items)
		data, err := innertubeBrowse(map[string]interface{}{
			"context":      innertubeBrowseContext(visitorData),
			"continuation": token,
		})
		if err != nil {
			// Return what we have rather than failing a partially fetched list.
			log.Printf("[playlist] continuation %d failed for %s: %v", requests, playlistID, err)
			resp.Truncated = true
			break
		}

		token = ""
		actions, _ := dig(data, "onResponseReceivedActions").([]interface{})
		for _, action := range actions {
			if contItems, ok := dig(action, "appendContinuationItemsAction", "continuationItems").([]interface{}); ok {
				if t := collectPlaylistItems(contItems, &resp.Items, seen, maxItems); t != "" {
					token = t
				}
			}
		}
		log.Printf("[playlist] continuation %d for %s: %d actions, +%d items, next=%v", requests, playlistID, len(actions), len(resp.Items)-before, token != "")
		// A sentinel continuation that yields nothing means we're done.
		if len(resp.Items) == before && token == "" {
			break
		}
	}

	if token != "" || len(resp.Items) > maxItems {
		resp.Truncated = true
	}
	if len(resp.Items) > maxItems {
		resp.Items = resp.Items[:maxItems]
	}
	resp.ItemCount = len(resp.Items)
	if resp.DeclaredCount > resp.ItemCount {
		resp.Truncated = true
	}
	return resp, nil
}

// playlistDeclaredCount extracts the "N videos" total from the header
// metadata rows. Returns 0 when absent (e.g. channel-uploads playlists).
func playlistDeclaredCount(data map[string]interface{}) int {
	rows, _ := dig(data, "header", "pageHeaderRenderer", "content", "pageHeaderViewModel", "metadata", "contentMetadataViewModel", "metadataRows").([]interface{})
	for _, row := range rows {
		parts, _ := dig(row, "metadataParts").([]interface{})
		for _, part := range parts {
			text, ok := dig(part, "text", "content").(string)
			if !ok {
				continue
			}
			if n, ok := parseVideosCountText(text); ok {
				return n
			}
		}
	}
	// Legacy header shape.
	if n, ok := parseVideosCountText(textOf(dig(data, "header", "playlistHeaderRenderer", "numVideosText"))); ok {
		return n
	}
	return 0
}

// parseVideosCountText parses strings like "1,234 videos" / "200 videos" /
// "1 video". Returns (0, false) for anything else.
func parseVideosCountText(s string) (int, bool) {
	rest, found := strings.CutSuffix(s, " videos")
	if !found {
		rest, found = strings.CutSuffix(s, " video")
	}
	if !found {
		return 0, false
	}
	rest = strings.ReplaceAll(rest, ",", "")
	n, err := strconv.Atoi(rest)
	if err != nil || n < 0 {
		return 0, false
	}
	return n, true
}

// collectPlaylistItems walks a renderer list, appending playable entries to
// out (dedup by video ID) and returning any continuation token found.
// Handles the current lockupViewModel shape and the legacy
// playlistVideoRenderer shape; unknown renderer types are skipped.
func collectPlaylistItems(items []interface{}, out *[]PlaylistItem, seen map[string]bool, maxItems int) string {
	token := ""
	for _, it := range items {
		m, ok := it.(map[string]interface{})
		if !ok {
			continue
		}

		if cont, ok := m["continuationItemRenderer"].(map[string]interface{}); ok {
			// Some playlists carry TWO continuation renderers: a real one
			// inline in the item list and a sentinel as a sibling section
			// that returns nothing. First token wins (inline comes first).
			if t, ok := dig(cont, "continuationEndpoint", "continuationCommand", "token").(string); ok && token == "" {
				token = t
			}
			continue
		}

		var item PlaylistItem
		if lv, ok := m["lockupViewModel"].(map[string]interface{}); ok {
			item, ok = parseLockupViewModel(lv)
			if !ok {
				continue
			}
		} else if vr, ok := m["playlistVideoRenderer"].(map[string]interface{}); ok {
			item, ok = parsePlaylistVideoRenderer(vr)
			if !ok {
				continue
			}
		} else {
			continue
		}

		if len(*out) >= maxItems || seen[item.VideoID] {
			continue
		}
		seen[item.VideoID] = true
		*out = append(*out, item)
	}
	return token
}

// parseLockupViewModel extracts a playlist entry from the current (2026)
// lockup markup: contentId carries the video ID, the title lives at
// metadata.lockupMetadataViewModel.title.content, and the duration is a
// "3:45"-style thumbnail badge.
func parseLockupViewModel(lv map[string]interface{}) (PlaylistItem, bool) {
	if ct, ok := lv["contentType"].(string); ok && ct != "LOCKUP_CONTENT_TYPE_VIDEO" {
		return PlaylistItem{}, false
	}
	id, _ := lv["contentId"].(string)
	if id == "" {
		return PlaylistItem{}, false
	}

	item := PlaylistItem{VideoID: id}
	if t, ok := dig(lv, "metadata", "lockupMetadataViewModel", "title", "content").(string); ok {
		item.Title = t
	}

	thumbVM := dig(lv, "contentImage", "thumbnailViewModel")
	if sources, ok := dig(thumbVM, "image", "sources").([]interface{}); ok && len(sources) > 0 {
		if s0, ok := sources[0].(map[string]interface{}); ok {
			item.Thumbnail, _ = s0["url"].(string)
		}
	}
	// Duration badge: overlays[].thumbnailBottomOverlayViewModel.badges[]
	// .thumbnailBadgeViewModel.text — "1:30" for videos, "LIVE" etc. parse
	// to 0 via parseDurationText.
	if overlays, ok := dig(thumbVM, "overlays").([]interface{}); ok {
		for _, overlay := range overlays {
			badges, ok := dig(overlay, "thumbnailBottomOverlayViewModel", "badges").([]interface{})
			if !ok {
				continue
			}
			for _, badge := range badges {
				if text, ok := dig(badge, "thumbnailBadgeViewModel", "text").(string); ok {
					if d := parseDurationText(text); d > 0 {
						item.Duration = d
					}
				}
			}
		}
	}

	return item, true
}

// parsePlaylistVideoRenderer extracts a playlist entry from the legacy
// markup. Deleted/private/region-locked entries carry isPlayable: false.
func parsePlaylistVideoRenderer(vr map[string]interface{}) (PlaylistItem, bool) {
	id, _ := vr["videoId"].(string)
	if id == "" {
		return PlaylistItem{}, false
	}
	if playable, ok := vr["isPlayable"].(bool); ok && !playable {
		return PlaylistItem{}, false
	}

	item := PlaylistItem{
		VideoID: id,
		Title:   textOf(vr["title"]),
	}
	// lengthSeconds is a STRING in playlistVideoRenderer; absent for live.
	if ls, ok := vr["lengthSeconds"].(string); ok {
		if n, err := strconv.Atoi(ls); err == nil {
			item.Duration = n
		}
	}
	if thumbs, ok := dig(vr, "thumbnail", "thumbnails").([]interface{}); ok && len(thumbs) > 0 {
		if t0, ok := thumbs[0].(map[string]interface{}); ok {
			item.Thumbnail, _ = t0["url"].(string)
		}
	}
	return item, true
}

func playlistTitle(data map[string]interface{}) string {
	if t, ok := dig(data, "metadata", "playlistMetadataRenderer", "title").(string); ok && t != "" {
		return t
	}
	if t := textOf(dig(data, "header", "playlistHeaderRenderer", "title")); t != "" {
		return t
	}
	if t, ok := dig(data, "microformat", "microformatDataRenderer", "title").(string); ok {
		return t
	}
	return ""
}

// playlistBrowseHasError reports whether the browse response carries an
// ERROR alert (nonexistent or private playlist).
func playlistBrowseHasError(data map[string]interface{}) bool {
	alerts, _ := data["alerts"].([]interface{})
	for _, a := range alerts {
		if t, ok := dig(a, "alertRenderer", "type").(string); ok && t == "ERROR" {
			return true
		}
	}
	return false
}

// validImportablePlaylistID rejects malformed IDs plus mixes (RD*) and
// private auth-required lists (WL, LL), which InnerTube cannot browse.
func validImportablePlaylistID(id string) bool {
	if !playlistIDRegex.MatchString(id) {
		return false
	}
	if id == "WL" || id == "LL" {
		return false
	}
	if len(id) >= 2 && id[:2] == "RD" {
		return false
	}
	return true
}

func (s *Server) handlePlaylist(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	// Same safety net as handleSearch: a parser bug must never abort the
	// connection.
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("[playlist] PANIC id='%s': %v\n%s", r.PathValue("playlistId"), rec, debug.Stack())
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "playlist fetch failed"})
		}
	}()

	playlistID := r.PathValue("playlistId")
	if !validImportablePlaylistID(playlistID) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid or unsupported playlist id (mixes and private lists cannot be imported)"})
		return
	}

	if cached, found := s.playlistCache.Get(playlistID); found {
		cached.Cached = true
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cached)
		log.Printf("[playlist] CACHE HIT id=%s duration=%v", playlistID, time.Since(start))
		return
	}

	result, err, shared := playlistGroup.Do(playlistID, func() (interface{}, error) {
		log.Printf("[playlist] CACHE MISS id=%s (fetching from YouTube)", playlistID)
		resp, err := innertubeBrowsePlaylist(playlistID, maxPlaylistItems)
		if err != nil {
			return nil, err
		}
		resp.CacheAt = time.Now().Unix()
		s.playlistCache.Set(playlistID, *resp)
		return *resp, nil
	})
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		if errors.Is(err, errPlaylistNotFound) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "playlist not found or private"})
		} else {
			log.Printf("[playlist] ERROR id=%s: %v", playlistID, err)
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(map[string]string{"error": "playlist fetch failed"})
		}
		return
	}

	response := result.(PlaylistResponse)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
	log.Printf("[playlist] id=%s items=%d truncated=%v shared=%v duration=%v", playlistID, response.ItemCount, response.Truncated, shared, time.Since(start))
}
