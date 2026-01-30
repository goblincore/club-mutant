# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install ca-certificates for HTTPS requests
RUN apk add --no-cache ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o youtube-api .

# Runtime stage - use Alpine for yt-dlp support
FROM alpine:latest

# Install yt-dlp with PO token plugin
RUN apk add --no-cache ca-certificates python3 py3-pip ffmpeg && \
    pip3 install --break-system-packages yt-dlp bgutil-ytdlp-pot-provider

COPY --from=builder /app/youtube-api /youtube-api

ENV PORT=8081

EXPOSE 8081

ENTRYPOINT ["/youtube-api"]
