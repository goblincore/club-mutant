package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// argValue returns the argument immediately following flag, or "" if the flag
// is absent. yt-dlp args are built as a flat []string of flag/value pairs.
func argValue(args []string, flag string) string {
	for i, a := range args {
		if a == flag && i+1 < len(args) {
			return args[i+1]
		}
	}
	return ""
}

func hasArg(args []string, want string) bool {
	for _, a := range args {
		if a == want {
			return true
		}
	}
	return false
}

// extractorArg returns the value of the --extractor-args entry carrying the
// given prefix. Multiple --extractor-args flags may be present.
func extractorArg(args []string, prefix string) string {
	for i, a := range args {
		if a == "--extractor-args" && i+1 < len(args) && strings.HasPrefix(args[i+1], prefix) {
			return args[i+1]
		}
	}
	return ""
}

// The bgutil PO token plugin talks to the provider over its own protocol
// (GET /ping, POST /get_pot). Pointing base_url at this service's own
// caching proxy means yt-dlp 404s and silently never obtains a token, so
// base_url must address the bgutil provider directly.
func TestBuildYtDlpArgsPOTokenTargetsProvider(t *testing.T) {
	args := buildYtDlpArgs(ytdlpArgsConfig{
		videoID:        "abc123",
		audioOnly:      true,
		usePOToken:     true,
		proxyURL:       "http://isp-proxy:8888",
		potProviderURL: "http://pot-provider:4416",
	})

	got := extractorArg(args, "youtubepot-bgutilhttp:base_url=")
	want := "youtubepot-bgutilhttp:base_url=http://pot-provider:4416"
	if got != want {
		t.Errorf("base_url extractor arg = %q, want %q", got, want)
	}
	if strings.Contains(strings.Join(args, " "), "127.0.0.1") {
		t.Errorf("PO token args must not point at this service itself, got: %v", args)
	}
}

// The PO token must be minted for the IP that will fetch the media, so the
// PO token path resolves directly rather than through the ISP proxy.
func TestBuildYtDlpArgsPOTokenPathOmitsProxy(t *testing.T) {
	args := buildYtDlpArgs(ytdlpArgsConfig{
		videoID:        "abc123",
		usePOToken:     true,
		proxyURL:       "http://isp-proxy:8888",
		potProviderURL: "http://pot-provider:4416",
	})

	if hasArg(args, "--proxy") {
		t.Errorf("PO token path must not pass --proxy, got: %v", args)
	}
}

func TestBuildYtDlpArgsProxyPathOmitsPOTokenFlags(t *testing.T) {
	args := buildYtDlpArgs(ytdlpArgsConfig{
		videoID:        "abc123",
		proxyURL:       "http://isp-proxy:8888",
		potProviderURL: "http://pot-provider:4416",
	})

	if got := argValue(args, "--proxy"); got != "http://isp-proxy:8888" {
		t.Errorf("--proxy = %q, want the ISP proxy", got)
	}
	if extractorArg(args, "youtubepot-bgutilhttp:") != "" {
		t.Errorf("proxy path must not pass PO token extractor args, got: %v", args)
	}
	if hasArg(args, "--cookies") {
		t.Errorf("proxy path must not pass --cookies (they interfere), got: %v", args)
	}
}

// Since late July 2026 YouTube gates android_vr https formats behind a GVS PO
// token, and yt-dlp's default client selection lands on clients YouTube forces
// to SABR (no https URLs at all). The android client still serves format 18
// over plain https through the ISP proxy, so the tokenless path must ask for
// it explicitly rather than taking whatever client yt-dlp picks.
func TestBuildYtDlpArgsProxyPathPinsAndroidClient(t *testing.T) {
	args := buildYtDlpArgs(ytdlpArgsConfig{
		videoID:  "abc123",
		proxyURL: "http://isp-proxy:8888",
	})

	got := extractorArg(args, "youtube:player_client=")
	want := "youtube:player_client=android"
	if got != want {
		t.Errorf("player_client extractor arg = %q, want %q", got, want)
	}
}

