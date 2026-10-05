package main

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func testFeature(path string) *dailyFeature {
	d := newDailyFeature(path)
	d.now = func() time.Time { return time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC) }
	d.search = func(context.Context, string, int, int) ([]searchVideo, error) {
		return []searchVideo{{ID: "AAAAAAAAAAA", Title: "An unseen tape", DurationSeconds: 30, ViewCount: 12}, {ID: "BBBBBBBBBBB", Title: "Another tape", DurationSeconds: 40, ViewCount: 99}}, nil
	}
	d.count = func(context.Context, string) (int, error) { return 12, nil }
	return d
}

func TestDailyFeaturedStablePersistedAndRollover(t *testing.T) {
	path := filepath.Join(t.TempDir(), "daily", "featured.json")
	d := testFeature(path)
	first, err := d.get(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	again, err := d.get(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if first.Video == nil || again.Video.ID != first.Video.ID {
		t.Fatal("daily pick changed on refresh")
	}
	restarted := testFeature(path)
	restarted.search = func(context.Context, string, int, int) ([]searchVideo, error) {
		t.Error("persisted pick was discarded")
		return nil, nil
	}
	saved, err := restarted.get(context.Background())
	if err != nil || saved.Video.ID != first.Video.ID {
		t.Fatalf("restart lost pick: %+v %v", saved, err)
	}
	d.now = func() time.Time { return time.Date(2026, 10, 6, 0, 0, 1, 0, time.UTC) }
	d.search = func(context.Context, string, int, int) ([]searchVideo, error) {
		return []searchVideo{{ID: "CCCCCCCCCCC", Title: "Tomorrow", DurationSeconds: 60, ViewCount: 5}}, nil
	}
	tomorrow, err := d.get(context.Background())
	if err != nil || tomorrow.Date != "2026-10-06" || tomorrow.Video.ID != "CCCCCCCCCCC" {
		t.Fatalf("day rollover failed: %+v %v", tomorrow, err)
	}
}

func TestDailyFeaturedReplacesAt100AndFailsClosed(t *testing.T) {
	d := testFeature("")
	first, _ := d.get(context.Background())
	old := first.Video.ID
	d.count = func(_ context.Context, id string) (int, error) {
		if id == old {
			return 100, nil
		}
		return 99, nil
	}
	replacement, err := d.get(context.Background())
	if err != nil || replacement.Video == nil || replacement.Video.ID == old || *replacement.Video.ViewCount != 99 {
		t.Fatalf("popular pick retained: %+v %v", replacement, err)
	}
	d.count = func(context.Context, string) (int, error) { return -1, errors.New("offline") }
	unverified, err := d.get(context.Background())
	if err == nil || unverified.Video != nil {
		t.Fatal("served an unverified pick")
	}
}

func TestDailyFeaturedNoPopularOrUnknownFallback(t *testing.T) {
	d := testFeature("")
	d.search = func(context.Context, string, int, int) ([]searchVideo, error) {
		return []searchVideo{{ID: "popular", DurationSeconds: 10, ViewCount: 100}, {ID: "hidden", DurationSeconds: 10, ViewCount: -1}, {ID: "live", ViewCount: 0}}, nil
	}
	d.count = func(context.Context, string) (int, error) { t.Error("ineligible candidate was checked"); return 0, nil }
	response, err := d.get(context.Background())
	if err != nil || response.Video != nil {
		t.Fatalf("invalid fallback: %+v %v", response, err)
	}
}

func TestDailyFeaturedCancellationDoesNotCancelSharedPick(t *testing.T) {
	d := testFeature("")
	started := make(chan struct{})
	release := make(chan struct{})
	var searches atomic.Int32
	d.search = func(ctx context.Context, _ string, _ int, _ int) ([]searchVideo, error) {
		searches.Add(1)
		close(started)
		select {
		case <-release:
			return []searchVideo{{ID: "AAAAAAAAAAA", DurationSeconds: 10, ViewCount: 1}}, nil
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	ended := make(chan error, 1)
	go func() { _, err := d.get(ctx); ended <- err }()
	<-started
	cancel()
	if err := <-ended; !errors.Is(err, context.Canceled) {
		t.Fatalf("expected caller cancellation, got %v", err)
	}
	close(release)
	response, err := d.get(context.Background())
	if err != nil || response.Video == nil || searches.Load() != 1 {
		t.Fatalf("shared pick was canceled: %+v %v", response, err)
	}
}

func TestFeaturedWatchCountUsesPrimaryMetadata(t *testing.T) {
	old := innertubeClient
	t.Cleanup(func() { innertubeClient = old })
	innertubeClient = &http.Client{Transport: searchRoundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/youtubei/v1/next" {
			t.Errorf("wrong metadata endpoint: %s", r.URL.Path)
		}
		body := `{"contents":{"twoColumnWatchNextResults":{"results":{"results":{"contents":[{"videoPrimaryInfoRenderer":{"viewCount":{"videoViewCountRenderer":{"viewCount":{"simpleText":"99 views"}}}}}]}}}}}`
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	count, err := innertubeViewCount(context.Background(), "AAAAAAAAAAA")
	if err != nil || count != 99 {
		t.Fatalf("metadata count: %d %v", count, err)
	}
	s := &Server{featured: testFeature("")}
	rec := httptest.NewRecorder()
	s.handleFeatured(rec, httptest.NewRequest("GET", "/featured", nil))
	if rec.Code != 200 || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("feature response could be cached stale")
	}
}
