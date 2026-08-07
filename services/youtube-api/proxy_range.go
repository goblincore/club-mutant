package main

import (
	"strconv"
	"strings"
)

// rangeStatus describes how the caller should handle a parsed Range header.
type rangeStatus int

const (
	// rangeNone: no Range header present — serve full 200.
	rangeNone rangeStatus = iota
	// rangeMalformed: syntactically invalid — per RFC 7233, ignore and serve full 200.
	rangeMalformed
	// rangeMultipart: multipart range (e.g. "bytes=0-1,5-9") — caller should pass
	// the request through to upstream unchanged.
	rangeMultipart
	// rangeUnsatisfiable: syntactically valid single range but start >= size —
	// respond 416 with Content-Range: bytes */<size>.
	rangeUnsatisfiable
	// rangeOK: satisfiable single range — respond 206 with the inclusive [start,end] slice.
	rangeOK
)

// parseRangeDetailed parses a Range header value against a resource of the given
// size. It returns the inclusive [start, end] byte range (valid when status ==
// rangeOK) and a status code describing how the caller should handle the result.
//
// Supported forms:
//   - "bytes=X-Y"  → bytes X through Y inclusive
//   - "bytes=X-"   → bytes X through the end
//   - "bytes=-N"   → the last N bytes (suffix range)
//
// Multipart ranges ("bytes=0-1,5-9") are detected and surfaced as rangeMultipart
// so the caller can pass them through to the upstream proxy. The end value is
// clamped to size-1 when it exceeds the resource; suffix ranges larger than the
// resource clamp to the full resource.
func parseRangeDetailed(header string, size int64) (start, end int64, status rangeStatus) {
	header = strings.TrimSpace(header)
	if header == "" {
		return 0, 0, rangeNone
	}
	if !strings.HasPrefix(header, "bytes=") {
		return 0, 0, rangeMalformed
	}
	spec := strings.TrimPrefix(header, "bytes=")
	if strings.Contains(spec, ",") {
		return 0, 0, rangeMultipart
	}
	dash := strings.IndexByte(spec, '-')
	if dash < 0 {
		return 0, 0, rangeMalformed
	}
	left := strings.TrimSpace(spec[:dash])
	right := strings.TrimSpace(spec[dash+1:])

	if left == "" {
		// Suffix range: bytes=-N (last N bytes).
		if right == "" {
			return 0, 0, rangeMalformed
		}
		n, err := strconv.ParseInt(right, 10, 64)
		if err != nil || n <= 0 {
			return 0, 0, rangeMalformed
		}
		if size <= 0 {
			return 0, 0, rangeUnsatisfiable
		}
		if n >= size {
			return 0, size - 1, rangeOK
		}
		return size - n, size - 1, rangeOK
	}

	startNum, err := strconv.ParseInt(left, 10, 64)
	if err != nil || startNum < 0 {
		return 0, 0, rangeMalformed
	}

	if right == "" {
		// Open-ended: bytes=X- → X to end.
		if size <= 0 || startNum >= size {
			return 0, 0, rangeUnsatisfiable
		}
		return startNum, size - 1, rangeOK
	}

	endNum, err := strconv.ParseInt(right, 10, 64)
	if err != nil || endNum < 0 {
		return 0, 0, rangeMalformed
	}
	if startNum > endNum {
		return 0, 0, rangeMalformed
	}
	if size <= 0 || startNum >= size {
		return 0, 0, rangeUnsatisfiable
	}
	if endNum >= size {
		endNum = size - 1
	}
	return startNum, endNum, rangeOK
}

// parseByteRange is the simplified Range parser.
// It returns (start, end, true) for a satisfiable single range (end inclusive),
// or (0, 0, false) for empty / malformed / multipart / unsatisfiable ranges.
// Callers that need to distinguish between those cases should use parseRangeDetailed.
func parseByteRange(header string, size int64) (start, end int64, ok bool) {
	s, e, status := parseRangeDetailed(header, size)
	if status != rangeOK {
		return 0, 0, false
	}
	return s, e, true
}

// contentRangeCoversFull reports whether a Content-Range header value describes a
// 206 response that carries the entire resource starting at byte 0 — i.e. the
// form "bytes 0-<last>/<total>" with last+1 == total. Such responses are produced
// for "Range: bytes=0-" requests and are safe to cache as the full resource.
func contentRangeCoversFull(cr string) bool {
	cr = strings.TrimSpace(cr)
	const prefix = "bytes "
	if !strings.HasPrefix(cr, prefix) {
		return false
	}
	rest := strings.TrimPrefix(cr, prefix)
	slash := strings.IndexByte(rest, '/')
	if slash < 0 {
		return false
	}
	rangePart := rest[:slash]
	totalStr := rest[slash+1:]
	total, err := strconv.ParseInt(totalStr, 10, 64)
	if err != nil || total <= 0 {
		return false
	}
	dash := strings.IndexByte(rangePart, '-')
	if dash < 0 {
		return false
	}
	startStr := rangePart[:dash]
	endStr := rangePart[dash+1:]
	start, err1 := strconv.ParseInt(startStr, 10, 64)
	end, err2 := strconv.ParseInt(endStr, 10, 64)
	if err1 != nil || err2 != nil {
		return false
	}
	return start == 0 && end+1 == total
}
