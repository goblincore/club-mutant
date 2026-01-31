# Rust PO Token Provider

The Rust implementation of bgutil-ytdlp-pot-provider is significantly faster than the Node.js version.

## Installation

```bash
# Install via cargo
cargo install bgutil-ytdlp-pot-provider

# Or build from source
git clone https://github.com/Brainicism/bgutil-ytdlp-pot-provider
cd bgutil-ytdlp-pot-provider
cargo build --release
```

## Running

```bash
# Run on default port 4416
bgutil-ytdlp-pot-provider

# Or specify port
bgutil-ytdlp-pot-provider --port 4416
```

## Docker (Rust version)

There's no official Rust Docker image yet, but you can create one:

```dockerfile
FROM rust:1.75-slim as builder
RUN cargo install bgutil-ytdlp-pot-provider

FROM debian:bookworm-slim
COPY --from=builder /usr/local/cargo/bin/bgutil-ytdlp-pot-provider /usr/local/bin/
EXPOSE 4416
CMD ["bgutil-ytdlp-pot-provider", "--port", "4416"]
```

## Fly.io Deployment

Update `fly.toml` for the pot-provider service:

```toml
app = "club-mutant-pot-provider"
primary_region = "nrt"

[build]
  dockerfile = "Dockerfile.rust-pot"

[[services]]
  internal_port = 4416
  protocol = "tcp"

  [[services.ports]]
    port = 4416
```

## Performance Comparison

| Implementation | First token | Cached token |
| -------------- | ----------- | ------------ |
| Node.js        | 10-20s      | <100ms       |
| Rust           | 3-8s        | <10ms        |

The Rust version is faster because:

- Native binary vs interpreted JavaScript
- More efficient BotGuard implementation via rustypipe-botguard
- Lower memory overhead

## Migration Steps

1. Build/deploy Rust version alongside Node.js
2. Update `POT_PROVIDER_URL` env var to point to Rust version
3. Test with a few videos
4. Remove Node.js version if stable

## Caveats

- Rust version is newer, may have edge case bugs
- Requires Rust toolchain to build (unless using Docker)
- No `TOKEN_TTL` env var exposed (uses internal defaults)
