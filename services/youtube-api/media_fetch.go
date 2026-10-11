package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

var errMediaTooLarge = errors.New("media exceeds cache limit")

// Direct token-bound URLs must never inherit HTTP_PROXY or the ISP route.
var directHTTPMediaClient = func() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	return &http.Client{Transport: transport, Timeout: 5 * time.Minute}
}()

func mediaCacheKey(videoID string, videoOnly, audioOnly bool) string {
	if audioOnly {
		return videoID + ":audio"
	}
	if videoOnly {
		return videoID + ":video"
	}
	return videoID
}

func cachedMediaContentType(data []byte, audioOnly bool) string {
	kind := http.DetectContentType(data)
	if kind != "video/mp4" && kind != "video/webm" {
		kind = "video/mp4"
	}
	if audioOnly {
		kind = strings.Replace(kind, "video/", "audio/", 1)
	}
	return kind
}

func (s *Server) cachedMedia(key string) ([]byte, bool) {
	data, tier := s.cachedMediaWithTier(key)
	return data, tier != cacheMiss
}

func (s *Server) cachedMediaWithTier(key string) ([]byte, int) {
	if data, ok := s.videoCache.Get(key); ok {
		return data, cacheMemory
	}
	if s.diskCache != nil {
		if data, ok := s.diskCache.Get(key); ok {
			if int64(len(data)) <= MemoryCacheMaxEntrySize {
				s.videoCache.Set(key, data)
			}
			return data, cacheDisk
		}
	}
	return nil, cacheMiss
}

func (s *Server) mediaClient(resolved ResolveResponse) *http.Client {
	if resolved.ResolvedViaProxy {
		if s.proxyMediaClient != nil {
			return s.proxyMediaClient
		}
		return httpClient
	}
	if s.directMediaClient != nil {
		return s.directMediaClient
	}
	return directHTTPMediaClient
}

// Resolution is shared between prefetch and viewers. An individual caller can
// leave without canceling another caller's resolution; the shared operation
// has its own bounded budget, including semaphore wait time.
func (s *Server) resolveMedia(ctx context.Context, videoID string, videoOnly, audioOnly, fresh bool, sem chan struct{}) (*ResolveResponse, error) {
	key := mediaCacheKey(videoID, videoOnly, audioOnly)
	if !fresh {
		if cached, ok := s.resolveCache.Get(key); ok {
			return &cached, nil
		}
	}
	flightKey := key
	if fresh {
		flightKey += ":refresh"
	}
	result := s.mediaResolveGroup.DoChan(flightKey, func() (interface{}, error) {
		if !fresh {
			if cached, ok := s.resolveCache.Get(key); ok {
				return &cached, nil
			}
		}
		workCtx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		defer cancel()
		var resolved *ResolveResponse
		var err error
		if s.mediaResolver != nil {
			resolved, err = s.mediaResolver(workCtx, videoID, videoOnly, audioOnly, fresh, sem)
		} else {
			if fresh && os.Getenv("POT_PROVIDER_URL") != "" {
				resolved, err = s.resolveWithYtDlpInternalContext(workCtx, videoID, videoOnly, audioOnly, true, sem)
			}
			if resolved == nil || err != nil {
				resolved, err = s.resolveWithYtDlpContext(workCtx, videoID, videoOnly, audioOnly, sem)
			}
		}
		if err == nil {
			s.resolveCache.Set(key, *resolved, 5*time.Minute)
		}
		return resolved, err
	})
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case value := <-result:
		if value.Err != nil {
			return nil, value.Err
		}
		return value.Val.(*ResolveResponse), nil
	}
}

type mediaSource struct {
	server               *Server
	ctx                  context.Context
	videoID              string
	videoOnly, audioOnly bool
	sem                  chan struct{}
	resolved             ResolveResponse
	total                int64
	contentType          string
	refreshed            bool
}

func mediaURLSize(rawURL string) int64 {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return 0
	}
	size, _ := strconv.ParseInt(parsed.Query().Get("clen"), 10, 64)
	return max(size, 0)
}

