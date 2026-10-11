package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync/atomic"
	"time"
)

var metricsStartedAt = time.Now()

// All dimensions are fixed. Never label metrics with URLs, tokens or video IDs.
const (
	cacheMemory = iota
	cacheDisk
	cacheMiss
)

var metricFormats = [...]string{"video", "audio", "combined"}
var metricCacheResults = [...]string{"memory", "disk", "miss"}
var metricRoutes = [...]string{"direct", "isp_proxy"}
var metricDownloadResults = [...]string{"completed", "failed", "canceled", "oversized", "cache_recheck"}

type playbackMetrics struct {
	requests [3]atomic.Uint64
	bytes    [3]atomic.Uint64 // memory, disk, download; only bytes accepted by the client writer
}

type upstreamMetrics struct {
	requests, bytes, errors, forbidden atomic.Uint64
}

// Metrics belongs to a Server. Zero values are usable, including in tests.
type Metrics struct {
	playback                                     [3]playbackMetrics
	upstream                                     [2][3]upstreamMetrics
	started, joined, refreshes, refreshSuccesses atomic.Uint64
	downloadResults                              [5]atomic.Uint64
}

func metricFormat(videoOnly, audioOnly bool) int {
	if audioOnly {
		return 1
	}
	if videoOnly {
		return 0
	}
	return 2
}

type playbackMetricSnapshot struct {
	Format        string `json:"format"`
	MemoryHits    uint64 `json:"memoryHits"`
	DiskHits      uint64 `json:"diskHits"`
	Misses        uint64 `json:"misses"`
	MemoryBytes   uint64 `json:"memoryBytes"`
	DiskBytes     uint64 `json:"diskBytes"`
	DownloadBytes uint64 `json:"downloadBytes"`
}

type upstreamMetricSnapshot struct {
	Route     string `json:"route"`
	Format    string `json:"format"`
	Requests  uint64 `json:"requests"`
	Bytes     uint64 `json:"bytes"`
	Errors    uint64 `json:"errors"`
	Forbidden uint64 `json:"forbidden"`
}

type downloadMetricSnapshot struct {
	Started       uint64 `json:"started"`
	Joined        uint64 `json:"joined"`
	Completed     uint64 `json:"completed"`
	Failed        uint64 `json:"failed"`
	Canceled      uint64 `json:"canceled"`
	Oversized     uint64 `json:"oversized"`
	CacheRechecks uint64 `json:"cacheRechecks"`
	Active        int    `json:"active"`
}

type metricsSnapshot struct {
	StartedAt           time.Time                `json:"startedAt"`
	Playback            []playbackMetricSnapshot `json:"playback"`
	Upstream            []upstreamMetricSnapshot `json:"upstream"`
	Downloads           downloadMetricSnapshot   `json:"downloads"`
	URLRefreshes        uint64                   `json:"urlRefreshes"`
	URLRefreshSuccesses uint64                   `json:"urlRefreshSuccesses"`
}

func (s *Server) metricsSnapshot() metricsSnapshot {
	m := &s.metrics
	result := metricsSnapshot{StartedAt: metricsStartedAt}
	for format, name := range metricFormats {
		p := &m.playback[format]
		result.Playback = append(result.Playback, playbackMetricSnapshot{
			name, p.requests[0].Load(), p.requests[1].Load(), p.requests[2].Load(),
			p.bytes[0].Load(), p.bytes[1].Load(), p.bytes[2].Load(),
		})
	}
	for route, routeName := range metricRoutes {
		for format, formatName := range metricFormats {
			u := &m.upstream[route][format]
			result.Upstream = append(result.Upstream, upstreamMetricSnapshot{
				routeName, formatName, u.requests.Load(), u.bytes.Load(), u.errors.Load(), u.forbidden.Load(),
			})
		}
	}
	s.downloadMu.Lock()
	active := len(s.downloads)
	s.downloadMu.Unlock()
	result.Downloads = downloadMetricSnapshot{
		m.started.Load(), m.joined.Load(), m.downloadResults[0].Load(), m.downloadResults[1].Load(),
		m.downloadResults[2].Load(), m.downloadResults[3].Load(), m.downloadResults[4].Load(), active,
	}
	result.URLRefreshes, result.URLRefreshSuccesses = m.refreshes.Load(), m.refreshSuccesses.Load()
	return result
}

