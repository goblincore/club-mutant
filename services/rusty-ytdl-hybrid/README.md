# rusty-ytdl-hybrid

Fast YouTube video URL resolver combining [rusty_ytdl](https://github.com/Mithronn/rusty_ytdl) (YouTube API client) with [ytdlp-ejs](https://github.com/ahaoboy/ytdlp-ejs) (signature solver).

## Goal

Replace yt-dlp (~4s per resolve) with a faster Rust-based solution (~1s target).

## Usage

```bash
# Basic resolve
rusty-ytdl-hybrid --resolve dQw4w9WgXcQ

# With options
rusty-ytdl-hybrid --resolve dQw4w9WgXcQ --quality 360 --video-only --timing

# With proxy
rusty-ytdl-hybrid --resolve dQw4w9WgXcQ --proxy "http://user:pass@host:port"
```

## Output

```json
{
  "url": "https://rr5---sn-....googlevideo.com/videoplayback?...",
  "expires_at": 1738900000000,
  "quality": "360p",
  "video_only": true,
  "resolved_at": 1738878000000
}
```

## Building

```bash
# Debug build
cargo build

# Release build (smaller, faster)
cargo build --release

# Run tests
cargo test
```

## Docker

```bash
docker build -t rusty-ytdl-hybrid .
docker run rusty-ytdl-hybrid --resolve dQw4w9WgXcQ --timing
```

## Integration with Go youtube-api

The Go service can call this binary as an alternative to yt-dlp:

```go
func resolveWithRustyYtdl(videoID string, videoOnly bool) (*ResolveResponse, error) {
    args := []string{"--resolve", videoID, "--quality", "360"}
    if videoOnly {
        args = append(args, "--video-only")
    }
    
    cmd := exec.Command("rusty-ytdl-hybrid", args...)
    output, err := cmd.Output()
    // Parse JSON output
}
```

## Status

⚠️ **Prototype** - Testing to validate speedup before full integration.