func (m *mediaSource) readChunk(start, end int64) ([]byte, error) {
	for {
		req, err := http.NewRequestWithContext(m.ctx, "GET", m.resolved.URL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", start, end))
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
		req.Header.Set("Accept", "*/*")
		req.Header.Set("Accept-Language", "en-US,en;q=0.9")
		req.Header.Set("Origin", "https://www.youtube.com")
		req.Header.Set("Referer", "https://www.youtube.com/")
		route := 0
		if m.resolved.ResolvedViaProxy {
			route = 1
		}
		metrics := &m.server.metrics.upstream[route][metricFormat(m.videoOnly, m.audioOnly)]
		metrics.requests.Add(1)
		resp, err := m.server.mediaClient(m.resolved).Do(req)
		if err != nil {
			metrics.errors.Add(1)
			return nil, err
		}
		resp.Body = &meteredMediaBody{ReadCloser: resp.Body, bytes: &metrics.bytes}
		if resp.StatusCode == http.StatusForbidden {
			metrics.forbidden.Add(1)
		}
		if resp.StatusCode == http.StatusForbidden && !m.refreshed {
			metrics.errors.Add(1)
			resp.Body.Close()
			m.refreshed = true
			m.server.metrics.refreshes.Add(1)
			fresh, err := m.server.resolveMedia(m.ctx, m.videoID, m.videoOnly, m.audioOnly, true, m.sem)
			if err != nil {
				return nil, err
			}
			m.server.metrics.refreshSuccesses.Add(1)
			oldURL, _ := url.Parse(m.resolved.URL)
			newURL, _ := url.Parse(fresh.URL)
			if start > 0 && oldURL != nil && newURL != nil && oldURL.Query().Get("itag") != newURL.Query().Get("itag") {
				return nil, fmt.Errorf("media format changed during download")
			}
			m.resolved = *fresh
			if start == 0 {
				m.total = mediaURLSize(fresh.URL)
			}
			log.Printf("[media] Refreshed %s at byte %d (proxy=%v)", m.videoID, start, fresh.ResolvedViaProxy)
			continue // Re-select the HTTP route for the refreshed URL.
		}
		data, total, err := readMediaChunk(resp, start, end, m.total)
		if err != nil {
			metrics.errors.Add(1)
			return nil, err
		}
		m.total = total
		if m.contentType == "" {
			m.contentType = resp.Header.Get("Content-Type")
			if m.contentType == "" {
				m.contentType = cachedMediaContentType(data, m.audioOnly)
			}
		}
		return data, nil
	}
}

// Verify the response's offsets, total and exact byte count. A valid length
// alone is insufficient: a CDN that ignores Range could return the wrong bytes.
func readMediaChunk(resp *http.Response, start, end, expectedTotal int64) ([]byte, int64, error) {
	defer resp.Body.Close()
	var total, responseStart, responseEnd int64
	switch resp.StatusCode {
	case http.StatusPartialContent:
		cr := strings.TrimSpace(resp.Header.Get("Content-Range"))
		n, err := fmt.Sscanf(cr, "bytes %d-%d/%d", &responseStart, &responseEnd, &total)
		if err != nil || n != 3 || cr != fmt.Sprintf("bytes %d-%d/%d", responseStart, responseEnd, total) || total <= 0 {
			return nil, 0, fmt.Errorf("invalid upstream Content-Range %q", cr)
		}
	case http.StatusOK:
		// Only accept a small 200 when the signed URL independently supplies
		// the complete size. Otherwise a shortened 200 could poison the cache.
		if start != 0 || expectedTotal <= 0 || resp.ContentLength != expectedTotal || resp.ContentLength > end+1 {
			return nil, 0, fmt.Errorf("upstream ignored bounded range")
		}
		total = resp.ContentLength
		responseEnd = total - 1
	default:
		return nil, 0, fmt.Errorf("upstream status %d", resp.StatusCode)
	}
	if responseStart != start || responseEnd != min(end, total-1) || (expectedTotal > 0 && expectedTotal != total) {
		return nil, 0, fmt.Errorf("upstream range or resource size changed")
	}
	want := responseEnd - responseStart + 1
	data, err := io.ReadAll(io.LimitReader(resp.Body, want+1))
	if err != nil {
		return nil, 0, err
	}
	if int64(len(data)) != want {
		return nil, 0, fmt.Errorf("short or oversized chunk: got %d, want %d", len(data), want)
	}
	return data, total, nil
}

type mediaStream struct {
	io.Reader
	closer      io.Closer
	source      *mediaSource
	first       []byte
	total       int64
	contentType string
}

func (m *mediaStream) Close() error { return m.closer.Close() }

func (m *mediaStream) rangeReader(start, end int64) io.Reader {
	var readers []io.Reader
	if start < int64(len(m.first)) {
		last := min(end+1, int64(len(m.first)))
		readers = append(readers, bytes.NewReader(m.first[start:last]))
		start = last
	}
	remaining := newChunkedBody(nil, "", nil, start, end, upstreamChunkSize, upstreamChunkRetries)
	remaining.ctx, remaining.fetch = m.source.ctx, m.source.readChunk
	readers = append(readers, remaining)
	return io.MultiReader(readers...)
}

func (s *Server) openMedia(ctx context.Context, videoID string, videoOnly, audioOnly bool, sem chan struct{}) (*mediaStream, error) {
	resolved, err := s.resolveMedia(ctx, videoID, videoOnly, audioOnly, false, sem)
	if err != nil {
		return nil, err
	}
	source := &mediaSource{server: s, ctx: ctx, videoID: videoID, videoOnly: videoOnly, audioOnly: audioOnly, sem: sem, resolved: *resolved, total: mediaURLSize(resolved.URL)}
	var first []byte
	for attempt := 0; attempt <= upstreamChunkRetries; attempt++ {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		first, err = source.readChunk(0, upstreamChunkSize-1)
		if err == nil {
			break
		}
	}
	if err != nil {
		return nil, err
	}
	remaining := newChunkedBody(nil, "", nil, int64(len(first)), source.total-1, upstreamChunkSize, upstreamChunkRetries)
	remaining.ctx = ctx
	remaining.fetch = source.readChunk
	return &mediaStream{
		Reader: io.MultiReader(bytes.NewReader(first), remaining), closer: remaining,
		source: source, first: first,
		total: source.total, contentType: source.contentType,
	}, nil
}

func mediaResponseRange(w http.ResponseWriter, rangeHeader string, total int64, contentType string) (int64, int64, bool) {
	start, end, status := parseRangeDetailed(rangeHeader, total)
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	if status == rangeUnsatisfiable {
		w.Header().Set("Content-Range", fmt.Sprintf("bytes */%d", total))
		w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
		return 0, 0, false
	}
	code := http.StatusOK
	if status == rangeOK {
		code = http.StatusPartialContent
		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, total))
	} else {
		// Ignore malformed and multipart ranges and serve a full response.
		// HTTP permits ignoring Range; never mislabel a full file as multipart.
		start, end = 0, total-1
	}
	w.Header().Set("Content-Length", strconv.FormatInt(end-start+1, 10))
	w.WriteHeader(code)
	return start, end, true
}