func (s *Server) handleAdminMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(s.metricsSnapshot())
}

// Prometheus text 0.0.4 with fixed metric names and escaped, static label values.
// This small exporter needs no registry or additional dependencies.
func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	x := s.metricsSnapshot()
	family := func(name, help, kind string) {
		fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s %s\n", name, help, name, kind)
	}
	family("youtube_process_start_time_seconds", "Process start time; counters reset on restart.", "gauge")
	fmt.Fprintf(w, "youtube_process_start_time_seconds %.3f\n", float64(x.StartedAt.UnixMilli())/1000)
	family("youtube_playback_cache_requests_total", "Valid playback requests by cache lookup result; background lookups excluded.", "counter")
	for _, p := range x.Playback {
		for i, value := range []uint64{p.MemoryHits, p.DiskHits, p.Misses} {
			fmt.Fprintf(w, "youtube_playback_cache_requests_total{format=%q,result=%q} %d\n", p.Format, metricCacheResults[i], value)
		}
	}
	family("youtube_playback_bytes_total", "Media bytes accepted by client writers, including partial ranges and interrupted responses.", "counter")
	for _, p := range x.Playback {
		for i, value := range []uint64{p.MemoryBytes, p.DiskBytes, p.DownloadBytes} {
			fmt.Fprintf(w, "youtube_playback_bytes_total{format=%q,source=%q} %d\n", p.Format, [...]string{"memory", "disk", "download"}[i], value)
		}
	}
	for _, field := range []struct {
		name, help string
		value      func(upstreamMetricSnapshot) uint64
	}{
		{"requests", "Upstream media HTTP attempts including retries, prefetch and playback.", func(u upstreamMetricSnapshot) uint64 { return u.Requests }},
		{"bytes", "Upstream media response-body bytes read, including rejected chunks and retries; excludes HTTP overhead and extraction traffic.", func(u upstreamMetricSnapshot) uint64 { return u.Bytes }},
		{"errors", "Upstream media attempts failing transport or chunk validation, including HTTP 403.", func(u upstreamMetricSnapshot) uint64 { return u.Errors }},
		{"forbidden", "Upstream media attempts returning HTTP 403.", func(u upstreamMetricSnapshot) uint64 { return u.Forbidden }},
	} {
		name := "youtube_upstream_media_" + field.name + "_total"
		family(name, field.help, "counter")
		for _, u := range x.Upstream {
			fmt.Fprintf(w, "%s{route=%q,format=%q} %d\n", name, u.Route, u.Format, field.value(u))
		}
	}
	for _, field := range []struct {
		name, help string
		value      uint64
	}{
		{"youtube_media_downloads_started_total", "Shared download operations starting an upstream fetch, including oversized probes.", x.Downloads.Started},
		{"youtube_media_downloads_joined_total", "Subscribers joining an existing download rather than starting another.", x.Downloads.Joined},
		{"youtube_media_url_refreshes_total", "URL refresh attempts after upstream HTTP 403.", x.URLRefreshes},
		{"youtube_media_url_refresh_successes_total", "URL refresh resolutions that succeeded; does not guarantee subsequent download success.", x.URLRefreshSuccesses},
	} {
		family(field.name, field.help, "counter")
		fmt.Fprintf(w, "%s %d\n", field.name, field.value)
	}
	family("youtube_media_download_results_total", "Shared download outcomes; canceled includes deadline expiration, cache_recheck requires no upstream fetch.", "counter")
	for i, value := range []uint64{x.Downloads.Completed, x.Downloads.Failed, x.Downloads.Canceled, x.Downloads.Oversized, x.Downloads.CacheRechecks} {
		fmt.Fprintf(w, "youtube_media_download_results_total{result=%q} %d\n", metricDownloadResults[i], value)
	}
	family("youtube_media_downloads_active", "Current shared download operations.", "gauge")
	fmt.Fprintf(w, "youtube_media_downloads_active %d\n", x.Downloads.Active)
}

type meteredMediaBody struct {
	io.ReadCloser
	bytes *atomic.Uint64
}

func (b *meteredMediaBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	b.bytes.Add(uint64(n))
	return n, err
}
