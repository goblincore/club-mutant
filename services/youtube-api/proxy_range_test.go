package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseByteRange(t *testing.T) {
	const size = int64(1000)

	cases := []struct {
		name     string
		header   string
		wantStart int64
		wantEnd   int64
		wantOK    bool
	}{
		{"simple_range", "bytes=0-99", 0, 99, true},
		{"range_in_middle", "bytes=100-199", 100, 199, true},
		{"open_ended", "bytes=100-", 100, 999, true},
		{"open_ended_at_zero", "bytes=0-", 0, 999, true},
		{"suffix", "bytes=-500", 500, 999, true},
		{"suffix_small", "bytes=-1", 999, 999, true},
		{"single_byte", "bytes=0-0", 0, 0, true},
		{"last_byte", "bytes=999-999", 999, 999, true},
		{"end_past_size_clamps", "bytes=0-2000", 0, 999, true},
		{"end_past_size_from_middle", "bytes=500-2000", 500, 999, true},
		{"suffix_larger_than_size_clamps", "bytes=-5000", 0, 999, true},

		// Malformed / not-satisfiable cases → ok=false.
		{"empty_range", "bytes=", 0, 0, false},
		{"only_prefix", "bytes=", 0, 0, false},
		{"non_numeric", "bytes=a-b", 0, 0, false},
		{"non_numeric_left", "bytes=x-99", 0, 0, false},
		{"non_numeric_right", "bytes=0-x", 0, 0, false},
		{"wrong_unit", "items=0-1", 0, 0, false},
		{"no_dash", "bytes=0100", 0, 0, false},
		{"reverse_range", "bytes=200-100", 0, 0, false},
		{"negative_start", "bytes=-1-50", 0, 0, false},
		{"zero_suffix", "bytes=-0", 0, 0, false},
		{"multipart", "bytes=0-1,5-9", 0, 0, false},

		// Unsatisfiable cases → ok=false (caller distinguishes via parseRangeDetailed).
		{"start_at_size", "bytes=1000-", 0, 0, false},
		{"start_past_size", "bytes=999999-", 0, 0, false},
		{"start_past_size_bounded", "bytes=2000-3000", 0, 0, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			start, end, ok := parseByteRange(tc.header, size)
			if ok != tc.wantOK {
				t.Fatalf("parseByteRange(%q, %d): ok = %v, want %v", tc.header, size, ok, tc.wantOK)
			}
			if ok && (start != tc.wantStart || end != tc.wantEnd) {
				t.Errorf("parseByteRange(%q, %d): start,end = (%d,%d), want (%d,%d)",
					tc.header, size, start, end, tc.wantStart, tc.wantEnd)
			}
		})
	}
}

func TestParseRangeDetailedUnsatisfiable(t *testing.T) {
	// parseByteRange collapses unsatisfiable + malformed into ok=false.
	// Verify parseRangeDetailed distinguishes them so the proxy handler can
	// emit a proper 416.
	const size = int64(1000)
	cases := []struct {
		name       string
		header     string
		wantStatus rangeStatus
	}{
		{"none", "", rangeNone},
		{"malformed", "bytes=a-b", rangeMalformed},
		{"wrong_unit", "items=0-1", rangeMalformed},
		{"multipart", "bytes=0-1,5-9", rangeMultipart},
		{"start_at_size_open", "bytes=1000-", rangeUnsatisfiable},
		{"start_past_size_open", "bytes=999999-", rangeUnsatisfiable},
		{"start_past_size_bounded", "bytes=2000-3000", rangeUnsatisfiable},
		{"satisfiable", "bytes=100-199", rangeOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, status := parseRangeDetailed(tc.header, size)
			if status != tc.wantStatus {
				t.Fatalf("parseRangeDetailed(%q, %d): status = %v, want %v",
					tc.header, size, status, tc.wantStatus)
			}
		})
	}
}

func TestContentRangeCoversFull(t *testing.T) {
	cases := []struct {
		cr   string
		want bool
	}{
		{"bytes 0-999/1000", true},
		{"bytes 0-0/1", true},
		{"bytes 0-99/100", true},
		{"bytes 100-999/1000", false}, // doesn't start at 0
		{"bytes 0-499/1000", false},   // doesn't cover the full length
		{"bytes */1000", false},       // wildcard form
		{"bytes */0", false},
		{"", false},
		{"bytes 0-99/", false},    // missing total
		{"bytes 0-99/abc", false}, // non-numeric total
		{"bytes -99/100", false},  // missing start
		{"bytes 0/100", false},    // missing dash
		{"items 0-99/100", false}, // wrong unit
	}
	for _, tc := range cases {
		t.Run(tc.cr, func(t *testing.T) {
			got := contentRangeCoversFull(tc.cr)
			if got != tc.want {
				t.Errorf("contentRangeCoversFull(%q) = %v, want %v", tc.cr, got, tc.want)
			}
		})
	}
}

