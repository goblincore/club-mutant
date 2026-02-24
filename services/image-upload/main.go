package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/disintegration/imaging"
	gonanoid "github.com/matoous/go-nanoid/v2"

	_ "golang.org/x/image/webp" // decode webp uploads
)

// ── Constants ──

const (
	maxFileSize     = 2 * 1024 * 1024 // 2 MB
	maxResizePx     = 512             // longest edge after resize
	rateLimit       = 5               // max uploads per window
	rateLimitWindow = time.Minute
	jpegQuality     = 80 // JPEG output quality (good enough for chat images)
)

var allowedTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

// ── Rate limiter ──

type rateLimiter struct {
	mu      sync.Mutex
	windows map[string][]time.Time
}

func newRateLimiter() *rateLimiter {
	rl := &rateLimiter{windows: make(map[string][]time.Time)}
	go rl.cleanupLoop()
	return rl
}

func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-rateLimitWindow)

	// Filter expired entries
	var valid []time.Time
	for _, t := range rl.windows[key] {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= rateLimit {
		rl.windows[key] = valid
		return false
	}

	rl.windows[key] = append(valid, now)
	return true
}

func (rl *rateLimiter) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		cutoff := now.Add(-rateLimitWindow)
		for key, times := range rl.windows {
			var valid []time.Time
			for _, t := range times {
				if t.After(cutoff) {
					valid = append(valid, t)
				}
			}
			if len(valid) == 0 {
				delete(rl.windows, key)
			} else {
				rl.windows[key] = valid
			}
		}
		rl.mu.Unlock()
	}
}

// ── Server ──

type server struct {
	s3Client  *s3.Client
	bucket    string
	publicURL string
	limiter   *rateLimiter
}

func main() {
	port := envOr("PORT", "4001")
	accountID := mustEnv("R2_ACCOUNT_ID")
	accessKeyID := mustEnv("R2_ACCESS_KEY_ID")
	secretAccessKey := mustEnv("R2_SECRET_ACCESS_KEY")
	bucket := envOr("R2_BUCKET_NAME", "club-mutant-images")
	publicURL := envOr("R2_PUBLIC_URL", "https://cdn.mutante.club")

	// Create S3-compatible client for Cloudflare R2
	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID)

	s3Client := s3.New(s3.Options{
		Region:       "auto",
		BaseEndpoint: aws.String(endpoint),
		Credentials:  credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, ""),
		UsePathStyle: true, // R2 requires path-style: endpoint/bucket/key (not bucket.endpoint/key)
	})

	srv := &server{
		s3Client:  s3Client,
		bucket:    bucket,
		publicURL: strings.TrimRight(publicURL, "/"),
		limiter:   newRateLimiter(),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /upload", srv.handleUpload)
	mux.HandleFunc("GET /health", srv.handleHealth)

	handler := corsMiddleware(mux)

	log.Printf("[image-upload] Starting on port %s", port)
	log.Printf("[image-upload] Bucket: %s, Public URL: %s", bucket, publicURL)

	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func (srv *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}

func (srv *server) handleUpload(w http.ResponseWriter, r *http.Request) {
	// Limit request body size
	r.Body = http.MaxBytesReader(w, r.Body, maxFileSize+1024) // +1KB for form overhead

	// Parse multipart form
	if err := r.ParseMultipartForm(maxFileSize); err != nil {
		jsonError(w, "File too large (max 2 MB)", http.StatusRequestEntityTooLarge)
		return
	}

	// Get sessionId for rate limiting
	sessionID := r.FormValue("sessionId")
	if sessionID == "" {
		jsonError(w, "sessionId is required", http.StatusBadRequest)
		return
	}

	// Rate limit check
	if !srv.limiter.allow(sessionID) {
		jsonError(w, "Rate limit exceeded (max 5 uploads/min)", http.StatusTooManyRequests)
		return
	}

	// Get uploaded file
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "No file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate content type
	contentType := header.Header.Get("Content-Type")
	if !allowedTypes[contentType] {
		jsonError(w, fmt.Sprintf("Unsupported file type: %s (allowed: jpeg, png, gif, webp)", contentType), http.StatusBadRequest)
		return
	}

	// Validate file size
	if header.Size > maxFileSize {
		jsonError(w, "File too large (max 2 MB)", http.StatusRequestEntityTooLarge)
		return
	}

	// Read file into memory
	data, err := io.ReadAll(file)
	if err != nil {
		jsonError(w, "Failed to read file", http.StatusInternalServerError)
		return
	}

	// Decode image (supports jpeg, png, gif, webp via imported decoders)
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		jsonError(w, "Failed to decode image", http.StatusBadRequest)
		return
	}

	// Resize to max 512px on longest edge
	bounds := img.Bounds()
	imgW, imgH := bounds.Dx(), bounds.Dy()
	if imgW > maxResizePx || imgH > maxResizePx {
		img = imaging.Fit(img, maxResizePx, maxResizePx, imaging.Lanczos)
	}

	// Encode to JPEG (pure Go, no CGo dependency, good quality for chat images)
	var outBuf bytes.Buffer
	if err := jpeg.Encode(&outBuf, img, &jpeg.Options{Quality: jpegQuality}); err != nil {
		jsonError(w, "Failed to encode image", http.StatusInternalServerError)
		return
	}

	// Generate unique key
	id, err := gonanoid.New(16)
	if err != nil {
		jsonError(w, "Failed to generate ID", http.StatusInternalServerError)
		return
	}
	objectKey := fmt.Sprintf("chat/%s.jpg", id)

	// Upload to R2
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	_, err = srv.s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(srv.bucket),
		Key:         aws.String(objectKey),
		Body:        bytes.NewReader(outBuf.Bytes()),
		ContentType: aws.String("image/jpeg"),
	})
	if err != nil {
		log.Printf("[image-upload] R2 upload failed: %v", err)
		jsonError(w, "Failed to upload to CDN", http.StatusInternalServerError)
		return
	}

	cdnURL := fmt.Sprintf("%s/%s", srv.publicURL, objectKey)
	log.Printf("[image-upload] Uploaded %s (%d bytes → %d bytes JPEG)", objectKey, len(data), outBuf.Len())

	// Return CDN URL
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"url": cdnURL,
	})
}

// ── Helpers ──

func jsonError(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func corsMiddleware(next http.Handler) http.Handler {
	allowedOrigins := map[string]bool{
		"https://mutante.club":  true,
		"http://localhost:5173": true,
		"http://localhost:5175": true,
		"http://localhost:3000": true,
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("Required environment variable %s is not set", key)
	}
	return v
}
