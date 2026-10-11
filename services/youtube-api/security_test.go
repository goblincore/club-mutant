package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestInternalPrefetchAuthentication(t *testing.T) {
	token := strings.Repeat("x", 64)
	t.Setenv("INTERNAL_SERVICE_TOKEN", token)
	called := false
	handler := internalAuth(func(w http.ResponseWriter, r *http.Request) { called = true; w.WriteHeader(204) })
	for _, authorization := range []string{"", "Bearer forged", "Bearer " + token} {
		called = false
		req := httptest.NewRequest("POST", "/prefetch/dQw4w9WgXcQ", nil)
		req.Header.Set("Authorization", authorization)
		out := httptest.NewRecorder()
		handler(out, req)
		if authorization == "Bearer "+token {
			if !called || out.Code != 204 {
				t.Fatal("valid service request rejected")
			}
		} else if called || out.Code != 401 {
			t.Fatal("unauthenticated prefetch accepted")
		}
	}
}
func TestPrefetchQueueBound(t *testing.T) {
	queue := NewPrefetchQueue(&Server{videoCache: NewVideoCache(DefaultVideoCacheMaxSize)}, 1)
	defer queue.cancel()
	for i := 0; i < 128; i++ {
		if !queue.Enqueue(strings.Repeat("x", i+1), PriorityNormal) {
			t.Fatal("early queue rejection")
		}
	}
	if queue.Enqueue("overflow", PriorityHigh) || len(queue.queue) != 128 {
		t.Fatal("unbounded queue")
	}
}
