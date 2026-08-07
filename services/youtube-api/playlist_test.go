package main

import (
	"encoding/json"
	"testing"
)

func playlistVideoFixture(id, title, lengthSeconds string, playable *bool) map[string]interface{} {
	vr := map[string]interface{}{
		"videoId": id,
		"title": map[string]interface{}{
			"runs": []interface{}{map[string]interface{}{"text": title}},
		},
		"thumbnail": map[string]interface{}{
			"thumbnails": []interface{}{
				map[string]interface{}{"url": "https://i.ytimg.com/vi/" + id + "/default.jpg"},
			},
		},
	}
	if lengthSeconds != "" {
		vr["lengthSeconds"] = lengthSeconds
	}
	if playable != nil {
		vr["isPlayable"] = *playable
	}
	return map[string]interface{}{"playlistVideoRenderer": vr}
}

func lockupFixture(id, title, badgeText string) map[string]interface{} {
	return map[string]interface{}{
		"lockupViewModel": map[string]interface{}{
			"contentId":   id,
			"contentType": "LOCKUP_CONTENT_TYPE_VIDEO",
			"metadata": map[string]interface{}{
				"lockupMetadataViewModel": map[string]interface{}{
					"title": map[string]interface{}{"content": title},
				},
			},
			"contentImage": map[string]interface{}{
				"thumbnailViewModel": map[string]interface{}{
					"image": map[string]interface{}{
						"sources": []interface{}{
							map[string]interface{}{"url": "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"},
						},
					},
					"overlays": []interface{}{
						map[string]interface{}{
							"thumbnailBottomOverlayViewModel": map[string]interface{}{
								"badges": []interface{}{
									map[string]interface{}{
										"thumbnailBadgeViewModel": map[string]interface{}{"text": badgeText},
									},
								},
							},
						},
					},
				},
			},
		},
	}
}

func continuationFixture(token string) map[string]interface{} {
	return map[string]interface{}{
		"continuationItemRenderer": map[string]interface{}{
			"continuationEndpoint": map[string]interface{}{
				"continuationCommand": map[string]interface{}{"token": token},
			},
		},
	}
}

func TestCollectPlaylistItems(t *testing.T) {
	playable := true
	unplayable := false
	items := []interface{}{
		playlistVideoFixture("aaaaaaaaaaa", "First Track", "212", &playable),
		playlistVideoFixture("bbbbbbbbbbb", "[Deleted video]", "", &unplayable), // skipped: unplayable
		playlistVideoFixture("ccccccccccc", "Live Stream", "", nil),             // kept: duration 0
		playlistVideoFixture("aaaaaaaaaaa", "First Track dup", "212", nil),      // skipped: dedup
		map[string]interface{}{"lockupViewModel": map[string]interface{}{}},     // skipped: unknown renderer
		"not a map", // skipped: wrong type
		continuationFixture("CONT_TOKEN_123"),
	}

	var out []PlaylistItem
	seen := make(map[string]bool)
	token := collectPlaylistItems(items, &out, seen, maxPlaylistItems)

	if token != "CONT_TOKEN_123" {
		t.Errorf("token = %q, want CONT_TOKEN_123", token)
	}
	if len(out) != 2 {
		t.Fatalf("len(out) = %d, want 2 (got %+v)", len(out), out)
	}
	if out[0].VideoID != "aaaaaaaaaaa" || out[0].Title != "First Track" || out[0].Duration != 212 {
		t.Errorf("first item wrong: %+v", out[0])
	}
	if out[0].Thumbnail == "" {
		t.Errorf("first item missing thumbnail")
	}
	if out[1].VideoID != "ccccccccccc" || out[1].Duration != 0 {
		t.Errorf("live item wrong: %+v", out[1])
	}
}

func TestCollectPlaylistItemsLockup(t *testing.T) {
	items := []interface{}{
		lockupFixture("dddddddddd1", "Lockup Track", "3:45"),
		lockupFixture("eeeeeeeeee1", "Live Lockup", "LIVE"), // badge unparseable → duration 0
		map[string]interface{}{ // non-video lockup (e.g. a playlist card) → skipped
			"lockupViewModel": map[string]interface{}{
				"contentId":   "PLnested",
				"contentType": "LOCKUP_CONTENT_TYPE_PLAYLIST",
			},
		},
		continuationFixture("LOCKUP_CONT"),
	}

	var out []PlaylistItem
	token := collectPlaylistItems(items, &out, make(map[string]bool), maxPlaylistItems)

	if token != "LOCKUP_CONT" {
		t.Errorf("token = %q, want LOCKUP_CONT", token)
	}
	if len(out) != 2 {
		t.Fatalf("len(out) = %d, want 2 (got %+v)", len(out), out)
	}
	if out[0].VideoID != "dddddddddd1" || out[0].Title != "Lockup Track" || out[0].Duration != 225 {
		t.Errorf("lockup item wrong: %+v", out[0])
	}
	if out[0].Thumbnail == "" {
		t.Errorf("lockup item missing thumbnail")
	}
	if out[1].Duration != 0 {
		t.Errorf("live lockup duration = %d, want 0", out[1].Duration)
	}
}

