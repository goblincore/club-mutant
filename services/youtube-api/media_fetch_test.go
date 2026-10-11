package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const mediaTestID = "AAAAAAAAAAA"

func mediaTestServer(t *testing.T, upstream string) *Server {
	t.Helper()
	disk, err := NewDiskCache(t.TempDir(), 64*1024*1024)
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{
		videoCache:            NewVideoCache(DefaultVideoCacheMaxSize),
		resolveCache:          &ResolveCache{entries: make(map[string]ResolveCacheEntry)},
		diskCache:             disk,
		maxCacheableVideoSize: DefaultMaxCacheableVideoSize,
	}
	for _, key := range []string{mediaTestID, mediaTestID + ":video", mediaTestID + ":audio"} {
		s.resolveCache.Set(key, ResolveResponse{VideoID: mediaTestID, URL: upstream}, time.Hour)
	}
	t.Cleanup(func() {
		// A partial range can finish before its shared worker observes the last
		// reader leaving. Wait for cleanup before t.TempDir removes its volume.
		waitMediaCondition(t, func() bool {
			entries, err := os.ReadDir(filepath.Join(s.diskCache.dir, "inflight"))
			return os.IsNotExist(err) || (err == nil && len(entries) == 0)
		})
	})
	return s
}

func waitMediaCondition(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.After(3 * time.Second)
	tick := time.NewTicker(time.Millisecond)
	defer tick.Stop()
	for !condition() {
		select {
		case <-deadline:
			t.Fatal("timed out waiting for media operation")
		case <-tick.C:
		}
	}
}

func assertMediaNotCached(t *testing.T, s *Server, key string) {
	t.Helper()
	if _, ok := s.videoCache.Get(key); ok {
		t.Fatal("incomplete media was cached in memory")
	}
	if _, ok := s.diskCache.Get(key); ok {
		t.Fatal("incomplete media was cached on disk")
	}
}

func TestPrefetchUsesBoundedChunksAndRetriesForVideoAndAudio(t *testing.T) {
	body := bytes.Repeat([]byte("abcdefghij"), 220000)
	for _, audioOnly := range []bool{false, true} {
		t.Run(fmt.Sprint("audio=", audioOnly), func(t *testing.T) {
			rs := newRangeServer(body, true)
			upstream := httptest.NewServer(rs)
			defer upstream.Close()
			s := mediaTestServer(t, upstream.URL)
			got, err := s.prefetchMedia(context.Background(), mediaTestID, !audioOnly, audioOnly)
			if err != nil || !bytes.Equal(got, body) {
				t.Fatalf("prefetch returned %d bytes, err=%v", len(got), err)
			}
			key := mediaCacheKey(mediaTestID, !audioOnly, audioOnly)
			cached, ok := s.diskCache.Get(key)
			if !ok || !bytes.Equal(cached, body) {
				t.Fatal("prefetch did not commit the complete resource")
			}
			rs.mu.Lock()
			defer rs.mu.Unlock()
			if rs.requests != 6 {
				t.Fatalf("got %d upstream calls, want three chunks with one retry each", rs.requests)
			}
		})
	}
}

type mediaRoundTripFunc func(*http.Request) (*http.Response, error)

