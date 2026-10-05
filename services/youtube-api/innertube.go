package main

// Minimal InnerTube search client, replacing github.com/raitonoberu/ytsearch.
//
// The ytsearch library panicked on famous-artist queries: its shelf parser
// did an unconditional `.([]interface{})` assuming every shelfRenderer holds
// a verticalListRenderer, but topical shelves use horizontalListRenderer.
// It also kept only the last itemSectionRenderer and dropped shelf videos.
//
// This client walks ALL sections, harvests videoRenderers from shelves of
// any orientation, and silently skips unknown renderer types
// (lockupViewModel, reelShelfRenderer, ads, ...) — no bare type assertions.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	innertubeSearchURL     = "https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
	innertubeClientVersion = "2.20240726.00.00"
	// "CAASAhAB" = relevance sort + type:video filter (same as ytsearch.VideoSearch)
	innertubeVideoParams = "CAASAhAB"
	innertubeUserAgent   = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

// Search goes direct (no PROXY_URL) — same as the old library did.
var innertubeClient = &http.Client{Timeout: 15 * time.Second}

// searchVideo is one parsed videoRenderer.
type searchVideo struct {
	ID              string
	Title           string
	Channel         string
	DurationSeconds int
	Thumbnail       string
	ViewCount       int
}

// innertubeSearch runs a video search and returns all videoRenderer results
// across every itemSectionRenderer section, including those nested in
// shelves, deduplicated by video ID in encounter order.
func innertubeSearch(query string) ([]searchVideo, error) {
	data, err := innertubeSearchPage(context.Background(), query, innertubeVideoParams, "")
	if err != nil {
		return nil, err
	}
	return parseSearchResponse(data), nil
}

func innertubeSearchPage(ctx context.Context, query, params, continuation string) (map[string]interface{}, error) {
	payload := map[string]interface{}{
		"context": map[string]interface{}{
			"client": map[string]interface{}{"clientName": "WEB", "clientVersion": innertubeClientVersion, "newVisitorCookie": true, "hl": "en", "gl": "US"},
			"user":   map[string]interface{}{"lockedSafetyMode": false},
		},
	}
	if continuation == "" {
		payload["query"] = query
		payload["params"] = params
	} else {
		payload["continuation"] = continuation
	}
	return innertubeRequest(ctx, innertubeSearchURL, payload)
}

func innertubeWatchInfo(ctx context.Context, id string) (map[string]interface{}, error) {
	payload := map[string]interface{}{"videoId": id, "context": map[string]interface{}{"client": map[string]interface{}{"clientName": "WEB", "clientVersion": innertubeClientVersion, "hl": "en", "gl": "US"}}}
	return innertubeRequest(ctx, "https://www.youtube.com/youtubei/v1/next", payload)
}

func innertubeRequest(ctx context.Context, endpoint string, payload map[string]interface{}) (map[string]interface{}, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
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
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("innertube search returned status %d", resp.StatusCode)
	}
	var data map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("innertube search decode failed: %w", err)
	}
	return data, nil
}

// Small-channel discovery searches both the archive and this month's uploads.
// Each lane scans at most three pages; the shared deadline bounds total work.
// Filtering happens BEFORE limiting, never substituting popular/unknown videos.
func innertubeSmallSearch(ctx context.Context, query string, maxViews, limit int) ([]searchVideo, error) {
	ctx, cancel := context.WithTimeout(ctx, 24*time.Second)
	defer cancel()
	params := []string{innertubeVideoParams, "CAASBAgEEAE="} // video + this month
	type laneResult struct {
		videos     []searchVideo
		err        error
		successful bool
	}
	lanes := make([]laneResult, len(params))
	var wg sync.WaitGroup
	for index, filter := range params {
		wg.Add(1)
		go func(i int, params string) {
			defer wg.Done()
			token := ""
			seenTokens := make(map[string]bool)
			for page := 0; page < 3; page++ {
				data, err := innertubeSearchPage(ctx, query, params, token)
				if err != nil {
					lanes[i].err = err
					break
				}
				lanes[i].successful = true
				videos := filterSmallVideos(parseSearchResponse(data), maxViews)
				lanes[i].videos = append(lanes[i].videos, videos...)
				if len(lanes[i].videos) >= limit {
					break
				}
				token = searchContinuation(data)
				if token == "" || seenTokens[token] {
					break
				}
				seenTokens[token] = true
			}
		}(index, filter)
	}
	wg.Wait()
	var videos []searchVideo
	successful := false
	var lastErr error
	for _, lane := range lanes {
		videos = append(videos, lane.videos...)
		successful = successful || lane.successful
		if lane.err != nil {
			lastErr = lane.err
		}
	}
	if !successful {
		return nil, lastErr
	}
	return filterSmallVideos(videos, maxViews), nil
}

func filterSmallVideos(videos []searchVideo, maxViews int) []searchVideo {
	result := make([]searchVideo, 0)
	seen := make(map[string]bool)
	for _, video := range videos {
		if video.ViewCount < 0 || video.ViewCount > maxViews || video.DurationSeconds == 0 || seen[video.ID] {
			continue
		}
		seen[video.ID] = true
		result = append(result, video)
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].ViewCount < result[j].ViewCount })
	return result
}