func (s *Server) serveMediaMiss(w http.ResponseWriter, r *http.Request, videoID string, videoOnly, audioOnly bool) {
	d, err := s.acquireMedia(r.Context(), videoID, videoOnly, audioOnly, ytdlpSemaphore)
	if errors.Is(err, errMediaTooLarge) {
		// Large files remain streamable but do not occupy a shared cache spool.
		stream, openErr := s.openMedia(r.Context(), videoID, videoOnly, audioOnly, ytdlpSemaphore)
		if openErr != nil {
			http.Error(w, "Upstream media unavailable", http.StatusBadGateway)
			return
		}
		defer stream.Close()
		start, end, ok := mediaResponseRange(w, r.Header.Get("Range"), stream.total, stream.contentType)
		if !ok {
			return
		}
		// Seek directly to the requested bytes through bounded upstream ranges.
		n, _ := io.Copy(w, stream.rangeReader(start, end))
		s.metrics.playback[metricFormat(videoOnly, audioOnly)].bytes[cacheMiss].Add(uint64(n))
		return
	}
	if err != nil {
		http.Error(w, "Upstream media unavailable", http.StatusBadGateway)
		return
	}
	defer d.release()
	start, end, ok := mediaResponseRange(w, r.Header.Get("Range"), d.total, d.contentType)
	if ok {
		n, err := io.Copy(w, &mediaReader{download: d, ctx: r.Context(), pos: start, end: end})
		s.metrics.playback[metricFormat(videoOnly, audioOnly)].bytes[cacheMiss].Add(uint64(n))
		if err != nil {
			log.Printf("[proxy] Reader for %s stopped: %v", d.key, err)
		}
	}
}