func (f mediaRoundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestPrefetchRefreshes403AndSwitchesHTTPRoute(t *testing.T) {
	for _, late := range []bool{false, true} {
		t.Run(fmt.Sprint("late=", late), func(t *testing.T) {
			body := bytes.Repeat([]byte("0123456789"), 120000)
			good := newRangeServer(body, false)
			direct := httptest.NewServer(good)
			defer direct.Close()
			proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if !late || !strings.HasPrefix(r.Header.Get("Range"), "bytes=0-") {
					w.WriteHeader(http.StatusForbidden)
					return
				}
				good.ServeHTTP(w, r)
			}))
			defer proxy.Close()
			s := mediaTestServer(t, proxy.URL+"?itag=160")
			s.resolveCache.Set(mediaTestID+":video", ResolveResponse{URL: proxy.URL + "?itag=160", ResolvedViaProxy: true}, time.Hour)
			var proxyCalls, directCalls, refreshes atomic.Int32
			base := http.DefaultTransport
			s.proxyMediaClient = &http.Client{Transport: mediaRoundTripFunc(func(r *http.Request) (*http.Response, error) {
				proxyCalls.Add(1)
				if strings.HasPrefix(r.URL.String(), direct.URL) {
					return nil, errors.New("direct token-bound URL used the proxy transport")
				}
				return base.RoundTrip(r)
			})}
			s.directMediaClient = &http.Client{Transport: mediaRoundTripFunc(func(r *http.Request) (*http.Response, error) {
				directCalls.Add(1)
				return base.RoundTrip(r)
			})}
			s.mediaResolver = func(ctx context.Context, id string, vo, ao, fresh bool, sem chan struct{}) (*ResolveResponse, error) {
				if !fresh || sem != prefetchSemaphore {
					return nil, errors.New("prefetch did not use its fallback/worker budget")
				}
				refreshes.Add(1)
				return &ResolveResponse{URL: direct.URL + "?itag=160"}, nil
			}
			got, err := s.prefetchMedia(context.Background(), mediaTestID, true, false)
			if err != nil || !bytes.Equal(got, body) {
				t.Fatalf("fallback failed: %v, got %d bytes", err, len(got))
			}
			if proxyCalls.Load() < 1 || directCalls.Load() < 1 || refreshes.Load() != 1 {
				t.Fatal("expected exactly one refresh from proxy to direct route")
			}
			cached, _ := s.resolveCache.Get(mediaTestID + ":video")
			if cached.ResolvedViaProxy {
				t.Fatal("refreshed URL retained the old route")
			}
			x := s.metricsSnapshot()
			if x.Upstream[3].Requests != uint64(proxyCalls.Load()) || x.Upstream[0].Requests != uint64(directCalls.Load()) || x.Upstream[3].Forbidden != 1 || x.Upstream[3].Errors != 1 || x.URLRefreshes != 1 || x.URLRefreshSuccesses != 1 {
				t.Fatalf("fallback traffic attributed to the wrong route: %+v", x)
			}
			if x.Upstream[3].Bytes+x.Upstream[0].Bytes != uint64(len(body)) {
				t.Fatal("fallback byte accounting differs from downloaded media")
			}
		})
	}
}

func TestProxyAndPrefetchNeverCacheFailedTransfer(t *testing.T) {
	body := bytes.Repeat([]byte("x"), 2*upstreamChunkSize+100)
	for _, prefetch := range []bool{false, true} {
		t.Run(fmt.Sprint("prefetch=", prefetch), func(t *testing.T) {
			good := newRangeServer(body, false)
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if strings.HasPrefix(r.Header.Get("Range"), "bytes=0-") {
					good.ServeHTTP(w, r)
					return
				}
				// A clean EOF with fewer bytes than the advertised range.
				w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", upstreamChunkSize, 2*upstreamChunkSize-1, len(body)))
				w.WriteHeader(http.StatusPartialContent)
				w.Write([]byte("short"))
			}))
			defer upstream.Close()
			s := mediaTestServer(t, upstream.URL)
			if prefetch {
				if _, err := s.prefetchMedia(context.Background(), mediaTestID, true, false); err == nil {
					t.Fatal("truncated prefetch reported success")
				}
			} else {
				w := httptest.NewRecorder()
				s.handleProxy(w, httptest.NewRequest("GET", "/proxy/"+mediaTestID, nil))
				if w.Body.Len() != upstreamChunkSize {
					t.Fatalf("expected the validated first chunk to stream, got %d bytes", w.Body.Len())
				}
			}
			assertMediaNotCached(t, s, mediaTestID+":video")
		})
	}
}