func TestHandleProxyServesRangeFromCache(t *testing.T) {
	// Seed video cache with 100 bytes (0..99).
	const size = 100
	data := make([]byte, size)
	for i := range data {
		data[i] = byte(i)
	}
	s := &Server{
		videoCache:            NewVideoCache(DefaultVideoCacheMaxSize),
		maxCacheableVideoSize: DefaultMaxCacheableVideoSize,
	}
	s.videoCache.Set("AAAAAAAAAAA:video", data)

	cases := []struct {
		name       string
		rangeHdr   string
		wantStatus int
		wantCR     string // Content-Range header; "" → don't check
		wantCL     string // Content-Length header; "" → don't check
		wantBody   []byte // expected body; nil → don't check
	}{
		{
			name:       "range_10_19",
			rangeHdr:   "bytes=10-19",
			wantStatus: http.StatusPartialContent,
			wantCR:     "bytes 10-19/100",
			wantCL:     "10",
			wantBody:   data[10:20],
		},
		{
			name:       "range_90_open",
			rangeHdr:   "bytes=90-",
			wantStatus: http.StatusPartialContent,
			wantCR:     "bytes 90-99/100",
			wantCL:     "10",
			wantBody:   data[90:100],
		},
		{
			name:       "range_to_end_clamped",
			rangeHdr:   "bytes=50-9999",
			wantStatus: http.StatusPartialContent,
			wantCR:     "bytes 50-99/100",
			wantCL:     "50",
			wantBody:   data[50:100],
		},
		{
			name:       "suffix_last_5",
			rangeHdr:   "bytes=-5",
			wantStatus: http.StatusPartialContent,
			wantCR:     "bytes 95-99/100",
			wantCL:     "5",
			wantBody:   data[95:100],
		},
		{
			name:       "suffix_larger_than_size",
			rangeHdr:   "bytes=-5000",
			wantStatus: http.StatusPartialContent,
			wantCR:     "bytes 0-99/100",
			wantCL:     "100",
			wantBody:   data[0:100],
		},
		{
			name:       "single_byte",
			rangeHdr:   "bytes=0-0",
			wantStatus: http.StatusPartialContent,
			wantCR:     "bytes 0-0/100",
			wantCL:     "1",
			wantBody:   data[0:1],
		},
		{
			name:       "unsatisfiable",
			rangeHdr:   "bytes=999999-",
			wantStatus: http.StatusRequestedRangeNotSatisfiable,
			wantCR:     "bytes */100",
		},
		{
			name:       "malformed_ignored_serves_full",
			rangeHdr:   "bytes=a-b",
			wantStatus: http.StatusOK,
			wantCL:     "100",
			wantBody:   data,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/proxy/AAAAAAAAAAA", nil)
			if tc.rangeHdr != "" {
				req.Header.Set("Range", tc.rangeHdr)
			}
			rec := httptest.NewRecorder()
			s.handleProxy(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d (body=%q)", rec.Code, tc.wantStatus, rec.Body.String())
			}
			if tc.wantCR != "" {
				if got := rec.Header().Get("Content-Range"); got != tc.wantCR {
					t.Errorf("Content-Range = %q, want %q", got, tc.wantCR)
				}
			}
			if tc.wantCL != "" {
				if got := rec.Header().Get("Content-Length"); got != tc.wantCL {
					t.Errorf("Content-Length = %q, want %q", got, tc.wantCL)
				}
			}
			if tc.wantBody != nil {
				if !bytes.Equal(rec.Body.Bytes(), tc.wantBody) {
					t.Errorf("body len=%d (%v), want len=%d (%v)",
						rec.Body.Len(), rec.Body.Bytes()[:min(8, rec.Body.Len())],
						len(tc.wantBody), tc.wantBody[:min(8, len(tc.wantBody))])
				}
			}			// Cache hits should always advertise range support + cache-control.
			if got := rec.Header().Get("Accept-Ranges"); got != "bytes" {
				t.Errorf("Accept-Ranges = %q, want %q", got, "bytes")
			}
			if got := rec.Header().Get("Cache-Control"); got != "public, max-age=3600" {
				t.Errorf("Cache-Control = %q, want %q", got, "public, max-age=3600")
			}
		})
	}
}

func TestHandleProxyServesFullFromCacheNoRange(t *testing.T) {
	data := []byte("hello world this is cached video data")
	s := &Server{
		videoCache:            NewVideoCache(DefaultVideoCacheMaxSize),
		maxCacheableVideoSize: DefaultMaxCacheableVideoSize,
	}
	s.videoCache.Set("AAAAAAAAAAA:video", data)

	req := httptest.NewRequest("GET", "/proxy/AAAAAAAAAAA", nil)
	rec := httptest.NewRecorder()
	s.handleProxy(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Content-Length"); got != "37" {
		t.Errorf("Content-Length = %q, want %q", got, "37")
	}
	if !bytes.Equal(rec.Body.Bytes(), data) {
		t.Errorf("body = %q, want %q", rec.Body.String(), string(data))
	}
}