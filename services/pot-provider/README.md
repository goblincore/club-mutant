# PO Token Provider

A Proof-of-Origin (PO) token provider for yt-dlp to bypass YouTube's bot detection.

## What it does

YouTube blocks requests from datacenter IPs with "Sign in to confirm you're not a bot". This service generates PO tokens that prove the request comes from a legitimate client.

## Deployment

```bash
cd services/pot-provider
fly launch --name club-mutant-pot-provider
```

## Usage

The service exposes an HTTP API on port 4416. The Colyseus server's yt-dlp is configured to use this service for token generation.

Internal URL: `http://club-mutant-pot-provider.internal:4416`

## References

- [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider)
- [yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)