func TestSharedDownloadStreamsBeforeCompletionAndSurvivesOneCancellation(t *testing.T) {
	body := bytes.Repeat([]byte("abcdef"), 400000)
	rs := newRangeServer(body, false)
	blocked, unblock := make(chan struct{}), make(chan struct{})
	var once sync.Once
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Range"), "bytes=0-") {
			once.Do(func() { close(blocked) })
			select {
			case <-unblock:
			case <-r.Context().Done():
				return
			}
		}
		rs.ServeHTTP(w, r)
	}))
	defer upstream.Close()
	defer func() {
		select {
		case <-unblock:
		default:
			close(unblock)
		}
	}()
	s := mediaTestServer(t, upstream.URL)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	first, err := s.acquireMedia(ctx, mediaTestID, true, false, ytdlpSemaphore)
	if err != nil {
		t.Fatal(err)
	}
	firstReader := &mediaReader{download: first, ctx: ctx, end: first.total - 1}
	initial := make([]byte, 128)
	if _, err := io.ReadFull(firstReader, initial); err != nil || !bytes.Equal(initial, body[:128]) {
		t.Fatalf("playback didn't start before completion: %v", err)
	}
	select {
	case <-blocked:
	case <-time.After(3 * time.Second):
		t.Fatal("download never reached second chunk")
	}
	second, err := s.acquireMedia(context.Background(), mediaTestID, true, false, ytdlpSemaphore)
	if err != nil {
		t.Fatal(err)
	}
	defer second.release()
	if first != second {
		t.Fatal("viewers started separate downloads")
	}
	prefetched := make(chan error, 1)
	go func() {
		data, err := s.prefetchMedia(context.Background(), mediaTestID, true, false)
		if err == nil && !bytes.Equal(data, body) {
			err = errors.New("prefetch content mismatch")
		}
		prefetched <- err
	}()
	waitMediaCondition(t, func() bool { s.downloadMu.Lock(); defer s.downloadMu.Unlock(); return second.readers == 3 })
	cancel()
	if _, err := firstReader.Read(initial); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled reader: %v", err)
	}
	first.release()
	if second.ctx.Err() != nil {
		t.Fatal("one reader canceled the shared upstream")
	}
	close(unblock)
	got, err := io.ReadAll(&mediaReader{download: second, ctx: context.Background(), end: second.total - 1})
	if err != nil || !bytes.Equal(got, body) {
		t.Fatalf("remaining viewer failed: %v", err)
	}
	if err := <-prefetched; err != nil {
		t.Fatal(err)
	}
	cached, ok := s.diskCache.Get(mediaTestID + ":video")
	if !ok || !bytes.Equal(cached, body) {
		t.Fatal("shared download wasn't cached in full")
	}
	rs.mu.Lock()
	defer rs.mu.Unlock()
	if rs.requests != 3 {
		t.Fatalf("three readers made %d upstream calls; want one call per chunk", rs.requests)
	}
	x := s.metricsSnapshot()
	if x.Downloads.Started != 1 || x.Downloads.Joined != 2 || x.Downloads.Completed != 1 || x.Upstream[0].Bytes != uint64(len(body)) {
		t.Fatalf("shared work was counted once per reader: %+v", x)
	}
}

func TestLastReaderCancellationStopsUpstreamAndRemovesSpool(t *testing.T) {
	body := bytes.Repeat([]byte("x"), 2*upstreamChunkSize)
	rs := newRangeServer(body, false)
	blocked, canceled := make(chan struct{}), make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Range"), "bytes=0-") {
			close(blocked)
			<-r.Context().Done()
			close(canceled)
			return
		}
		rs.ServeHTTP(w, r)
	}))
	defer upstream.Close()
	s := mediaTestServer(t, upstream.URL)
	d, err := s.acquireMedia(context.Background(), mediaTestID, true, false, ytdlpSemaphore)
	if err != nil {
		t.Fatal(err)
	}
	name := d.file.Name()
	select {
	case <-blocked:
	case <-time.After(3 * time.Second):
		t.Fatal("no pending upstream request")
	}
	d.release()
	select {
	case <-canceled:
	case <-time.After(3 * time.Second):
		t.Fatal("upstream request wasn't canceled")
	}
	waitMediaCondition(t, func() bool { _, err := os.Stat(name); return os.IsNotExist(err) })
	assertMediaNotCached(t, s, mediaTestID+":video")
	if x := s.metricsSnapshot(); x.Downloads.Canceled != 1 || x.Downloads.Failed != 0 {
		t.Fatalf("last-reader cancellation counted as failure: %+v", x.Downloads)
	}
}

