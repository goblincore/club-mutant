# Rust PO Token Provider

Faster Rust implementation of the PO token provider for yt-dlp.

## Local Development

```bash
# Install Rust if needed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install and run
cargo install bgutil-ytdlp-pot-provider
bgutil-ytdlp-pot-provider --port 4416
```

## Deploy to Fly.io

```bash
cd services/pot-provider-rust

# Create the app (first time only)
fly apps create club-mutant-pot-provider-rust

# Deploy
fly deploy

# Check logs
fly logs
```

## Switch YouTube API to use Rust provider

Update the `POT_PROVIDER_URL` env var on the youtube-api service:

```bash
fly secrets set POT_PROVIDER_URL=http://club-mutant-pot-provider-rust.internal:4416 -a club-mutant-youtube-api
```

## Performance

| Implementation | First token | Cached |
| -------------- | ----------- | ------ |
| Node.js        | 10-20s      | <100ms |
| Rust           | 3-8s        | <10ms  |
