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
RUN apk add --no-cache ca-certificates python3 py3-pip ffmpeg nodejs && \
    pip3 install --break-system-packages yt-dlp bgutil-ytdlp-pot-provider

# Copy Go binary
COPY --from=go-builder /app/youtube-api /youtube-api

# Note: Rust rusty-ytdl-hybrid build removed - n-param transform broken for current YouTube players
# To re-enable, restore rust-builder stage and COPY command below:
# COPY --from=rust-builder /rust-app/rusty-ytdl-hybrid/target/release/rusty-ytdl-hybrid /usr/local/bin/rusty-ytdl-hybrid

ENV PORT=8081

EXPOSE 8081

ENTRYPOINT ["/youtube-api"]