func TestOversizedMediaStreamsAndSeeksWithoutCaching(t *testing.T) {
	body := bytes.Repeat([]byte("abcdefghij"), 330000)
	for _, rangeHeader := range []string{"", "bytes=-10"} {
		t.Run(rangeHeader, func(t *testing.T) {
			rs := newRangeServer(body, false)
			upstream := httptest.NewServer(rs)
			defer upstream.Close()
			s := mediaTestServer(t, upstream.URL)
			s.maxCacheableVideoSize = 100
			req := httptest.NewRequest("GET", "/proxy/"+mediaTestID, nil)
			req.Header.Set("Range", rangeHeader)
			w := httptest.NewRecorder()
			s.handleProxy(w, req)
			want := body
			if rangeHeader != "" {
				want = body[len(body)-10:]
			}
			if !bytes.Equal(w.Body.Bytes(), want) {
				t.Fatalf("oversized stream got %d bytes, want %d", w.Body.Len(), len(want))
			}
			assertMediaNotCached(t, s, mediaTestID+":video")
			if rangeHeader != "" {
				rs.mu.Lock()
				requests := rs.requests
				rs.mu.Unlock()
				if requests != 3 {
					t.Fatalf("seek fetched %d chunks; want two metadata probes and the tail", requests)
				}
			}
			if _, err := s.prefetchMedia(context.Background(), mediaTestID, true, false); !errors.Is(err, errMediaTooLarge) {
				t.Fatalf("oversized prefetch: %v", err)
			}
		})
	}
}

func TestColdProxyRangeResponses(t *testing.T) {
	body := []byte("abcdefghijklmnopqrstuvwxyz")
	for _, tc := range []struct {
		header string
		code   int
		want   []byte
	}{
		{"bytes=5-9", 206, body[5:10]},
		{"bytes=-5", 206, body[len(body)-5:]},
		{"bytes=5-", 206, body[5:]},
		{"bytes=999-", 416, nil},
		{"bad", 200, body},
		{"bytes=0-1,5-9", 200, body},
	} {
		t.Run(tc.header, func(t *testing.T) {
			upstream := httptest.NewServer(newRangeServer(body, false))
			defer upstream.Close()
			s := mediaTestServer(t, upstream.URL)
			req := httptest.NewRequest("GET", "/proxy/"+mediaTestID, nil)
			req.Header.Set("Range", tc.header)
			w := httptest.NewRecorder()
			s.handleProxy(w, req)
			if w.Code != tc.code || !bytes.Equal(w.Body.Bytes(), tc.want) {
				t.Fatalf("got %d %q, want %d %q", w.Code, w.Body.Bytes(), tc.code, tc.want)
			}
		})
	}
}

func TestReadMediaChunkRejectsWrongRangesAndLengths(t *testing.T) {
	for _, tc := range []struct {
		name, cr, body            string
		code                      int
		length, start, end, total int64
	}{
		{"wrong_offset", "bytes 1-4/10", "abcd", 206, 4, 0, 3, 0},
		{"changed_total", "bytes 0-3/11", "abcd", 206, 4, 0, 3, 10},
		{"short_clean_eof", "bytes 0-3/10", "ab", 206, -1, 0, 3, 0},
		{"extra_bytes", "bytes 0-3/10", "abcde", 206, -1, 0, 3, 0},
		{"unknown_total", "bytes 0-3/*", "abcd", 206, 4, 0, 3, 0},
		{"range_ignored", "", "abcdefghij", 200, 10, 0, 3, 0},
		{"range_ignored_at_offset", "", "abcd", 200, 4, 4, 7, 0},
		{"error_body", "", "error", 500, 5, 0, 3, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp := &http.Response{StatusCode: tc.code, ContentLength: tc.length, Header: http.Header{"Content-Range": []string{tc.cr}}, Body: io.NopCloser(strings.NewReader(tc.body))}
			if _, _, err := readMediaChunk(resp, tc.start, tc.end, tc.total); err == nil {
				t.Fatal("invalid chunk was accepted")
			}
		})
	}
}

