# Build stage - use nightly Rust for edition2024 support
FROM rustlang/rust:nightly-bookworm-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install the Rust PO token provider with nightly
RUN cargo +nightly install bgutil-ytdlp-pot-provider

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy the binary from builder
COPY --from=builder /usr/local/cargo/bin/bgutil-ytdlp-pot-provider /usr/local/bin/

EXPOSE 4416

CMD ["bgutil-ytdlp-pot-provider", "--port", "4416"]
