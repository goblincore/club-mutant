package main

import "os"

// usableCookiesPath returns path if it names a non-empty regular file, and ""
// otherwise. A plain existence check is not enough: docker-compose bind-mounts
// ./cookies.txt into the container, and if the host file is missing Docker
// creates a directory at the target instead. Handing that to yt-dlp as
// --cookies fails the entire resolve, so treat anything unusable as absent.
func usableCookiesPath(path string) string {
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
		return ""
	}
	return path
}

// ytdlpArgsConfig carries everything the yt-dlp command line depends on.
// Passing it explicitly (rather than reading the environment inside the
// builder) keeps argument construction testable.
type ytdlpArgsConfig struct {
	videoID    string
	videoOnly  bool
	audioOnly  bool
	usePOToken bool

	// proxyURL is the ISP proxy used for the tokenless resolve path.
	proxyURL string
	// potProviderURL addresses the bgutil PO token provider.
	potProviderURL string
	// cookiesPath is the cookies.txt to pass, or "" when unavailable.
	cookiesPath string
}

// useProxyPath reports whether this invocation resolves through the ISP proxy
// without a PO token. The proxy and PO token paths are mutually exclusive:
// the PO token path resolves directly so the token matches the requesting IP.
func (cfg ytdlpArgsConfig) useProxyPath() bool {
	return cfg.proxyURL != "" && !cfg.usePOToken
}

// formatSelector picks the yt-dlp format string. The proxy path names itags
// directly (no JS runtime needed); the PO token path has a JS runtime and can
// use selectors.
func (cfg ytdlpArgsConfig) formatSelector() string {
	if cfg.useProxyPath() {
		// 18 (360p H.264 + AAC, pre-merged) is the only format the android
		// client offers and the only one googlevideo still streams without a
		// GVS PO token. The DASH itags (139/249/140/160/133/134) resolve fine
		// but are then refused mid-stream, so they must not appear even as
		// fallbacks — a resolve that "succeeds" into a dead URL is worse than
		// a failure, which at least escalates to the PO token path.
		return "18"
	}
	if cfg.audioOnly {
		return "ba[abr<=64]/ba"
	}
	if cfg.videoOnly {
		return "bv[height<=144]/bv[height<=240]/bv[height<=360]/bv"
	}
	return "best[height<=360]/best"
}

func buildYtDlpArgs(cfg ytdlpArgsConfig) []string {
	args := []string{
		"https://www.youtube.com/watch?v=" + cfg.videoID,
		"-f", cfg.formatSelector(),
		"-g",
		"--no-playlist",
		"--no-warnings",
		"--quiet",
		"--no-cache-dir",
	}

	if cfg.useProxyPath() {
		// Pin the android client: yt-dlp's default selection lands on clients
		// YouTube forces to SABR, which expose no plain https URLs at all.
		args = append(args,
			"--proxy", cfg.proxyURL,
			"--extractor-args", "youtube:player_client=android",
		)
	}

	if cfg.usePOToken {
		// base_url must address the bgutil provider itself: the plugin speaks
		// its own protocol (GET /ping, POST /get_pot), which this service does
		// not implement. Pointing it here makes yt-dlp 404 and silently give
		// up on the token.
		args = append(args,
			"--js-runtimes", "node",
			"--remote-components", "ejs:github",
			"--extractor-args", "youtubepot-bgutilhttp:base_url="+cfg.potProviderURL,
		)
		// Cookies only on the PO token path — they interfere with the proxy path.
		if cfg.cookiesPath != "" {
			args = append(args, "--cookies", cfg.cookiesPath)
		}
	}

	return args
}
