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
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
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
	payload := map[string]interface{}{
		"query": query,
		"context": map[string]interface{}{
			"client": map[string]interface{}{
				"clientName":       "WEB",
				"clientVersion":    innertubeClientVersion,
				"newVisitorCookie": true,
				"hl":               "en",
				"gl":               "US",
			},
			"user": map[string]interface{}{"lockedSafetyMode": false},
		},
		"params": innertubeVideoParams,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, innertubeSearchURL, bytes.NewReader(body))
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

	return parseSearchResponse(data), nil
}

// parseSearchResponse walks every itemSectionRenderer section of an
// InnerTube search response, collecting videoRenderer results (including
// those nested in shelves), deduplicated by ID in encounter order.
func parseSearchResponse(data map[string]interface{}) []searchVideo {
	sections, _ := dig(data, "contents", "twoColumnSearchResultsRenderer", "primaryContents", "sectionListRenderer", "contents").([]interface{})

	var videos []searchVideo
	seen := make(map[string]bool)
	for _, section := range sections {
		items, _ := dig(section, "itemSectionRenderer", "contents").([]interface{})
		collectVideos(items, seen, &videos)
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

// parseViewCount extracts the leading number from strings like
// "1,234,567 views". Returns 0 if there are no digits ("No views", live).
func parseViewCount(s string) int {
	var digits strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		} else if r == ',' && digits.Len() > 0 {
			continue // thousands separator inside the number
		} else if digits.Len() > 0 {
			break // stop at the end of the first number
		}
	}
	if digits.Len() == 0 {
		return 0
	}
	n, err := strconv.Atoi(digits.String())
	if err != nil {
		return 0
	}
	return n
}
