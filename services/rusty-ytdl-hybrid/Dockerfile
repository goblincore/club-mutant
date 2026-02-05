# Build stage
FROM rust:1.75-alpine AS builder

RUN apk add --no-cache musl-dev openssl-dev openssl-libs-static pkgconfig

WORKDIR /app

# Copy manifests
COPY Cargo.toml Cargo.lock* ./

# Create dummy src to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Build dependencies (this layer will be cached)
RUN cargo build --release 2>/dev/null || true

# Copy actual source
COPY src ./src

# Build the actual binary
RUN cargo build --release

# Runtime stage
FROM alpine:latest

RUN apk add --no-cache ca-certificates

COPY --from=builder /app/target/release/rusty-ytdl-hybrid /usr/local/bin/

ENTRYPOINT ["rusty-ytdl-hybrid"]