func TestResolverSemaphoreWaitIsCancelable(t *testing.T) {
	sem := make(chan struct{}, 1)
	sem <- struct{}{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := &Server{}
	if _, err := s.resolveWithYtDlpInternalContext(ctx, mediaTestID, true, false, false, sem); !errors.Is(err, context.Canceled) {
		t.Fatalf("semaphore wait: %v", err)
	}
}

func TestSmall200MustMatchIndependentlyKnownResourceSize(t *testing.T) {
	body := []byte("small complete file")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", fmt.Sprint(len(body)))
		w.Write(body)
	}))
	defer upstream.Close()
	for _, advertisedSize := range []int{0, len(body), len(body) + 1} {
		t.Run(fmt.Sprint(advertisedSize), func(t *testing.T) {
			s := mediaTestServer(t, fmt.Sprintf("%s?clen=%d", upstream.URL, advertisedSize))
			data, err := s.prefetchMedia(context.Background(), mediaTestID, true, false)
			if advertisedSize == len(body) {
				if err != nil || !bytes.Equal(data, body) {
					t.Fatalf("known complete resource rejected: %v", err)
				}
			} else {
				if err == nil {
					t.Fatal("unverified or shortened 200 was accepted as complete")
				}
				assertMediaNotCached(t, s, mediaTestID+":video")
			}
		})
	}
}

type failingMediaWriter struct{ *httptest.ResponseRecorder }

func (w failingMediaWriter) Write(p []byte) (int, error) { return 0, errors.New("viewer disconnected") }

func TestClientWriteFailureDoesNotPublishPartialCache(t *testing.T) {
	body := bytes.Repeat([]byte("x"), 2*upstreamChunkSize)
	rs := newRangeServer(body, false)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Range"), "bytes=0-") {
			<-r.Context().Done()
			return
		}
		rs.ServeHTTP(w, r)
	}))
	defer upstream.Close()
	s := mediaTestServer(t, upstream.URL)
	s.handleProxy(failingMediaWriter{httptest.NewRecorder()}, httptest.NewRequest("GET", "/proxy/"+mediaTestID, nil))
	waitMediaCondition(t, func() bool {
		entries, err := os.ReadDir(filepath.Join(s.diskCache.dir, "inflight"))
		return err == nil && len(entries) == 0
	})
	assertMediaNotCached(t, s, mediaTestID+":video")
}

func TestSuccessfulProxyCommitsFullResourceBeforeFinishing(t *testing.T) {
	body := bytes.Repeat([]byte("abcdef"), 200000)
	upstream := httptest.NewServer(newRangeServer(body, false))
	defer upstream.Close()
	s := mediaTestServer(t, upstream.URL)
	w := httptest.NewRecorder()
	s.handleProxy(w, httptest.NewRequest("GET", "/proxy/"+mediaTestID, nil))
	if !bytes.Equal(w.Body.Bytes(), body) {
		t.Fatal("playback content mismatch")
	}
	if cached, ok := s.diskCache.Get(mediaTestID + ":video"); !ok || !bytes.Equal(cached, body) {
		t.Fatal("successful playback did not publish the full file")
	}
}

