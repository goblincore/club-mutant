package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
)

// rangeServer serves `body` over byte-range requests. When truncateFirst is
// set, the first attempt at each distinct range writes only half the bytes and
// then aborts the connection — reproducing the mid-transfer truncation
// googlevideo does to unbounded/long reads.
type rangeServer struct {
	body          []byte
	truncateFirst bool

	mu       sync.Mutex
	seen     map[string]int
	requests int
}

func newRangeServer(body []byte, truncateFirst bool) *rangeServer {
	return &rangeServer{body: body, truncateFirst: truncateFirst, seen: map[string]int{}}
}

func (rs *rangeServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rng := r.Header.Get("Range")
	var start, end int64
	if _, err := fmt.Sscanf(rng, "bytes=%d-%d", &start, &end); err != nil {
		http.Error(w, "bad range", http.StatusBadRequest)
		return
	}
	if end >= int64(len(rs.body)) {
		end = int64(len(rs.body)) - 1
	}
	chunk := rs.body[start : end+1]

	rs.mu.Lock()
	rs.requests++
	rs.seen[rng]++
	attempt := rs.seen[rng]
	rs.mu.Unlock()

	w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, len(rs.body)))
	w.Header().Set("Content-Length", strconv.Itoa(len(chunk)))
	w.WriteHeader(http.StatusPartialContent)

	if rs.truncateFirst && attempt == 1 {
		w.Write(chunk[:len(chunk)/2])
		// Abort so the client sees a short read rather than a clean EOF.
		panic(http.ErrAbortHandler)
	}
	w.Write(chunk)
}

func TestChunkedBodyReadsFullResourceAcrossChunks(t *testing.T) {
	body := bytes.Repeat([]byte("abcdefghij"), 5000) // 50,000 bytes
	rs := newRangeServer(body, false)
	srv := httptest.NewServer(rs)
	defer srv.Close()

	cb := newChunkedBody(srv.Client(), srv.URL, http.Header{}, 0, int64(len(body))-1, 8000, 3)
	defer cb.Close()

	got, err := io.ReadAll(cb)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	if !bytes.Equal(got, body) {
		t.Errorf("got %d bytes, want %d (content mismatch: %v)", len(got), len(body), !bytes.Equal(got, body))
	}
	if rs.requests < 6 {
		t.Errorf("made %d requests, expected the body to be split into ~7 chunks", rs.requests)
	}
}

// The whole point: a chunk that truncates mid-transfer must be retried, and
// the caller must still see a complete, correct stream.
func TestChunkedBodyRetriesTruncatedChunk(t *testing.T) {
	body := bytes.Repeat([]byte("0123456789"), 3000) // 30,000 bytes
	rs := newRangeServer(body, true)
	srv := httptest.NewServer(rs)
	defer srv.Close()

	cb := newChunkedBody(srv.Client(), srv.URL, http.Header{}, 0, int64(len(body))-1, 10000, 3)
	defer cb.Close()

	got, err := io.ReadAll(cb)
	if err != nil {
		t.Fatalf("ReadAll after retries: %v", err)
	}
	if !bytes.Equal(got, body) {
		t.Errorf("got %d bytes, want %d", len(got), len(body))
	}
}

func TestChunkedBodyGivesUpAfterMaxRetries(t *testing.T) {
	body := bytes.Repeat([]byte("x"), 20000)
	// truncateFirst with seen-count never reset would still succeed on attempt
	// 2; use a server that always truncates instead.
	always := &alwaysTruncateServer{body: body}
	srv := httptest.NewServer(always)
	defer srv.Close()

	cb := newChunkedBody(srv.Client(), srv.URL, http.Header{}, 0, int64(len(body))-1, 10000, 2)
	defer cb.Close()

	_, err := io.ReadAll(cb)
	if err == nil {
		t.Fatal("expected an error once retries are exhausted, got nil")
	}
	if !strings.Contains(err.Error(), "chunk") {
		t.Errorf("error %q should mention the failing chunk", err)
	}
}

type alwaysTruncateServer struct{ body []byte }

func (a *alwaysTruncateServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var start, end int64
	fmt.Sscanf(r.Header.Get("Range"), "bytes=%d-%d", &start, &end)
	if end >= int64(len(a.body)) {
		end = int64(len(a.body)) - 1
	}
	chunk := a.body[start : end+1]
	w.Header().Set("Content-Length", strconv.Itoa(len(chunk)))
	w.WriteHeader(http.StatusPartialContent)
	w.Write(chunk[:len(chunk)/2])
	panic(http.ErrAbortHandler)
}

func TestChunkedBodyPassesThroughRequestHeaders(t *testing.T) {
	var gotUA string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUA = r.Header.Get("User-Agent")
		w.Header().Set("Content-Length", "1")
		w.WriteHeader(http.StatusPartialContent)
		w.Write([]byte("x"))
	}))
	defer srv.Close()

	h := http.Header{}
	h.Set("User-Agent", "test-agent/1.0")
	cb := newChunkedBody(srv.Client(), srv.URL, h, 0, 0, 10, 1)
	defer cb.Close()

	if _, err := io.ReadAll(cb); err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	if gotUA != "test-agent/1.0" {
		t.Errorf("upstream User-Agent = %q, want the template header to be forwarded", gotUA)
	}
}

func TestParseContentRangeTotal(t *testing.T) {
	cases := []struct {
		cr     string
		want   int64
		wantOK bool
	}{
		{"bytes 0-1023/4096", 4096, true},
		{"bytes 500-999/1000", 1000, true},
		{"bytes 0-0/2788518", 2788518, true},
		{"bytes 0-1023/*", 0, false},
		{"", 0, false},
		{"garbage", 0, false},
	}
	for _, tc := range cases {
		got, ok := parseContentRangeTotal(tc.cr)
		if ok != tc.wantOK || got != tc.want {
			t.Errorf("parseContentRangeTotal(%q) = (%d, %v), want (%d, %v)", tc.cr, got, ok, tc.want, tc.wantOK)
		}
	}
}

func TestRangeStartOffset(t *testing.T) {
	cases := []struct {
		in         string
		start, end int64
		hasEnd, ok bool
	}{
		{"bytes=0-", 0, 0, false, true},
		{"bytes=500-", 500, 0, false, true},
		{"bytes=0-1023", 0, 1023, true, true},
		{"bytes=100-200", 100, 200, true, true},
		{"bytes=-500", 0, 0, false, false},       // suffix ranges unsupported
		{"bytes=0-10,20-30", 0, 0, false, false}, // multipart unsupported
		{"", 0, 0, false, false},
		{"bytes=abc-", 0, 0, false, false},
		{"bytes=200-100", 0, 0, false, false}, // end before start
	}
	for _, tc := range cases {
		s, e, hasEnd, ok := rangeStartOffset(tc.in)
		if s != tc.start || e != tc.end || hasEnd != tc.hasEnd || ok != tc.ok {
			t.Errorf("rangeStartOffset(%q) = (%d,%d,%v,%v), want (%d,%d,%v,%v)",
				tc.in, s, e, hasEnd, ok, tc.start, tc.end, tc.hasEnd, tc.ok)
		}
	}
}
