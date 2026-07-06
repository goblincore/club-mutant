package main

import (
	"encoding/json"
	"testing"
)

func TestParseDurationText(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"3:45", 225},
		{"1:02:33", 3753},
		{"0:59", 59},
		{"10:00", 600},
		{"", 0},        // live streams have no lengthText
		{"SHORTS", 0},  // unparseable
		{"1:2x:33", 0}, // garbage component
	}
	for _, c := range cases {
		if got := parseDurationText(c.in); got != c.want {
			t.Errorf("parseDurationText(%q) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestParseViewCount(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"1,234,567 views", 1234567},
		{"972,406,124 views", 972406124}, // regression: must not stop at first comma
		{"42 views", 42},
		{"No views", 0},
		{"", 0},
		{"1,024 watching", 1024}, // live style
	}
	for _, c := range cases {
		if got := parseViewCount(c.in); got != c.want {
			t.Errorf("parseViewCount(%q) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestTextOf(t *testing.T) {
	simple := map[string]interface{}{"simpleText": "hello"}
	if got := textOf(simple); got != "hello" {
		t.Errorf("textOf(simpleText) = %q, want %q", got, "hello")
	}

	runs := map[string]interface{}{
		"runs": []interface{}{
			map[string]interface{}{"text": "Lil "},
			map[string]interface{}{"text": "Wayne"},
		},
	}
	if got := textOf(runs); got != "Lil Wayne" {
		t.Errorf("textOf(runs) = %q, want %q", got, "Lil Wayne")
	}

	if got := textOf(nil); got != "" {
		t.Errorf("textOf(nil) = %q, want empty", got)
	}
	if got := textOf("not a map"); got != "" {
		t.Errorf("textOf(string) = %q, want empty", got)
	}
}

// makeVideoRenderer builds a minimal videoRenderer item.
func makeVideoRenderer(id, title, channel, length, views string) map[string]interface{} {
	return map[string]interface{}{
		"videoRenderer": map[string]interface{}{
			"videoId":       id,
			"title":         map[string]interface{}{"runs": []interface{}{map[string]interface{}{"text": title}}},
			"ownerText":     map[string]interface{}{"runs": []interface{}{map[string]interface{}{"text": channel}}},
			"lengthText":    map[string]interface{}{"simpleText": length},
			"viewCountText": map[string]interface{}{"simpleText": views},
			"thumbnail": map[string]interface{}{
				"thumbnails": []interface{}{
					map[string]interface{}{"url": "https://i.ytimg.com/vi/" + id + "/default.jpg"},
				},
			},
		},
	}
}

// fixtureResponse builds a search response that reproduces every shape that
// broke the old ytsearch parser:
//   - section 1: plain videoRenderer + a shelf with horizontalListRenderer
//     (the famous-artist panic) + unknown renderer types
//   - section 2: a second itemSectionRenderer (the old parser kept only the
//     last section) with a vertical shelf and a duplicate video
func fixtureResponse() map[string]interface{} {
	section1 := map[string]interface{}{
		"itemSectionRenderer": map[string]interface{}{
			"contents": []interface{}{
				makeVideoRenderer("vid00000001", "Plain Result", "Channel A", "3:45", "1,234,567 views"),
				map[string]interface{}{ // topical shelf — horizontal list
					"shelfRenderer": map[string]interface{}{
						"title": map[string]interface{}{"simpleText": "Latest from Artist"},
						"content": map[string]interface{}{
							"horizontalListRenderer": map[string]interface{}{
								"items": []interface{}{
									makeVideoRenderer("vid00000002", "Shelf Video H", "Channel B", "1:02:33", "42 views"),
								},
							},
						},
					},
				},
				map[string]interface{}{"lockupViewModel": map[string]interface{}{}},   // unknown — skip
				map[string]interface{}{"reelShelfRenderer": map[string]interface{}{}}, // unknown — skip
				map[string]interface{}{"adSlotRenderer": map[string]interface{}{}},    // unknown — skip
				"not even a map", // malformed — skip
				map[string]interface{}{ // live stream: no lengthText
					"videoRenderer": map[string]interface{}{
						"videoId":       "vid00000003",
						"title":         map[string]interface{}{"simpleText": "Live Stream"},
						"ownerText":     map[string]interface{}{"runs": []interface{}{map[string]interface{}{"text": "Channel C"}}},
						"viewCountText": map[string]interface{}{"runs": []interface{}{map[string]interface{}{"text": "1,024 watching"}}},
					},
				},
			},
		},
	}

	section2 := map[string]interface{}{
		"itemSectionRenderer": map[string]interface{}{
			"contents": []interface{}{
				map[string]interface{}{
					"shelfRenderer": map[string]interface{}{
						"content": map[string]interface{}{
							"verticalListRenderer": map[string]interface{}{
								"items": []interface{}{
									makeVideoRenderer("vid00000004", "Shelf Video V", "Channel D", "0:59", "No views"),
									makeVideoRenderer("vid00000001", "Plain Result", "Channel A", "3:45", "1,234,567 views"), // duplicate
								},
							},
						},
					},
				},
			},
		},
	}

	return map[string]interface{}{
		"contents": map[string]interface{}{
			"twoColumnSearchResultsRenderer": map[string]interface{}{
				"primaryContents": map[string]interface{}{
					"sectionListRenderer": map[string]interface{}{
						"contents": []interface{}{section1, section2},
					},
				},
			},
		},
	}
}

func TestParseSearchResponse(t *testing.T) {
	videos := parseSearchResponse(fixtureResponse())

	wantIDs := []string{"vid00000001", "vid00000002", "vid00000003", "vid00000004"}
	if len(videos) != len(wantIDs) {
		t.Fatalf("got %d videos, want %d: %+v", len(videos), len(wantIDs), videos)
	}
	for i, id := range wantIDs {
		if videos[i].ID != id {
			t.Errorf("videos[%d].ID = %q, want %q", i, videos[i].ID, id)
		}
	}

	// Plain result fields survive intact
	v := videos[0]
	if v.Title != "Plain Result" || v.Channel != "Channel A" || v.DurationSeconds != 225 || v.ViewCount != 1234567 {
		t.Errorf("unexpected first video: %+v", v)
	}
	if v.Thumbnail != "https://i.ytimg.com/vi/vid00000001/default.jpg" {
		t.Errorf("unexpected thumbnail: %q", v.Thumbnail)
	}

	// Horizontal shelf video was harvested (old parser panicked here)
	if videos[1].Title != "Shelf Video H" || videos[1].DurationSeconds != 3753 {
		t.Errorf("unexpected horizontal shelf video: %+v", videos[1])
	}

	// Live stream: duration 0
	if videos[2].DurationSeconds != 0 || videos[2].ViewCount != 1024 {
		t.Errorf("unexpected live video: %+v", videos[2])
	}
}

func TestParseSearchResponseMalformed(t *testing.T) {
	// Must never panic on unexpected shapes — that is the whole point.
	cases := []string{
		`{}`,
		`{"contents": null}`,
		`{"contents": {"twoColumnSearchResultsRenderer": {"primaryContents": {"sectionListRenderer": {"contents": [{"itemSectionRenderer": {"contents": [{"videoRenderer": {}}]}}]}}}}}`,
		`{"contents": {"twoColumnSearchResultsRenderer": {"primaryContents": {"sectionListRenderer": {"contents": [{"itemSectionRenderer": {"contents": [{"shelfRenderer": {"content": {"weirdNewRenderer": 42}}}]}}]}}}}}`,
	}
	for _, raw := range cases {
		var data map[string]interface{}
		if err := json.Unmarshal([]byte(raw), &data); err != nil {
			t.Fatalf("bad fixture: %v", err)
		}
		if videos := parseSearchResponse(data); len(videos) != 0 {
			t.Errorf("expected 0 videos for %s, got %+v", raw, videos)
		}
	}
}

func TestFormatDuration(t *testing.T) {
	cases := []struct {
		in   int
		want string
	}{
		{0, "LIVE"},
		{59, "0:59"},
		{225, "3:45"},
		{3753, "1:02:33"},
	}
	for _, c := range cases {
		if got := formatDuration(c.in); got != c.want {
			t.Errorf("formatDuration(%d) = %q, want %q", c.in, got, c.want)
		}
	}
}
