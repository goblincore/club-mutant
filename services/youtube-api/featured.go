package main

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

type dailyPick struct {
	Date  string      `json:"date"`
	Video searchVideo `json:"video"`
}

type featuredResponse struct {
	Date      string       `json:"date"`
	CheckedAt string       `json:"checkedAt"`
	Video     *VideoResult `json:"video"`
}

type dailyFeature struct {
	mu     sync.Mutex
	group  singleflight.Group
	path   string
	pick   dailyPick
	now    func() time.Time
	search func(context.Context, string, int, int) ([]searchVideo, error)
	count  func(context.Context, string) (int, error)
}

func newDailyFeature(path string) *dailyFeature {
	d := &dailyFeature{path: path, now: time.Now, search: innertubeSmallSearch, count: innertubeViewCount}
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &d.pick)
	}
	return d
}

var featuredTerms = []string{"home video 1990", "student animation short", "stop motion animation", "community TV", "old computer demo", "indie music video"}

func dailyRank(value string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(value))
	return h.Sum32()
}

func (d *dailyFeature) save() {
	if d.path == "" {
		return
	}
	data, err := json.Marshal(d.pick)
	if err == nil {
		err = os.MkdirAll(filepath.Dir(d.path), 0755)
	}
	if err == nil {
		err = os.WriteFile(d.path+".tmp", data, 0600)
	}
	if err == nil {
		err = os.Rename(d.path+".tmp", d.path)
	}
	if err != nil {
		log.Printf("[featured] Could not persist daily pick: %v", err)
	}
}

// Coalesced work has its own bounded context: closing one Home window must not
// cancel the featured pick that another visitor is waiting for.
func (d *dailyFeature) get(ctx context.Context) (featuredResponse, error) {
	day := d.now().UTC().Format("2006-01-02")
	result := d.group.DoChan(day, func() (interface{}, error) {
		shared, cancel := context.WithTimeout(context.Background(), 24*time.Second)
		defer cancel()
		d.mu.Lock()
		defer d.mu.Unlock()
		if d.pick.Date != day {
			d.pick = dailyPick{Date: day}
		}
		rejected := make(map[string]bool)
		if d.pick.Video.ID != "" {
			count, err := d.count(shared, d.pick.Video.ID)
			if err != nil {
				return nil, err
			} // Never serve an unverified stale count.
			if count >= 0 && count < 100 {
				d.pick.Video.ViewCount = count
				d.save()
				return d.response(), nil
			}
			rejected[d.pick.Video.ID] = true
			d.pick.Video = searchVideo{}
			d.save()
		}
		start := int(dailyRank(day)) % len(featuredTerms)
		// Bounded fallback queries; no popular-video fallback when the pool is empty.
		for attempt := 0; attempt < 3; attempt++ {
			candidates, err := d.search(shared, featuredTerms[(start+attempt)%len(featuredTerms)], 99, 12)
			if err != nil {
				if shared.Err() != nil {
					return nil, err
				}
				continue
			}
			candidates = filterSmallVideos(candidates, 99)
			sort.SliceStable(candidates, func(i, j int) bool { return dailyRank(day+candidates[i].ID) < dailyRank(day+candidates[j].ID) })
			checked := 0
			for _, candidate := range candidates {
				if rejected[candidate.ID] {
					continue
				}
				if checked >= 3 {
					break
				}
				checked++
				count, err := d.count(shared, candidate.ID)
				rejected[candidate.ID] = true
				if err != nil || count < 0 || count >= 100 {
					continue
				}
				candidate.ViewCount = count
				d.pick.Video = candidate
				d.save()
				return d.response(), nil
			}
		}
		return d.response(), nil
	})
	select {
	case <-ctx.Done():
		return featuredResponse{}, ctx.Err()
	case value := <-result:
		if value.Err != nil {
			return featuredResponse{}, value.Err
		}
		return value.Val.(featuredResponse), nil
	}
}

func (d *dailyFeature) response() featuredResponse {
	result := featuredResponse{Date: d.pick.Date, CheckedAt: d.now().UTC().Format(time.RFC3339)}
	v := d.pick.Video
	if v.ID != "" && v.ViewCount >= 0 && v.ViewCount < 100 {
		count := v.ViewCount
		result.Video = &VideoResult{ID: v.ID, Type: "video", Title: v.Title, ChannelTitle: v.Channel, Duration: formatDuration(v.DurationSeconds), Thumbnail: v.Thumbnail, ViewCount: &count}
	}
	return result
}

func (s *Server) handleFeatured(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	response, err := s.featured.get(r.Context())
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Could not verify today's featured video"})
		return
	}
	_ = json.NewEncoder(w).Encode(response)
}

// Watch-page metadata revalidates the chosen video's count on every feature
// request, rather than trusting the search cache or concurrent live viewers.
func innertubeViewCount(ctx context.Context, id string) (int, error) {
	data, err := innertubeWatchInfo(ctx, id)
	if err != nil {
		return -1, err
	}
	items, _ := dig(data, "contents", "twoColumnWatchNextResults", "results", "results", "contents").([]interface{})
	for _, item := range items {
		primary, ok := dig(item, "videoPrimaryInfoRenderer").(map[string]interface{})
		if !ok {
			continue
		}
		views := textOf(dig(primary, "viewCount", "videoViewCountRenderer", "viewCount"))
		return parseViewCount(views), nil
	}
	return -1, fmt.Errorf("video metadata unavailable")
}
