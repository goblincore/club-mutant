# Go build stage
FROM golang:1.24-alpine AS go-builder

WORKDIR /app

# Install ca-certificates for HTTPS requests
RUN apk add --no-cache ca-certificates

# Copy Go project (build context is services/)
COPY youtube-api/go.mod youtube-api/go.sum ./
RUN go mod download

COPY youtube-api/ .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o youtube-api .

# Runtime stage - use Alpine for yt-dlp support
FROM alpine:latest

# Install yt-dlp with PO token plugin + Node.js for JS runtime (required for YouTube extraction)
# yt-dlp is pinned to a NIGHTLY build: stable 2026.07.04 returns 403 on the
# DASH itags (yt-dlp#17456), fixed only in nightly. Pinned rather than floating
# so a rebuild can't silently change extraction behaviour — bump it when
# YouTube breaks something, and re-run the format probe in
# docs/plans/2026-08-18-video-wall-transcode.md.
#
# The plugin pin MUST match the pot-provider image tag in
# deploy/hetzner/docker-compose.yml: the plugin refuses to request a token when
# its major version differs from the server's.
RUN apk add --no-cache ca-certificates python3 py3-pip ffmpeg nodejs && \
    pip3 install --break-system-packages --pre \
        'yt-dlp==2026.8.17.73947.dev0' \
        'bgutil-ytdlp-pot-provider==1.3.1'

# Copy Go binary
COPY --from=go-builder /app/youtube-api /youtube-api

ENV PORT=8081

EXPOSE 8081

ENTRYPOINT ["/youtube-api"]
