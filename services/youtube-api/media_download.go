package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"
)

// A download is written to a temporary spool as it arrives. Readers can start
// immediately and use independent positions, including seeks. Only complete
// files are published to the cache. All state is guarded by server.downloadMu.
type mediaDownload struct {
	server           *Server
	key              string
	ctx              context.Context
	cancel           context.CancelFunc
	ready            chan struct{}
	changed          chan struct{}
	file             *os.File
	total, available int64
	contentType      string
	err              error
	done             bool
	readers          int
}

func (d *mediaDownload) signal() {
	close(d.changed)
	d.changed = make(chan struct{})
}

func (d *mediaDownload) release() {
	s := d.server
	s.downloadMu.Lock()
	defer s.downloadMu.Unlock()
	d.readers--
	if d.readers == 0 {
		d.cancel()
		if s.downloads[d.key] == d {
			delete(s.downloads, d.key)
		}
		if d.done && d.file != nil {
			d.file.Close()
			os.Remove(d.file.Name())
		}
	}
}

func (s *Server) acquireMedia(ctx context.Context, videoID string, videoOnly, audioOnly bool, sem chan struct{}) (*mediaDownload, error) {
	key := mediaCacheKey(videoID, videoOnly, audioOnly)
	s.downloadMu.Lock()
	if s.downloads == nil {
		s.downloads = make(map[string]*mediaDownload)
	}
	d := s.downloads[key]
	if d == nil {
		workCtx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		d = &mediaDownload{server: s, key: key, ctx: workCtx, cancel: cancel, ready: make(chan struct{}), changed: make(chan struct{})}
		s.downloads[key] = d
		go d.run(videoID, videoOnly, audioOnly, sem)
	} else {
		s.metrics.joined.Add(1)
	}
	d.readers++
	s.downloadMu.Unlock()
	select {
	case <-ctx.Done():
		d.release()
		return nil, ctx.Err()
	case <-d.ready:
		s.downloadMu.Lock()
		err := d.err
		s.downloadMu.Unlock()
		if err != nil {
			d.release()
			return nil, err
		}
		return d, nil
	}
}

func (d *mediaDownload) run(videoID string, videoOnly, audioOnly bool, sem chan struct{}) {
	s := d.server
	var runErr error
	ready := false
	cached := false
	defer func() {
		result := 0 // Complete, verified transfer.
		switch {
		case runErr == errMediaTooLarge:
			result = 3
		case runErr != nil && d.ctx.Err() != nil:
			result = 2
		case runErr != nil:
			result = 1
		case cached:
			result = 4
		}
		s.metrics.downloadResults[result].Add(1)
		d.cancel()
		s.downloadMu.Lock()
		defer s.downloadMu.Unlock()
		d.err, d.done = runErr, true
		if runErr != nil {
			log.Printf("[media] Download %s failed after %d/%d bytes: %v", d.key, d.available, d.total, runErr)
		} else {
			log.Printf("[media] Download %s complete (%d bytes)", d.key, d.total)
		}
		if !ready {
			close(d.ready)
		}
		d.signal()
		if s.downloads[d.key] == d {
			delete(s.downloads, d.key)
		}
		if d.readers == 0 && d.file != nil {
			d.file.Close()
			os.Remove(d.file.Name())
		}
	}()
	// Recheck after joining the flight: another completed download may have
	// filled the cache between the handler's lookup and this operation.
	data, found := s.cachedMedia(d.key)
	cached = found
	var input io.ReadCloser
	var total int64
	var contentType string
	if cached {
		input, total, contentType = io.NopCloser(bytes.NewReader(data)), int64(len(data)), cachedMediaContentType(data, audioOnly)
	} else {
		s.metrics.started.Add(1)
		stream, err := s.openMedia(d.ctx, videoID, videoOnly, audioOnly, sem)
		if err != nil {
			runErr = err
			return
		}
		input, total, contentType = stream, stream.total, stream.contentType
	}
	defer input.Close()
	if total > s.maxCacheableVideoSize {
		runErr = errMediaTooLarge
		return
	}
	spoolDir := ""
	if s.diskCache != nil {
		// Use the cache volume rather than /tmp, which may be a small tmpfs.
		// The eviction pool ignores directories and never serves these files.
		spoolDir = filepath.Join(s.diskCache.dir, "inflight")
		if err := os.MkdirAll(spoolDir, 0700); err != nil {
			runErr = err
			return
		}
	}
	file, err := os.CreateTemp(spoolDir, "youtube-download-*.tmp")
	if err != nil {
		runErr = err
		return
	}
	s.downloadMu.Lock()
	d.file, d.total, d.contentType = file, total, contentType
	close(d.ready)
	ready = true
	s.downloadMu.Unlock()
	buf := make([]byte, 128*1024)
	for {
		if err := d.ctx.Err(); err != nil {
			runErr = err
			return
		}
		n, err := input.Read(buf)
		if n > 0 {
			if d.available+int64(n) > total {
				runErr = fmt.Errorf("media exceeds declared size")
				return
			}
			if _, writeErr := file.Write(buf[:n]); writeErr != nil {
				runErr = writeErr
				return
			}
			s.downloadMu.Lock()
			d.available += int64(n)
			d.signal()
			s.downloadMu.Unlock()
		}
		if err != nil {
			if err != io.EOF {
				runErr = err
				return
			}
			break
		}
	}
	if d.available != total || d.ctx.Err() != nil {
		runErr = fmt.Errorf("incomplete or canceled media download")
		return
	}
	if !cached {
		// This is reached only after validated EOF and the exact resource size.
		complete, err := os.ReadFile(file.Name())
		if err != nil {
			runErr = err
			return
		}
		if int64(len(complete)) <= MemoryCacheMaxEntrySize {
			s.videoCache.Set(d.key, complete)
		}
		if s.diskCache != nil {
			s.diskCache.Set(d.key, complete)
		}
	}
}