func TestRefreshCannotMixFormatsMidStream(t *testing.T) {
	body := bytes.Repeat([]byte("x"), 2*upstreamChunkSize)
	rs := newRangeServer(body, false)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.Header.Get("Range"), "bytes=0-") {
			rs.ServeHTTP(w, r)
		} else {
			w.WriteHeader(403)
		}
	}))
	defer upstream.Close()
	s := mediaTestServer(t, upstream.URL+"?itag=160")
	s.mediaResolver = func(context.Context, string, bool, bool, bool, chan struct{}) (*ResolveResponse, error) {
		return &ResolveResponse{URL: upstream.URL + "?itag=133"}, nil
	}
	if _, err := s.prefetchMedia(context.Background(), mediaTestID, true, false); err == nil {
		t.Fatal("format change was accepted mid-stream")
	}
	assertMediaNotCached(t, s, mediaTestID+":video")
}

func TestDiskCacheRestartDiscardsSpoolsAndKeepsCompleteEntries(t *testing.T) {
	dir := t.TempDir()
	dc, err := NewDiskCache(dir, 1024)
	if err != nil {
		t.Fatal(err)
	}
	dc.Set(mediaTestID+":video", []byte("complete"))
	spoolDir := filepath.Join(dir, "inflight")
	if err := os.MkdirAll(spoolDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(spoolDir, "youtube-download-stale.tmp"), []byte("partial"), 0600); err != nil {
		t.Fatal(err)
	}
	restarted, err := NewDiskCache(dir, 1024)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(spoolDir); !os.IsNotExist(err) {
		t.Fatal("stale spool survived restart")
	}
	if data, ok := restarted.Get(mediaTestID + ":video"); !ok || string(data) != "complete" {
		t.Fatal("restart lost completed entry")
	}
}

func TestPrefetchQueueProducesAudioAnalysisAndCorrectCachedMIME(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg unavailable")
	}
	for _, format := range []struct{ ext, codec, mime string }{
		{"m4a", "aac", "audio/mp4"},
		{"webm", "libopus", "audio/webm"},
	} {
		t.Run(format.ext, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "fixture."+format.ext)
			cmd := exec.Command("ffmpeg", "-hide_banner", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2", "-c:a", format.codec, path)
			if out, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("generate audio: %v %s", err, out)
			}
			audio, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			videoRanges := newRangeServer([]byte("video bytes"), false)
			audioRanges := newRangeServer(audio, false)
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/audio" {
					w.Header().Set("Content-Type", format.mime)
					audioRanges.ServeHTTP(w, r)
				} else {
					videoRanges.ServeHTTP(w, r)
				}
			}))
			defer upstream.Close()
			s := mediaTestServer(t, upstream.URL)
			s.resolveCache.Set(mediaTestID+":audio", ResolveResponse{URL: upstream.URL + "/audio"}, time.Hour)
			// Playback has already cached the video, but its audio is missing.
			s.videoCache.Set(mediaTestID+":video", []byte("video bytes"))
			pq := NewPrefetchQueue(s, 1)
			defer pq.Stop()
			if !pq.Enqueue(mediaTestID, PriorityHigh) {
				t.Fatal("cached video blocked missing audio prefetch")
			}
			pq.processJob(0, pq.dequeue())
			if pq.Stats().CompletedCount != 1 {
				t.Fatal("prefetch job did not complete")
			}
			if pq.Enqueue(mediaTestID, PriorityHigh) {
				t.Fatal("fully cached media was enqueued again")
			}
			w := httptest.NewRecorder()
			s.handleProxy(w, httptest.NewRequest("GET", "/proxy/"+mediaTestID+"?audioOnly=true", nil))
			if w.Header().Get("Content-Type") != format.mime || !bytes.Equal(w.Body.Bytes(), audio) {
				t.Fatal("cached audio format or content mismatch")
			}
			analysis := httptest.NewRecorder()
			analysisRequest := httptest.NewRequest("GET", "/analysis/"+mediaTestID, nil)
			analysisRequest.SetPathValue("videoId", mediaTestID)
			s.handleAnalysis(analysis, analysisRequest)
			if analysis.Code != 200 || !strings.Contains(analysis.Body.String(), "frameCount") {
				t.Fatalf("analysis unavailable: %d %s", analysis.Code, analysis.Body.String())
			}
		})
	}
}
