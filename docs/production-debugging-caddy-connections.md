# Production Debugging: Caddy & Connection Failures (Feb 2026)

## Summary

Clients were intermittently failing to connect with "Failed to connect. Is the server running?" errors. The investigation uncovered three independent issues that compounded into near-total connection failure:

1. **Caddy YouTube proxy flood** — Safari byte-range retries + gzip buffering exhausted Caddy's connection pool
2. **Caddy NXDOMAIN cert loop** — a disabled subdomain with no DNS record caused ACME provisioning to loop, blocking TLS for all domains
3. **Client timeouts too tight** — 5–8s timeouts couldn't absorb intermittent TCP SYN packet loss on the Japan→Germany network path

## Issue 1: YouTube Proxy Gzip Buffering

### Symptom
Caddy reverse proxy to `youtube-api:8081` was buffering video stream responses, causing Safari to timeout and aggressively retry with byte-range requests. This flooded the connection pool.

### Root Cause
`encode gzip` was enabled on `yt.mutante.club`. Video content is already compressed — gzip just wastes CPU and forces Caddy to buffer the response body (it can't gzip a stream incrementally without knowing the full size). Safari's byte-range retry behavior then cancels and re-requests segments, multiplying the problem.

### Fix (`deploy/hetzner/Caddyfile`)
```caddy
yt.mutante.club {
  # No gzip — video content is already compressed; gzip just wastes CPU
  # and causes Caddy to buffer responses that then get cancelled by Safari's
  # aggressive byte-range retry behaviour, flooding the connection pool.
  reverse_proxy youtube-api:8081 {
    flush_interval -1
    transport http {
      response_header_timeout 30s
      dial_timeout 5s
    }
  }
}
```

Key changes:
- Removed `encode gzip`
- Added `flush_interval -1` to disable response buffering (stream immediately)
- Added explicit transport timeouts to prevent hung backend connections

### Lesson
Never gzip already-compressed content (video, images, compressed archives). It wastes CPU and can cause buffering issues with streaming proxies.

## Issue 2: NXDOMAIN Certificate Provisioning Loop

### Symptom
Caddy was failing to provision TLS certificates, blocking HTTPS for all configured domains.

### Root Cause
`proxy.mutante.club` was configured in the Caddyfile but had no DNS A record. Caddy's ACME provider (ZeroSSL) requires DNS validation — with an NXDOMAIN response, the challenge fails and Caddy retries in a loop. This loop consumed resources and blocked certificate provisioning for other domains.

### Fix (`deploy/hetzner/Caddyfile`)
```caddy
# DISABLED — proxy.mutante.club has no DNS record, causing Caddy to loop
# on TLS cert provisioning (NXDOMAIN) which blocks all other domains.
# Re-enable once a DNS A record is created for proxy.mutante.club.
# proxy.mutante.club {
#   ...
# }
```

### Lesson
Every domain in a Caddyfile must have a valid DNS record pointing to the server. A single NXDOMAIN domain can block TLS provisioning for all other domains. When disabling a domain, comment out the entire block.

## Issue 3: Client Connection Timeouts

### Symptom
After fixing Caddy issues, connections still failed intermittently — roughly 1 in 3 attempts.

### Diagnosis Methodology

**Step 1: Isolate the bottleneck**
```bash
# From VPS (tests Caddy → server, no internet)
curl https://api.mutante.club/health    # 80ms — fast

# From browser (tests full path: browser → internet → Caddy → server)
# Health check took 6.8 seconds — slow!
```
Conclusion: Caddy and the server are fast. The bottleneck is the network path.

**Step 2: Measure network characteristics**
```bash
# ICMP ping — blocked by Hetzner firewall (100% loss, not useful)
ping <VPS_IP>

# TCP timing breakdown (the real diagnostic)
curl -o /dev/null -s -w "DNS: %{time_namelookup}s, Connect: %{time_connect}s, TLS: %{time_appconnect}s, TTFB: %{time_starttransfer}s, Total: %{time_total}s\n" https://api.mutante.club/health
```

**Step 3: Identify the pattern**

| Run | TCP Connect | Total | Notes |
|-----|-------------|-------|-------|
| 1 | 1.80s | 6.38s | SYN retransmit (1s backoff) |
| 2 | 0.29s | 0.85s | Clean connection |
| 3 | 0.27s | 0.81s | Clean connection |
| 4 | 5.48s | 8.28s | Multiple SYN retransmits |
| 5 | 0.33s | 0.86s | Clean connection |

**Finding:** Base RTT is ~270ms (Japan→Germany). When the initial TCP SYN packet is dropped, TCP retransmits with exponential backoff (1s, 2s, 4s intervals). A single drop adds ~1.5s; two drops add ~5s.

### Fix
Increased all client-side `withTimeout()` values in `client-3d/src/network/NetworkManager.ts`:

| Join type | Before | After |
|---|---|---|
| Lobby (first attempt) | 5s | 15s |
| Lobby (retries) | 4s | 12s |
| All room joins | 8s | 15s |

### Lesson
For servers hosted far from the user base, client timeouts must account for worst-case TCP handshake times, not just average RTT. A 15s timeout absorbs up to 3 SYN retransmissions.

## Diagnostic Commands Reference

### Hetzner Docker Compose deployment

```bash
# Check service health through Caddy (TLS + reverse proxy)
curl https://api.mutante.club/health

# Check service health directly (bypasses Caddy)
docker exec hetzner-server-1 curl -s http://localhost:2567/health

# View server logs (last 100 lines, follow)
docker compose -f deploy/hetzner/docker-compose.yml logs -f --tail=100 server

# View Caddy logs
docker compose -f deploy/hetzner/docker-compose.yml logs -f caddy

# Restart all services
docker compose -f deploy/hetzner/docker-compose.yml restart

# Rebuild and restart a single service
docker compose -f deploy/hetzner/docker-compose.yml up -d --build server

# TCP timing breakdown (run from client machine)
curl -o /dev/null -s -w "DNS: %{time_namelookup}s, Connect: %{time_connect}s, TLS: %{time_appconnect}s, TTFB: %{time_starttransfer}s, Total: %{time_total}s\n" https://api.mutante.club/health
```

### VPS system updates
```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

## Operational Notes

- **Hetzner firewall blocks ICMP** — `ping` shows 100% loss even when the server is healthy. Use `curl` timing instead.
- **VPS reboots help** — after applying OS/kernel updates and rebooting, connection reliability improved noticeably. Keep the VPS updated.
- **`wget` not available in Node.js containers** — use `curl` or `node -e "fetch(...)"` for health checks from inside Docker containers.
- **Colyseus matchmaker GET hangs** — `GET /matchmake/` will hang indefinitely. The matchmaker expects POST requests to specific paths like `/matchmake/joinOrCreate/<room_type>`.
- **Long-term latency solution** — consider moving the VPS to an Asian datacenter (Vultr/Linode Tokyo) or adding Cloudflare proxy for TLS termination closer to users.