func TestCollectPlaylistItemsRespectsMax(t *testing.T) {
	items := []interface{}{
		playlistVideoFixture("aaaaaaaaaaa", "One", "10", nil),
		playlistVideoFixture("bbbbbbbbbbb", "Two", "20", nil),
		playlistVideoFixture("ccccccccccc", "Three", "30", nil),
	}
	var out []PlaylistItem
	collectPlaylistItems(items, &out, make(map[string]bool), 2)
	if len(out) != 2 {
		t.Errorf("len(out) = %d, want 2 (max cap)", len(out))
	}
}

func TestPlaylistTitleFallbacks(t *testing.T) {
	metadata := map[string]interface{}{
		"metadata": map[string]interface{}{
			"playlistMetadataRenderer": map[string]interface{}{"title": "Meta Title"},
		},
	}
	if got := playlistTitle(metadata); got != "Meta Title" {
		t.Errorf("metadata title = %q", got)
	}

	header := map[string]interface{}{
		"header": map[string]interface{}{
			"playlistHeaderRenderer": map[string]interface{}{
				"title": map[string]interface{}{"simpleText": "Header Title"},
			},
		},
	}
	if got := playlistTitle(header); got != "Header Title" {
		t.Errorf("header title = %q", got)
	}

	if got := playlistTitle(map[string]interface{}{}); got != "" {
		t.Errorf("empty response title = %q, want empty", got)
	}
}

func TestPlaylistBrowseHasError(t *testing.T) {
	errResp := map[string]interface{}{
		"alerts": []interface{}{
			map[string]interface{}{
				"alertRenderer": map[string]interface{}{
					"type": "ERROR",
					"text": map[string]interface{}{"simpleText": "The playlist does not exist."},
				},
			},
		},
	}
	if !playlistBrowseHasError(errResp) {
		t.Error("expected error alert to be detected")
	}

	infoResp := map[string]interface{}{
		"alerts": []interface{}{
			map[string]interface{}{
				"alertRenderer": map[string]interface{}{"type": "INFO"},
			},
		},
	}
	if playlistBrowseHasError(infoResp) {
		t.Error("INFO alert must not be treated as error")
	}
	if playlistBrowseHasError(map[string]interface{}{}) {
		t.Error("no alerts must not be treated as error")
	}
}

func TestValidImportablePlaylistID(t *testing.T) {
	cases := []struct {
		id   string
		want bool
	}{
		{"PLBCF2DAC6FFB574DE", true},
		{"PL1234567890abcdef", true},
		{"OLAK5uy_abcdefghij", true},
		{"UUabcdefghij", true},
		{"WL", false},               // watch later (auth required)
		{"LL", false},               // liked (auth required)
		{"RDdQw4w9WgXcQ", false},    // radio/mix
		{"short", false},            // too short
		{"has spaces in it", false}, // invalid chars
		{"", false},
	}
	for _, c := range cases {
		if got := validImportablePlaylistID(c.id); got != c.want {
			t.Errorf("validImportablePlaylistID(%q) = %v, want %v", c.id, got, c.want)
		}
	}
}

// TestPlaylistResponseJSONShape pins the wire format the client depends on.
func TestPlaylistResponseJSONShape(t *testing.T) {
	resp := PlaylistResponse{
		PlaylistID: "PLtest12345",
		Title:      "Test",
		Items:      []PlaylistItem{{VideoID: "aaaaaaaaaaa", Title: "T", Duration: 60, Thumbnail: "u"}},
		ItemCount:  1,
	}
	b, err := json.Marshal(resp)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"playlistId", "title", "items", "itemCount", "truncated", "cached"} {
		if _, ok := m[key]; !ok {
			t.Errorf("missing key %q in JSON: %s", key, b)
		}
	}
}
