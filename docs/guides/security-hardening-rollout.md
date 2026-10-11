# Security hardening rollout

The application changes address the [2026-10-11 audit](../reviews/2026-10-11-security-audit.md). Nothing has been deployed to the VPS. Deploy the client, game server, and Go services together: uploads now require a capability issued through the game session, and NPC/prefetch requests require a private service credential.

## Before deploying

1. Back up Postgres and test restoration. Nakama hooks protect existing playlists even when their historical `permissionWrite` is 1; no bulk rewrite is needed. Inspect protected collections for historical unwanted objects. Hooks block future mutations but do not remove existing data.
2. Generate three independent credentials with `openssl rand -hex 32`: `SERVICE_AUTH_KEY`, `INTERNAL_SERVICE_TOKEN`, and `NAKAMA_RUNTIME_HTTP_KEY`. Put them in the VPS `.env`, never frontend `VITE_*` variables. The private runtime HTTP key must differ from the public Nakama server key. Export the appropriate service keys locally too.
3. Rotate credentials potentially exposed by the old public runtime key, proxy credential logs, and world-readable `.env`/cookies. Rotating the Nakama encryption key signs everyone out. Deploy.sh applies mode 0600 to `.env` and cookies.
4. The YouTube process runs as UID 1000 so it can read cookies owned by the usual VPS user. Confirm that host UID; override the service `user` and cache ownership if it differs. Other custom services run as UID 10001.
5. Stop services and migrate existing named-volume ownership with a temporary root utility container: YouTube cache to `1000:1000`; dream data to `10001:10001`. Find actual volume names using `docker volume ls`. Fresh volumes inherit directory ownership from the images. Preserve any old NPC SQLite files from the container layer before recreation, including WAL/SHM files after stopping the service; the new `dream_data` volume stores `/app/data`.
6. **Configure certificate renewal before closing direct origin ports.** Caddy now defaults to loopback publishing; cloudflared reaches `caddy:443` on the Docker network. Do not assume HTTP-01/TLS-ALPN renewal works through the existing HTTPS tunnel. Configure DNS-01 with a narrowly scoped Cloudflare token and a Caddy DNS-provider build, or managed origin certificates with a documented renewal process and an explicit CA trusted by cloudflared. Validate each tunnel hostname. During preparation, set `CADDY_BIND_ADDRESS=0.0.0.0` explicitly and restrict ingress through the provider firewall. Switch to `127.0.0.1` once renewal is ready; check public IPv4 and IPv6 access is closed. These certificate/dashboard changes require operator work outside this PR.
7. Validate Compose, rebuild/recreate the stack, and restart Nakama to load the ES5 hooks. Monitor memory pressure and throttling; the initial limits need tuning from real usage.

## Verify after rollout

- Guest/public/custom joins, chat, movement, music controls, and reconnect work. Guests get server-generated identities; anonymous NPC relationships reset on a fresh join. Signed-in accounts retain their Nakama identity.
- My Room requires sign-in and creates a private single-client room. Another account cannot join. These rooms are per session; persistent owner-to-room mapping is outside this change.
- Joined users and guests can upload JPEG/PNG/GIF/WebP files under 2 MB, 4096×4096, and 16 million pixels. Missing/forged capabilities return 401, oversized dimensions return 400, and quotas return 429. Initial quotas: 5/min per verified principal, 30/min globally, two concurrent decodes.
- Public `/browse`, `/admin*`, `/prefetch*`, and the NPC hostname return 404. Bartender chat and server prefetch work on the private network. The unused browser dream-chat endpoint stays disabled until an authenticated flow exists.
- Access YouTube admin using `ssh -L 8081:127.0.0.1:8081 <user>@<VPS>` and `http://localhost:8081/admin`, with the existing admin bearer credential.
- Native Nakama storage writes/deletes cannot mutate playlists, DMs, wall posts, Postbox data, or rate limits. RPCs and private `user_settings` remain functional. Runtime-key RPC calls without a user session fail.
- Verify custom service users, read-only roots, capability restrictions, CPU/memory/PID limits, and log rotation. Postgres is on a separate internal network.

## Remaining risks and operator work

- **High:** complete direct-origin closure and certificate renewal configuration; verify provider/host firewalls and SSH key-only access. Apply host updates and the pending reboot in a maintenance window. This PR does not change the live host.
- **Medium:** verify backup restoration and alerts for restarts, OOM kills, disk/cache/log pressure, model spend, upload quotas, and certificate expiry. Add Cloudflare request/connection limits based on usage. Process-local limits cannot prevent distributed bandwidth attacks or shared-quota exhaustion.
- **Medium:** browser session tokens remain in localStorage. Token-storage changes and CSP need a separate compatibility pass for KonpyuuTA and third-party iframe apps. Treat iframe content as untrusted.
- **Low:** development CORS entries and legacy/build dependency advisories remain for dependency cleanup. The upload decoder and called AWS modules are upgraded; this is not a claim that every workspace dependency is clean.

## Colyseus PR #70

This PR targets main's 0.17 stack. Pnpm patches are included for **0.17.20 and 0.18.4**, the transport version in #70. They fix abort handling, bound matchmaking bodies, reject untrusted production WebSocket origins, and cap transport connections and matchmaking requests (300 POSTs/min per process). Unused patches are intentional. When merging the other PR, preserve both patch files, `patchedDependencies`, and `allowUnusedPatches`; regenerate the lockfile using pnpm 10.25.0 and rerun server integration tests. Both PRs touch the lockfile and integration fixture, so conflicts may require resolution. The upgrade alone does not fix the abort bug. A local merge with #70 passed 48 server tests on Node 22, the server build, and client TypeScript checks; the only merge conflict was the lockfile.

Nakama hook request shapes were checked against the [official runtime types](https://github.com/heroiclabs/nakama-common/blob/master/index.d.ts).

## Validation

Current stack: 47 server tests, 78 client tests, 22 shared-type tests; server and client production builds; race checks in all three Go services; clean upload `govulncheck`; builds of all four custom service images; Caddy and Compose validation. Local non-root/read-only container checks passed for game server, NPC, and upload. A disposable Nakama 3.24.2/Postgres stack verified native storage denial, private settings writes, authenticated playlist RPCs, and unauthenticated runtime-key denial (`python3 tools/security-nakama-smoke.py`). Nakama requires named global registered handlers; authentication guards run inside each global RPC handler.

CI runs the socket/client/type regressions, server build, Go race tests, and source vulnerability checks on pull requests. NPC source scanning reports no called vulnerabilities, with two package/module advisories outside called paths.

A standalone server `tsc --noEmit` still reports four existing test/configuration errors (null inference and shared tests importing `.ts` extensions); the production bundle builds.
