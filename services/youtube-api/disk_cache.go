package main

import (
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	DefaultDiskCacheDir     = "/var/cache/youtube-api"
	DefaultDiskCacheMaxSize = 10 * 1024 * 1024 * 1024 // 10 GB
)

// DiskCache stores video bytes as files on disk with LRU eviction.
type DiskCache struct {
	mu      sync.Mutex
	dir     string
	maxSize int64
	curSize int64
}

// NewDiskCache creates a disk cache, scanning existing files to recover state.
func NewDiskCache(dir string, maxSize int64) (*DiskCache, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	dc := &DiskCache{
		dir:     dir,
		maxSize: maxSize,
	}

	// Scan existing files to calculate current size
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var totalSize int64
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		totalSize += info.Size()
	}
	dc.curSize = totalSize

	log.Printf("[disk-cache] Initialized: %s (%d files, %d MB / %d MB)",
		dir, len(entries), totalSize/(1024*1024), maxSize/(1024*1024))

	return dc, nil
}

// keyToFilename converts a cache key to a safe filename.
// e.g., "dQw4w9WgXcQ:video" -> "dQw4w9WgXcQ_video.bin"
func keyToFilename(key string) string {
	safe := strings.ReplaceAll(key, ":", "_")
	return safe + ".bin"
}

// filenameToKey converts a filename back to a cache key.
func filenameToKey(name string) string {
	name = strings.TrimSuffix(name, ".bin")
	return strings.ReplaceAll(name, "_", ":")
}

func (dc *DiskCache) filePath(key string) string {
	return filepath.Join(dc.dir, keyToFilename(key))
}

// Get reads a cached video from disk. On hit, touches the file's modtime for LRU.
func (dc *DiskCache) Get(key string) ([]byte, bool) {
	path := dc.filePath(key)

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}

	// Touch modtime for LRU ordering (best-effort)
	now := time.Now()
	os.Chtimes(path, now, now)

	return data, true
}

// Set writes video bytes to disk atomically (write tmp + rename).
// Evicts oldest files if over capacity.
func (dc *DiskCache) Set(key string, data []byte) {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	size := int64(len(data))
	if size > dc.maxSize {
		return
	}

	path := dc.filePath(key)

	// If file already exists, subtract old size
	if info, err := os.Stat(path); err == nil {
		dc.curSize -= info.Size()
	}

	// Evict oldest files until we have space
	for dc.curSize+size > dc.maxSize {
		if !dc.evictOldest() {
			break
		}
	}

	// Write atomically: tmp file + rename
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		log.Printf("[disk-cache] Write failed for %s: %v", key, err)
		return
	}
	if err := os.Rename(tmpPath, path); err != nil {
		log.Printf("[disk-cache] Rename failed for %s: %v", key, err)
		os.Remove(tmpPath)
		return
	}

	dc.curSize += size
	log.Printf("[disk-cache] Cached %s (%d bytes, total: %d MB / %d MB)",
		key, size, dc.curSize/(1024*1024), dc.maxSize/(1024*1024))
}

// evictOldest removes the oldest file by modification time. Returns false if nothing to evict.
// Must be called with mu held.
func (dc *DiskCache) evictOldest() bool {
	entries, err := os.ReadDir(dc.dir)
	if err != nil || len(entries) == 0 {
		return false
	}

	type fileInfo struct {
		name    string
		size    int64
		modTime int64
	}

	files := make([]fileInfo, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || strings.HasSuffix(e.Name(), ".tmp") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		files = append(files, fileInfo{
			name:    e.Name(),
			size:    info.Size(),
			modTime: info.ModTime().UnixNano(),
		})
	}

	if len(files) == 0 {
		return false
	}

	// Sort by modtime ascending (oldest first)
	sort.Slice(files, func(i, j int) bool {
		return files[i].modTime < files[j].modTime
	})

	oldest := files[0]
	path := filepath.Join(dc.dir, oldest.name)
	if err := os.Remove(path); err != nil {
		log.Printf("[disk-cache] Evict failed for %s: %v", oldest.name, err)
		return false
	}

	dc.curSize -= oldest.size
	log.Printf("[disk-cache] Evicted %s (%d bytes)", filenameToKey(oldest.name), oldest.size)
	return true
}

// Remove deletes a specific cached file.
func (dc *DiskCache) Remove(key string) bool {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	path := dc.filePath(key)
	info, err := os.Stat(path)
	if err != nil {
		return false
	}

	if err := os.Remove(path); err != nil {
		return false
	}

	dc.curSize -= info.Size()
	return true
}

// Clear removes all cached files.
func (dc *DiskCache) Clear() int {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	entries, err := os.ReadDir(dc.dir)
	if err != nil {
		return 0
	}

	count := 0
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		path := filepath.Join(dc.dir, e.Name())
		if os.Remove(path) == nil {
			count++
		}
	}

	dc.curSize = 0
	return count
}

// Stats returns disk cache metrics.
func (dc *DiskCache) Stats() (entries int, size int64, maxSize int64) {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	dirEntries, err := os.ReadDir(dc.dir)
	if err != nil {
		return 0, dc.curSize, dc.maxSize
	}

	count := 0
	for _, e := range dirEntries {
		if !e.IsDir() && !strings.HasSuffix(e.Name(), ".tmp") {
			count++
		}
	}

	return count, dc.curSize, dc.maxSize
}

