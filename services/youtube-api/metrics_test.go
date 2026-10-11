package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMetricsSeparatePlaybackCacheTiersAndExcludeBackgroundLookups(t *testing.T) {
	body := bytes.Repeat([]byte("abcdefghij"), 500)
	upstream := httptest.NewServer(newRangeServer(body, false))
	defer upstream.Close()
	for _, mode := range []struct {
		query                string
		videoOnly, audioOnly bool
	}{
		{"", true, false}, {"?audioOnly=true", false, true}, {"?videoOnly=false", false, false},
	} {
		t.Run(mode.query, func(t *testing.T) {
			s := mediaTestServer(t, upstream.URL)
			play := func(rng string, wantStatus, wantBytes int) {
				t.Helper()
				r := httptest.NewRequest("GET", "/proxy/"+mediaTestID+mode.query, nil)
				r.Header.Set("Range", rng)
				w := httptest.NewRecorder()
				s.handleProxy(w, r)
				if w.Code != wantStatus || w.Body.Len() != wantBytes {
					t.Fatalf("playback got status=%d bytes=%d, want %d/%d", w.Code, w.Body.Len(), wantStatus, wantBytes)
				}
			}
			play("", 200, len(body)) // One miss populates both caches.
			play("bytes=-10", 206, 10)
			key := mediaCacheKey(mediaTestID, mode.videoOnly, mode.audioOnly)
			s.videoCache.Remove(key)
			play("", 200, len(body)) // Disk hit promotes the small file.
			play("bytes=99999-", 416, 0)
			if _, err := s.prefetchMedia(context.Background(), mediaTestID, mode.videoOnly, mode.audioOnly); err != nil {
				t.Fatal(err)
			}
			// Queue checks, internal rechecks, and prefetch must not inflate playback hits.
			s.cachedMedia(key)
			s.handleProxy(httptest.NewRecorder(), httptest.NewRequest("GET", "/proxy/invalid", nil))
			x := s.metricsSnapshot()
			p := x.Playback[metricFormat(mode.videoOnly, mode.audioOnly)]
			if p.MemoryHits != 2 || p.DiskHits != 1 || p.Misses != 1 || p.MemoryBytes != 10 || p.DiskBytes != uint64(len(body)) || p.DownloadBytes != uint64(len(body)) {
				t.Fatalf("incorrect playback metrics: %+v", p)
			}
			u := x.Upstream[metricFormat(mode.videoOnly, mode.audioOnly)]
			if u.Requests != 1 || u.Bytes != uint64(len(body)) || u.Errors != 0 || x.Downloads.Started != 1 || x.Downloads.Completed != 1 {
				t.Fatalf("warm requests made extra upstream work: %+v, %+v", u, x.Downloads)
			}
			for i, other := range x.Playback {
				if i != metricFormat(mode.videoOnly, mode.audioOnly) && other.MemoryHits+other.DiskHits+other.Misses != 0 {
					t.Fatalf("metrics leaked into another format: %+v", other)
				}
			}
		})
	}
}

func TestMetricsCountTruncatedBytesAndRetryTraffic(t *testing.T) {
	body := bytes.Repeat([]byte("x"), 1000)
	var attempts int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.Header().Set("Content-Range", "bytes 0-999/1000")
		w.WriteHeader(http.StatusPartialContent)
		if attempts == 1 {
			w.Write(body[:100]) // Clean, short EOF: bytes still consumed through the proxy.
			return
		}
		w.Write(body)
	}))
	defer upstream.Close()
	s := mediaTestServer(t, upstream.URL)
	s.resolveCache.Set(mediaTestID+":video", ResolveResponse{URL: upstream.URL, ResolvedViaProxy: true}, time.Hour)
	s.proxyMediaClient = upstream.Client()
	if _, err := s.prefetchMedia(context.Background(), mediaTestID, true, false); err != nil {
		t.Fatal(err)
	}
	x := s.metricsSnapshot()
	u := x.Upstream[3] // ISP proxy, video.
	if u.Requests != 2 || u.Bytes != 1100 || u.Errors != 1 || u.Forbidden != 0 || x.Downloads.Completed != 1 {
		t.Fatalf("retry traffic was lost: %+v, %+v", u, x.Downloads)
	}
	if x.Playback[0].Misses+x.Playback[0].MemoryHits+x.Playback[0].DiskHits != 0 {
		t.Fatal("prefetch counted as playback")
	}
}