type mediaReader struct {
	download *mediaDownload
	ctx      context.Context
	pos, end int64
}

func (r *mediaReader) Read(p []byte) (int, error) {
	d, s := r.download, r.download.server
	for {
		if err := r.ctx.Err(); err != nil {
			return 0, err
		}
		s.downloadMu.Lock()
		available, done, err, changed := d.available, d.done, d.err, d.changed
		s.downloadMu.Unlock()
		if r.pos > r.end {
			if r.end != d.total-1 || done {
				if done && err != nil {
					return 0, err
				}
				return 0, io.EOF
			}
			// Wait for validated EOF and cache publication before the last full
			// reader releases its interest in the download.
			select {
			case <-r.ctx.Done():
				return 0, r.ctx.Err()
			case <-changed:
				continue
			}
		}
		if r.pos < available {
			length := min(int64(len(p)), available-r.pos, r.end-r.pos+1)
			n, err := d.file.ReadAt(p[:length], r.pos)
			r.pos += int64(n)
			return n, err
		}
		if done {
			if err == nil {
				err = io.ErrUnexpectedEOF
			}
			return 0, err
		}
		select {
		case <-r.ctx.Done():
			return 0, r.ctx.Err()
		case <-changed:
		}
	}
}

func (s *Server) prefetchMedia(ctx context.Context, videoID string, videoOnly, audioOnly bool) ([]byte, error) {
	key := mediaCacheKey(videoID, videoOnly, audioOnly)
	if data, ok := s.cachedMedia(key); ok {
		return data, nil
	}
	d, err := s.acquireMedia(ctx, videoID, videoOnly, audioOnly, prefetchSemaphore)
	if err != nil {
		return nil, err
	}
	defer d.release()
	// Wait for completion and cache publication, not merely the last readable
	// byte. A viewer reaching EOF must not cancel a still-interested prefetch.
	for {
		s.downloadMu.Lock()
		done, err, changed := d.done, d.err, d.changed
		s.downloadMu.Unlock()
		if done {
			if err != nil {
				return nil, err
			}
			return os.ReadFile(d.file.Name())
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-changed:
		}
	}
}
