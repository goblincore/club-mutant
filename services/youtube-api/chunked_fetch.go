package main

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
)

const (
	// upstreamChunkSize is how much of a media URL we request per upstream
	// call. googlevideo truncates long unbounded reads mid-transfer, so the
	// fetch has to be broken into bounded ranges. 1 MiB is large enough that
	// per-request overhead stays negligible and small enough that a retry
	// re-fetches very little.
	upstreamChunkSize = 1 << 20
	// upstreamChunkRetries is per chunk, not per stream — a truncated chunk is
	// re-requested from the same offset, so retrying is cheap and safe.
	upstreamChunkRetries = 4
)

// chunkedBody streams the byte range [start, end] from url using bounded
// ranged requests, transparently re-fetching any chunk that truncates
// mid-transfer.
//
// A single unbounded GET against googlevideo returns 200 and then simply stops
// short — no error status, just a closed connection partway through. Reading in
// bounded ranges makes each failure local and retryable, which is how yt-dlp
// gets complete files where a naive GET cannot.
//
// It implements io.ReadCloser so it can be dropped in wherever an
// http.Response.Body was used.
type chunkedBody struct {
	client    *http.Client
	url       string
	header    http.Header
	pos       int64 // next absolute byte to request
	end       int64 // last byte to deliver, inclusive
	chunkSize int64
	maxRetry  int

	buf []byte // undelivered bytes of the current chunk
	err error  // sticky terminal error
}

func newChunkedBody(client *http.Client, url string, header http.Header, start, end, chunkSize int64, maxRetry int) *chunkedBody {
	if chunkSize <= 0 {
		chunkSize = upstreamChunkSize
	}
	return &chunkedBody{
		client:    client,
		url:       url,
		header:    header.Clone(),
		pos:       start,
		end:       end,
		chunkSize: chunkSize,
		maxRetry:  maxRetry,
	}
}

func (cb *chunkedBody) Read(p []byte) (int, error) {
	if cb.err != nil {
		return 0, cb.err
	}
	if len(cb.buf) == 0 {
		if cb.pos > cb.end {
			cb.err = io.EOF
			return 0, io.EOF
		}
		if err := cb.fetchNextChunk(); err != nil {
			cb.err = err
			return 0, err
		}
	}
	n := copy(p, cb.buf)
	cb.buf = cb.buf[n:]
	return n, nil
}

func (cb *chunkedBody) Close() error {
	cb.buf = nil
	return nil
}

// fetchNextChunk buffers the next chunk whole, retrying on a short read. The
// chunk is held in memory so a retry can restart it cleanly without the caller
// ever seeing partial data.
func (cb *chunkedBody) fetchNextChunk() error {
	end := cb.pos + cb.chunkSize - 1
	if end > cb.end {
		end = cb.end
	}
	want := end - cb.pos + 1

	var lastErr error
	for attempt := 0; attempt <= cb.maxRetry; attempt++ {
		data, err := cb.fetchRange(cb.pos, end)
		if err == nil && int64(len(data)) == want {
			cb.buf = data
			cb.pos = end + 1
			return nil
		}
		if err == nil {
			err = fmt.Errorf("short chunk: got %d bytes, want %d", len(data), want)
		}
		lastErr = err
	}
	return fmt.Errorf("chunk %d-%d failed after %d attempts: %w", cb.pos, end, cb.maxRetry+1, lastErr)
}

func (cb *chunkedBody) fetchRange(start, end int64) ([]byte, error) {
	req, err := http.NewRequest("GET", cb.url, nil)
	if err != nil {
		return nil, err
	}
	for k, vs := range cb.header {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	req.Header.Set("Range", "bytes="+strconv.FormatInt(start, 10)+"-"+strconv.FormatInt(end, 10))

	resp, err := cb.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusPartialContent && resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// parseContentRangeTotal extracts the resource total from a Content-Range
// header value such as "bytes 0-1023/4096". A "*" total (unknown length)
// reports false, since the caller needs a concrete size to plan chunks.
func parseContentRangeTotal(cr string) (int64, bool) {
	const prefix = "bytes "
	if !strings.HasPrefix(cr, prefix) {
		return 0, false
	}
	slash := strings.LastIndex(cr, "/")
	if slash < 0 {
		return 0, false
	}
	total, err := strconv.ParseInt(strings.TrimSpace(cr[slash+1:]), 10, 64)
	if err != nil || total < 0 {
		return 0, false
	}
	return total, true
}

// rangeStartOffset returns the first byte offset a client Range header asks
// for, and any explicit end. Only single byte-ranges are handled; anything
// else reports ok=false so the caller can fall back to its old path.
func rangeStartOffset(header string) (start, end int64, hasEnd, ok bool) {
	if !strings.HasPrefix(header, "bytes=") {
		return 0, 0, false, false
	}
	spec := strings.TrimPrefix(header, "bytes=")
	if strings.Contains(spec, ",") || strings.HasPrefix(spec, "-") {
		return 0, 0, false, false
	}
	dash := strings.Index(spec, "-")
	if dash < 0 {
		return 0, 0, false, false
	}
	s, err := strconv.ParseInt(spec[:dash], 10, 64)
	if err != nil || s < 0 {
		return 0, 0, false, false
	}
	rest := strings.TrimSpace(spec[dash+1:])
	if rest == "" {
		return s, 0, false, true
	}
	e, err := strconv.ParseInt(rest, 10, 64)
	if err != nil || e < s {
		return 0, 0, false, false
	}
	return s, e, true, true
}
