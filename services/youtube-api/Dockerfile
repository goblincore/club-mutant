# Rust build stage for rusty-ytdl-hybrid
# Note: ytdlp-ejs requires edition2024, which needs Rust nightly
FROM rustlang/rust:nightly-alpine AS rust-builder

RUN apk add --no-cache musl-dev openssl-dev openssl-libs-static pkgconfig git

WORKDIR /rust-app

# Copy Rust project and local fork (build context is services/)
COPY rusty_ytdl_fork ./rusty_ytdl_fork
COPY rusty-ytdl-hybrid/Cargo.toml rusty-ytdl-hybrid/Cargo.lock* ./
COPY rusty-ytdl-hybrid/src ./src

# Build the Rust binary
RUN cargo build --release 2>/dev/null || cargo build --release

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

# Copy Rust binary (optional - for USE_RUSTY_YTDL=true)
COPY --from=rust-builder /rust-app/target/release/rusty-ytdl-hybrid /usr/local/bin/rusty-ytdl-hybrid

ENV PORT=8081
# Set USE_RUSTY_YTDL=true to use the faster Rust-based resolver
ENV USE_RUSTY_YTDL=false

EXPOSE 8081

ENTRYPOINT ["/youtube-api"]