// The PO token path negotiates its own client; pinning android there would
// discard the formats the token unlocks.
func TestBuildYtDlpArgsPOTokenPathDoesNotPinClient(t *testing.T) {
	args := buildYtDlpArgs(ytdlpArgsConfig{
		videoID:        "abc123",
		usePOToken:     true,
		potProviderURL: "http://pot-provider:4416",
	})

	if got := extractorArg(args, "youtube:player_client="); got != "" {
		t.Errorf("PO token path must not pin a client, got %q", got)
	}
}

func TestBuildYtDlpArgsFormatSelection(t *testing.T) {
	cases := []struct {
		name string
		cfg  ytdlpArgsConfig
		want string
	}{
		// The DASH itags (139/160/...) still *resolve* on the proxy path but
		// googlevideo then refuses to serve them without a GVS PO token, so
		// listing them as fallbacks would hand out URLs that 403 mid-stream.
		// Format 18 is the only one the android client offers and the only one
		// that streams, so the proxy path must ask for it alone.
		{
			"proxy_audio_only_uses_18",
			ytdlpArgsConfig{proxyURL: "http://p", audioOnly: true},
			"18",
		},
		{
			"proxy_video_only_uses_18",
			ytdlpArgsConfig{proxyURL: "http://p", videoOnly: true},
			"18",
		},
		{
			"proxy_default_uses_18",
			ytdlpArgsConfig{proxyURL: "http://p"},
			"18",
		},
		{
			"po_token_audio_only_uses_selector",
			ytdlpArgsConfig{usePOToken: true, audioOnly: true},
			"ba[abr<=64]/ba",
		},
		{
			"po_token_default_uses_selector",
			ytdlpArgsConfig{usePOToken: true},
			"best[height<=360]/best",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := argValue(buildYtDlpArgs(tc.cfg), "-f"); got != tc.want {
				t.Errorf("-f = %q, want %q", got, tc.want)
			}
		})
	}
}

// docker-compose bind-mounts ./cookies.txt over /etc/youtube-api/cookies.txt.
// When the source file is missing on the host, Docker silently creates a
// *directory* at the target — os.Stat then succeeds and yt-dlp is handed a
// --cookies path it cannot open, failing the whole PO token resolve.
func TestUsableCookiesPathRejectsNonFiles(t *testing.T) {
	dir := t.TempDir()

	if got := usableCookiesPath(dir); got != "" {
		t.Errorf("usableCookiesPath(directory) = %q, want \"\"", got)
	}
	if got := usableCookiesPath(filepath.Join(dir, "nope.txt")); got != "" {
		t.Errorf("usableCookiesPath(missing) = %q, want \"\"", got)
	}

	empty := filepath.Join(dir, "empty.txt")
	if err := os.WriteFile(empty, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if got := usableCookiesPath(empty); got != "" {
		t.Errorf("usableCookiesPath(empty file) = %q, want \"\"", got)
	}

	real := filepath.Join(dir, "cookies.txt")
	if err := os.WriteFile(real, []byte("# Netscape HTTP Cookie File\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := usableCookiesPath(real); got != real {
		t.Errorf("usableCookiesPath(real file) = %q, want %q", got, real)
	}
}

func TestBuildYtDlpArgsCookiesOnlyWhenAvailable(t *testing.T) {
	with := buildYtDlpArgs(ytdlpArgsConfig{
		usePOToken:     true,
		potProviderURL: "http://pot-provider:4416",
		cookiesPath:    "/etc/youtube-api/cookies.txt",
	})
	if got := argValue(with, "--cookies"); got != "/etc/youtube-api/cookies.txt" {
		t.Errorf("--cookies = %q, want the cookies path", got)
	}

	without := buildYtDlpArgs(ytdlpArgsConfig{
		usePOToken:     true,
		potProviderURL: "http://pot-provider:4416",
	})
	if hasArg(without, "--cookies") {
		t.Errorf("must not pass --cookies when none available, got: %v", without)
	}
}
