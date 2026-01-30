# Club Mutant Deployment Guide

This guide covers deploying Club Mutant services to Fly.io or a VPS.

## Architecture

```
[Netlify]              [Fly.io]
 Frontend  ──────────►  Colyseus Server ◄────► YouTube API
 (static)               (club-mutant-server)   (club-mutant-youtube-api)
                              │                      │
                              └────── internal ──────┘
```

- **Frontend**: Static files on Netlify (existing setup)
- **Colyseus Server**: Node.js game server with WebSockets
- **YouTube API**: Go microservice (internal, not public)

---

# YouTube API Deployment

This section covers deploying the YouTube API microservice.

## Quick Start Options

### Option 1: Fly.io (Recommended for testing)

Fly.io offers free tier and deploys directly from Dockerfile.

```bash
# Install flyctl
brew install flyctl

# Login
fly auth login

# From the youtube-api directory
cd services/youtube-api

# Launch (first time)
fly launch --name club-mutant-youtube-api

# Deploy updates
fly deploy
```

Fly will auto-detect the Dockerfile and deploy. Set your Node server's env:

```bash
YOUTUBE_SERVICE_URL=https://club-mutant-youtube-api.fly.dev
```

### Option 2: Traditional VPS (Vultr/DigitalOcean/Hetzner)

#### 1. Create VPS

- **Vultr**: $2.50/mo for 512MB (enough for this service)
- **DigitalOcean**: $4/mo Droplet
- **Hetzner**: €3.29/mo for 2GB (best value)

Choose Ubuntu 22.04 or Debian 12.

#### 2. SSH and Install Docker

```bash
ssh root@YOUR_VPS_IP

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install docker-compose-plugin
```

#### 3. Deploy the Service

```bash
# Clone your repo (or just copy the youtube-api folder)
git clone https://github.com/goblincore/club-mutant.git
cd club-mutant/services/youtube-api

# Build and run
docker compose up -d

# Check logs
docker compose logs -f
```

#### 4. Configure Firewall

```bash
# Allow only necessary ports
ufw allow 22/tcp   # SSH
ufw allow 8081/tcp # YouTube API (or use nginx reverse proxy)
ufw enable
```

#### 5. (Optional) Nginx Reverse Proxy with SSL

```bash
apt install nginx certbot python3-certbot-nginx

# Create nginx config
cat > /etc/nginx/sites-available/youtube-api << 'EOF'
server {
    listen 80;
    server_name youtube-api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}
EOF

ln -s /etc/nginx/sites-available/youtube-api /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Get SSL cert
certbot --nginx -d youtube-api.yourdomain.com
```

### Option 3: Railway (GitHub auto-deploy)

1. Go to [railway.app](https://railway.app)
2. "New Project" → "Deploy from GitHub repo"
3. Select your repo, set root directory to `services/youtube-api`
4. Railway auto-detects Dockerfile and deploys

## Docker Compose for VPS

The `docker-compose.yml` in `services/youtube-api/` provides:

- YouTube API service
- Redis cache (optional, for Phase 4)
- Auto-restart on failure

## Environment Variables

| Variable                | Default | Description                       |
| ----------------------- | ------- | --------------------------------- |
| `PORT`                  | `8081`  | HTTP server port                  |
| `YOUTUBE_API_CACHE_TTL` | `3600`  | Search cache TTL (seconds)        |
| `REDIS_URL`             | (none)  | Redis connection string (Phase 4) |

## Connecting Your Node Server

Once deployed, update your Node server environment:

```bash
# For Fly.io
YOUTUBE_SERVICE_URL=https://club-mutant-youtube-api.fly.dev

# For VPS with nginx/SSL
YOUTUBE_SERVICE_URL=https://youtube-api.yourdomain.com

# For VPS direct (no SSL, internal network)
YOUTUBE_SERVICE_URL=http://YOUR_VPS_IP:8081
```

## Health Check

```bash
curl https://your-youtube-api-url/health
# Should return: {"status":"ok"}
```

## Monitoring

### View logs

```bash
# Docker
docker compose logs -f youtube-api

# Fly.io
fly logs
```

### Check resource usage

```bash
docker stats youtube-api
```

## Scaling Notes

The Go service is lightweight (~10MB memory idle). A $2.50 VPS can handle hundreds of concurrent requests.

For high traffic:

1. Add Redis cache (Phase 4)
2. Run multiple instances behind load balancer
3. Consider Fly.io's auto-scaling

## Troubleshooting

### Service won't start

```bash
# Check logs
docker compose logs youtube-api

# Common issues:
# - Port already in use: change PORT env var
# - Out of memory: upgrade VPS or reduce cache TTL
```

### 502 Bad Gateway from nginx

```bash
# Check if service is running
curl http://localhost:8081/health

# Check nginx error log
tail -f /var/log/nginx/error.log
```

### Video proxy timeouts

The proxy streams video data which can take time. Ensure:

- Nginx `proxy_read_timeout` is high (300s)
- No aggressive firewall timeouts

---

# Colyseus Server Deployment

The main game server running Node.js with Colyseus for real-time multiplayer.

## Fly.io Deployment

```bash
# From project root (not server/)
fly deploy --config fly.server.toml

# Or first time launch
fly launch --config fly.server.toml --name club-mutant-server
```

## Environment Variables

| Variable              | Default                 | Description                |
| --------------------- | ----------------------- | -------------------------- |
| `PORT`                | `2567`                  | HTTP/WebSocket server port |
| `NODE_ENV`            | `development`           | Environment mode           |
| `YOUTUBE_SERVICE_URL` | `http://localhost:8081` | YouTube API service URL    |

## Connecting to YouTube API (Internal)

On Fly.io, services in the same org can communicate via internal DNS:

```bash
# Set in fly.toml or via fly secrets
fly secrets set YOUTUBE_SERVICE_URL=http://club-mutant-youtube-api.internal:8081
```

This keeps YouTube API traffic internal (faster, no public exposure).

## WebSocket Considerations

Colyseus uses WebSockets which require:

1. **Sticky sessions**: Fly.io handles this automatically
2. **Keep machines running**: Set `auto_stop_machines = false` in fly.toml
3. **Minimum 1 machine**: Set `min_machines_running = 1`

## Client Configuration

Update your client's environment to point to the deployed server:

```bash
# .env or environment
VITE_SERVER_URL=wss://club-mutant-server.fly.dev
VITE_HTTP_ENDPOINT=https://club-mutant-server.fly.dev
```

## Health Check

```bash
curl https://club-mutant-server.fly.dev/health
# Should return: {"status":"ok"}
```

## Monitoring

```bash
# View logs
fly logs -a club-mutant-server

# SSH into container
fly ssh console -a club-mutant-server

# Check status
fly status -a club-mutant-server
```

---

# Complete Deployment Checklist

1. **Deploy YouTube API**

   ```bash
   cd services/youtube-api
   fly deploy
   ```

2. **Deploy Colyseus Server**

   ```bash
   # From project root
   fly secrets set YOUTUBE_SERVICE_URL=http://club-mutant-youtube-api.internal:8081 -a club-mutant-server
   fly deploy --config fly.server.toml
   ```

3. **Update Netlify Environment**
   - Set `VITE_SERVER_URL=wss://club-mutant-server.fly.dev`
   - Set `VITE_HTTP_ENDPOINT=https://club-mutant-server.fly.dev`
   - Trigger redeploy

4. **Verify**
   ```bash
   curl https://club-mutant-youtube-api.fly.dev/health
   curl https://club-mutant-server.fly.dev/health
   ```