func TestMetricsCountTransportErrors(t *testing.T) {
	s := mediaTestServer(t, "https://fixture.invalid/video")
	s.directMediaClient = &http.Client{Transport: mediaRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("fixture connection failure")
	})}
	if _, err := s.prefetchMedia(context.Background(), mediaTestID, true, false); err == nil {
		t.Fatal("expected failed prefetch")
	}
	x := s.metricsSnapshot()
	u := x.Upstream[0]
	if u.Requests != uint64(upstreamChunkRetries+1) || u.Errors != u.Requests || u.Bytes != 0 || x.Downloads.Failed != 1 {
		t.Fatalf("incorrect transport failure metrics: %+v, %+v", u, x.Downloads)
	}
}

type partialMetricWriter struct{ *httptest.ResponseRecorder }

func (w partialMetricWriter) Write(p []byte) (int, error) {
	return 7, errors.New("fixture client disconnect")
}

func TestMetricsCountOnlyBytesAcceptedByClient(t *testing.T) {
	s := mediaTestServer(t, "unused")
	s.videoCache.Set(mediaTestID+":video", bytes.Repeat([]byte("x"), 100))
	s.handleProxy(partialMetricWriter{httptest.NewRecorder()}, httptest.NewRequest("GET", "/proxy/"+mediaTestID, nil))
	if got := s.metricsSnapshot().Playback[0].MemoryBytes; got != 7 {
		t.Fatalf("counted %d bytes, want 7 accepted bytes", got)
	}
}

func TestMetricsEndpointsRequireAdminTokenAndExposeZeroSeries(t *testing.T) {
	t.Setenv("ADMIN_TOKEN", "fixture-admin-token")
	s := &Server{}
	for _, tc := range []struct {
		path        string
		handler     http.HandlerFunc
		contentType string
	}{
		{"/metrics", s.handleMetrics, "text/plain; version=0.0.4; charset=utf-8"},
		{"/admin/metrics", s.handleAdminMetrics, "application/json"},
	} {
		t.Run(tc.path, func(t *testing.T) {
			for _, token := range []string{"", "wrong", "fixture-admin-token"} {
				r := httptest.NewRequest("GET", tc.path, nil)
				r.Header.Set("Authorization", "Bearer "+token)
				w := httptest.NewRecorder()
				adminAuthMiddleware(tc.handler)(w, r)
				if token != "fixture-admin-token" {
					if w.Code != 401 {
						t.Fatalf("unauthorized scrape got %d", w.Code)
					}
					continue
				}
				if w.Code != 200 || w.Header().Get("Content-Type") != tc.contentType || w.Header().Get("Cache-Control") != "no-store" {
					t.Fatalf("invalid metrics response: %d %v", w.Code, w.Header())
				}
				if tc.path == "/admin/metrics" {
					var x metricsSnapshot
					if err := json.Unmarshal(w.Body.Bytes(), &x); err != nil || len(x.Playback) != 3 || len(x.Upstream) != 6 || x.StartedAt.IsZero() {
						t.Fatalf("invalid JSON snapshot: %+v err=%v", x, err)
					}
				} else {
					for _, route := range metricRoutes {
						for _, format := range metricFormats {
							want := fmt.Sprintf("youtube_upstream_media_bytes_total{route=%q,format=%q} 0\n", route, format)
							if !strings.Contains(w.Body.String(), want) {
								t.Fatalf("missing initial series: %s", want)
							}
						}
					}
					if strings.Contains(w.Body.String(), "fixture-admin-token") {
						t.Fatal("token leaked into metrics")
					}
				}
			}
			t.Setenv("ADMIN_TOKEN", "")
			w := httptest.NewRecorder()
			adminAuthMiddleware(tc.handler)(w, httptest.NewRequest("GET", tc.path, nil))
			if w.Code != 503 {
				t.Fatalf("unconfigured metrics auth got %d", w.Code)
			}
			t.Setenv("ADMIN_TOKEN", "fixture-admin-token")
		})
	}
}
