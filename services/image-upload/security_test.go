package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"mime/multipart"
	"net/http/httptest"
	"testing"
	"time"
)

func capability(key string, claims map[string]any) string {
	enc := base64.RawURLEncoding.EncodeToString
	body, _ := json.Marshal(claims)
	input := enc([]byte(`{"alg":"HS256"}`)) + "." + enc(body)
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(input))
	return "Bearer " + input + "." + enc(mac.Sum(nil))
}
func TestUploadCapability(t *testing.T) {
	key := "0123456789012345678901234567890123456789"
	now := time.Now()
	claims := map[string]any{"sub": "guest:123", "iss": "club-mutant-game", "aud": "club-mutant-services", "scope": "upload", "exp": now.Unix() + 300}
	token := capability(key, claims)
	if subject, err := uploadSubject(token, key, now); err != nil || subject != "guest:123" {
		t.Fatalf("valid capability rejected: %s %v", subject, err)
	}
	for _, bad := range []string{"", token + "x", capability("wrong key", claims)} {
		if _, err := uploadSubject(bad, key, now); err == nil {
			t.Fatal("accepted forged capability")
		}
	}
	for field, value := range map[string]any{"aud": "wrong", "iss": "wrong", "scope": "dream", "exp": now.Unix() - 1} {
		changed := make(map[string]any)
		for k, v := range claims {
			changed[k] = v
		}
		changed[field] = value
		if _, err := uploadSubject(capability(key, changed), key, now); err == nil {
			t.Fatalf("accepted invalid %s", field)
		}
	}
}
func TestUploadRejectsBeforeStorage(t *testing.T) {
	key := "0123456789012345678901234567890123456789"
	t.Setenv("SERVICE_AUTH_KEY", key)
	srv := &server{limiter: newRateLimiter()}
	unauth := httptest.NewRecorder()
	srv.handleUpload(unauth, httptest.NewRequest("POST", "/upload", nil))
	if unauth.Code != 401 {
		t.Fatalf("unauthenticated request: %d", unauth.Code)
	}
	// Compresses to a tiny file, but would allocate 64 MiB during decoding.
	var imageData bytes.Buffer
	png.Encode(&imageData, image.NewGray(image.Rect(0, 0, 8000, 8000)))
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	f, _ := form.CreateFormFile("file", "large.png")
	f.Write(imageData.Bytes())
	form.Close()
	req := httptest.NewRequest("POST", "/upload", &body)
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("Authorization", capability(key, map[string]any{"sub": "guest:test", "iss": "club-mutant-game", "aud": "club-mutant-services", "scope": "upload", "exp": time.Now().Unix() + 300}))
	// A real MIME part is required to reach the dimension check.
	raw := bytes.ReplaceAll(body.Bytes(), []byte("application/octet-stream"), []byte("image/png"))
	req = httptest.NewRequest("POST", "/upload", bytes.NewReader(raw))
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("Authorization", capability(key, map[string]any{"sub": "guest:test", "iss": "club-mutant-game", "aud": "club-mutant-services", "scope": "upload", "exp": time.Now().Unix() + 300}))
	response := httptest.NewRecorder()
	srv.handleUpload(response, req)
	if response.Code != 400 || !bytes.Contains(response.Body.Bytes(), []byte("dimensions")) {
		t.Fatalf("oversized image: %d %s", response.Code, response.Body.String())
	}
}
func TestVerifiedIdentityQuota(t *testing.T) {
	rl := newRateLimiter()
	for i := 0; i < 5; i++ {
		if !rl.allow("verified") {
			t.Fatal("early rejection")
		}
	}
	if rl.allow("verified") {
		t.Fatal("quota bypass")
	}
}