// Only section-list continuation tokens are used, never shelf/carousel tokens.
func searchContinuation(data map[string]interface{}) string {
	for _, items := range searchItemLists(data) {
		for _, item := range items {
			if token, ok := dig(item, "continuationItemRenderer", "continuationEndpoint", "continuationCommand", "token").(string); ok && token != "" {
				return token
			}
		}
	}
	return ""
}

func searchItemLists(data map[string]interface{}) [][]interface{} {
	sections, _ := dig(data, "contents", "twoColumnSearchResultsRenderer", "primaryContents", "sectionListRenderer", "contents").([]interface{})
	lists := [][]interface{}{sections}
	for _, key := range []string{"onResponseReceivedCommands", "onResponseReceivedActions"} {
		commands, _ := data[key].([]interface{})
		for _, command := range commands {
			if items, ok := dig(command, "appendContinuationItemsAction", "continuationItems").([]interface{}); ok {
				lists = append(lists, items)
			}
		}
	}
	return lists
}

// parseSearchResponse walks every itemSectionRenderer section of an
// InnerTube search response, collecting videoRenderer results (including
// those nested in shelves), deduplicated by ID in encounter order.
func parseSearchResponse(data map[string]interface{}) []searchVideo {
	var videos []searchVideo
	seen := make(map[string]bool)
	for _, items := range searchItemLists(data) {
		collectVideos(items, seen, &videos)
		for _, section := range items {
			nested, _ := dig(section, "itemSectionRenderer", "contents").([]interface{})
			collectVideos(nested, seen, &videos)
		}
	}
	return videos
}

// collectVideos walks a renderer item list, extracting videoRenderers and
// recursing into shelfRenderer contents regardless of list orientation
// (verticalListRenderer, horizontalListRenderer, ...). Unknown renderer
// types are silently skipped.
func collectVideos(items []interface{}, seen map[string]bool, out *[]searchVideo) {
	for _, it := range items {
		m, ok := it.(map[string]interface{})
		if !ok {
			continue
		}

		if vr, ok := m["videoRenderer"].(map[string]interface{}); ok {
			if v, ok := parseVideoRenderer(vr); ok && !seen[v.ID] {
				seen[v.ID] = true
				*out = append(*out, v)
			}
			continue
		}

		if sh, ok := m["shelfRenderer"].(map[string]interface{}); ok {
			if content, ok := sh["content"].(map[string]interface{}); ok {
				for _, listRenderer := range content {
					if lr, ok := listRenderer.(map[string]interface{}); ok {
						if nested, ok := lr["items"].([]interface{}); ok {
							collectVideos(nested, seen, out)
						}
					}
				}
			}
		}
	}
}

func parseVideoRenderer(vr map[string]interface{}) (searchVideo, bool) {
	id, _ := vr["videoId"].(string)
	if id == "" {
		return searchVideo{}, false
	}

	v := searchVideo{
		ID:              id,
		Title:           textOf(vr["title"]),
		Channel:         textOf(vr["ownerText"]),
		DurationSeconds: parseDurationText(textOf(vr["lengthText"])),
		ViewCount:       parseViewCount(textOf(vr["viewCountText"])),
	}

	if thumbs, ok := dig(vr, "thumbnail", "thumbnails").([]interface{}); ok && len(thumbs) > 0 {
		if t0, ok := thumbs[0].(map[string]interface{}); ok {
			v.Thumbnail, _ = t0["url"].(string)
		}
	}

	return v, true
}

// dig walks nested map[string]interface{} values by key, returning nil if
// any step is missing or not a map.
func dig(v interface{}, keys ...string) interface{} {
	for _, k := range keys {
		m, ok := v.(map[string]interface{})
		if !ok {
			return nil
		}
		v = m[k]
	}
	return v
}

// textOf extracts text from either {"simpleText": ...} or
// {"runs": [{"text": ...}, ...]} shapes. Returns "" for anything else.
func textOf(v interface{}) string {
	m, ok := v.(map[string]interface{})
	if !ok {
		return ""
	}
	if s, ok := m["simpleText"].(string); ok {
		return s
	}
	runs, ok := m["runs"].([]interface{})
	if !ok {
		return ""
	}
	var sb strings.Builder
	for _, r := range runs {
		if rm, ok := r.(map[string]interface{}); ok {
			if t, ok := rm["text"].(string); ok {
				sb.WriteString(t)
			}
		}
	}
	return sb.String()
}

// parseDurationText converts "3:45" or "1:02:33" into seconds.
// Returns 0 for empty/unparseable text (live streams have no lengthText).
func parseDurationText(s string) int {
	if s == "" {
		return 0
	}
	total := 0
	for _, part := range strings.Split(s, ":") {
		n, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil {
			return 0
		}
		total = total*60 + n
	}
	return total
}

// Unknown/hidden counts and concurrent live viewers are not zero-view videos.
var viewCountPattern = regexp.MustCompile(`(?i)^([0-9][0-9,]*(?:\.[0-9]+)?)\s*([KMB]?)\s+views?$`)

func parseViewCount(s string) int {
	s = strings.TrimSpace(s)
	if strings.EqualFold(s, "No views") {
		return 0
	}
	match := viewCountPattern.FindStringSubmatch(s)
	if match == nil {
		return -1
	}
	count, err := strconv.ParseFloat(strings.ReplaceAll(match[1], ",", ""), 64)
	if err != nil {
		return -1
	}
	switch strings.ToUpper(match[2]) {
	case "K":
		count *= 1000
	case "M":
		count *= 1000000
	case "B":
		count *= 1000000000
	}
	return int(count)
}
