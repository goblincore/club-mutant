# Club Mutant security audit

This report describes the pre-hardening baseline. See the [hardening rollout](../guides/security-hardening-rollout.md) for implemented fixes and remaining operator work.

Reviewed on October 11, 2026. The highest risks are inexpensive service crashes, requests that can reach private services, unauthenticated upload and AI spending, and missing room isolation. No VPS remote code execution or complete account takeover was demonstrated. The application needs hardening before broad public exposure.

## Scope and evidence

Reviewed Colyseus authentication and message handlers, Nakama RPCs and storage permissions, image upload, NPC chat and heartbeat, the YouTube proxy and worker queue, client token handling, Caddy, Dockerfiles, and Hetzner Compose. Local checkout: `0ed2870`. VPS checkout: `6c57675`. SHA256 hashes matched for eight principal source/config files, including the room implementation, all three service entrypoints, Nakama module, server entrypoint, Caddyfile, and Compose. The running Caddyfile matched too. Running Colyseus core and uWebSockets transport versions are `0.17.42` and `0.17.20`.

Read-only VPS inspection confirmed Ubuntu 24.04.4, ports 22/80/443 listening on IPv4 and IPv6, direct-origin HTTPS access, container resource settings, file permissions, and a pending reboot. No production crash, exploit upload, private-data read, service restart, firewall change, or application patch was performed. Matching checkout files establish deployed configuration/source evidence; they are not a full attestation of every running image.

Seven local reproduction tests passed, demonstrating existing vulnerable behavior. A separate Go test demonstrated browse redirect SSRF. Two isolated local child processes terminated with exit code 1: one after an aborted HTTP request and one after a malformed chat sent over a real WebSocket. These checks deliberately assert current weaknesses; remediation should replace them with rejection/survival regression tests.

Severity reflects practical impact and prerequisites, rather than automatically adopting dependency-scanner scores.

## High severity findings

### 1 Game server can be terminated by malformed input

**Evidence:** `server/src/rooms/ClubMutant.ts:1015–1036` reads `message.content` and calls `.trim()` without runtime validation. Colyseus core catches decoding/validator errors but invokes application handlers outside that catch; this room does not implement `onUncaughtException`. A joined guest sent a null chat payload through the SDK to an isolated local server; the process exited 1 with a TypeError at line 1023. Other handlers also dereference unvalidated payloads.

There is a second crash path in installed `@colyseus/uwebsockets-transport@0.17.20`: its Express-fallback abort handler assigns to getter-only `writableEnded`. An aborted local `POST /health` terminated an isolated process with exit 1. The current Caddy allowlist forwards `/health` regardless of method, and also permits an entire `/matchmake/*` prefix. Its unknown-path workaround therefore leaves admitted Express fallback routes exposed. The HTTP child used the deployed transport version; the WebSocket child used the same room/core with the testing server's WebSocket transport. Neither crash was attempted on the VPS.

**Impact:** A guest can potentially interrupt every room sharing the Node process. Automatic container restart does not prevent repeated outages.

**Hardening:** Register runtime schemas for every message and validate before state mutation, dispatch, or broadcast. Add a room-level exception boundary that logs safely and closes the offending connection. Patch the transport through a reproducible pnpm patch, or migrate to a transport verified to survive aborts. Serve health directly in Caddy, restrict methods and actual matchmaking routes, and test aborted requests through the proxy locally. Do not rely solely on the broad path allowlist.

### 2 Browse proxy can follow redirects into private services

**Evidence:** `services/youtube-api/main.go:1645–1710` checks the initial hostname with `net.LookupIP`, then uses an HTTP client without a redirect policy or a validated dialer. The service is publicly proxied by Caddy. A local fixture mapped an initially public IP to a simulated external redirect server; its redirect to a real loopback service was followed and the private response body returned. No outside host was contacted by the fixture.

**Impact:** Server-side request forgery can expose reachable internal HTTP services. Exact VPS destinations depend on the configured residential proxy: the production HTTP client can route through `PROXY_URL`, so the vulnerable egress boundary may be the proxy's network instead of the VPS network. DNS validation and connection resolution are also separate, leaving rebinding exposure. No private production data was fetched.

**Hardening:** Disable `/browse` until it has an isolated fetcher. Reject redirects or validate every hop, validate and pin the address actually dialed, reject all nonpublic address ranges, constrain ports, and enforce outbound network policy. Keep arbitrary browsing separate from privileged internal networks and the authenticated admin origin. [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) specifically addresses redirect and DNS bypasses.

### 3 Public uploads allow storage abuse and image decoding denial of service

**Evidence:** `services/image-upload/main.go:159–215` requires only a caller-supplied multipart `sessionId`; it verifies no token. Changing that string bypasses the five-per-minute limiter. A 2 MB compressed-body cap is present, but pixel dimensions are inspected only after full decoding. The claimed format comes from the caller's multipart Content-Type. The imaging dependency registers TIFF and BMP decoders too, so the advertised format list does not constrain actual decoding.

`govulncheck` reported nine symbol-reachable advisories across image and AWS SDK dependencies. The directly relevant image issues include [GO-2026-6222](https://pkg.go.dev/vuln/GO-2026-6222), excessive VP8L allocation, and [GO-2026-4815](https://pkg.go.dev/vuln/GO-2026-4815), TIFF allocations up to 4 GiB. The installed `golang.org/x/image` is `v0.24.0`; the VP8L fix is `v0.45.0`. The 32-bit-only WebP advisory does not establish impact on the VPS's 64-bit runtime. AWS event-stream scanner reachability alone does not establish an attack through the R2 PutObject path.

**Impact:** Anonymous callers can consume storage/operations and force expensive decodes. Memory exhaustion is especially dangerous with no container memory limit.

**Hardening:** Verify a Nakama access token or a short-lived upload capability before parsing/decoding. Rate limit by verified identity and trusted IP, plus a service-wide budget. Upgrade image libraries and the compatible Go toolchain. Validate actual format, dimensions, and total pixels before full decode; reject TIFF/BMP explicitly. Bound concurrent decodes, storage per user, and object retention. Scope R2 credentials to the required bucket and operations.

### 4 Unbounded client work can exhaust the shared VPS

**Evidence:** `server/src/index.ts:98` allows 1 MiB frames. The room's `maxMessagesPerSecond` remains Infinity. Existing throttles cover selected messages, not all traffic. A 64 KiB chat was accepted; 1,000 arbitrary unique collectibles were accepted. `RoomQueuePlaylistAddCommand.ts:31–89` has no item cap or add throttle. `ClubMutant.ts:788–794` trusts custom-room `autoDispose`; a creator can disable disposal. Room initialization precedes join authentication, and there is no application room-creation quota.

Public YouTube prefetch accepts priority hints; its queue deduplicates IDs but has no length cap (`services/youtube-api/prefetch_queue.go:119–165`). Search, resolve, proxy, and analysis are also publicly exposed without application authentication/rate middleware. yt-dlp and analysis semaphores help bound active heavy work, but do not bound request/queue accumulation or bandwidth consumption.

Live Docker inspection showed no configured CPU, memory, or PID limits for any container. Log drivers were `json-file` with empty per-container options; daemon-wide rotation settings were not verified.

**Impact:** One abusive connection or many cheap HTTP requests can degrade the game, auth/database, AI, or the whole host. A room cap of 50 players does not cap sockets, room count, state bytes, or queued work.

**Hardening:** Start with a measured 16–64 KiB frame cap and a finite aggregate message budget, then add stricter per-action and byte budgets. Cap chat/name/title/link lengths, collection sizes, room lifetime/count, and queue depth. Accept only known collectible IDs. Keep room lifecycle flags server-owned. Protect internal prefetch; apply fair scheduling, cancellation and rejection when full. Add explicit Docker memory/CPU/PID budgets with headroom for Postgres and the OS, plus bounded log rotation. [OWASP WebSocket guidance](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html) covers message and connection resource controls.

### 5 Public NPC routes trust caller supplied identities and world state

**Evidence:** Caddy proxies all of `dream.mutante.club`. `services/dream-npc-go/main.go:61–85` exposes dream chat, bartender chat and heartbeat without authentication. Bartender limiting uses a supplied `roomId`; dream limiting selects the first forwarded IP. `npc/chat.go:99–174` uses supplied `playerId` to read/add persistent memory and update relationships. Heartbeat accepts a supplied world snapshot and can generate model calls or alter NPC state without the chat limiter.

**Impact:** A caller can impersonate another player's NPC-memory identity, attempt memory extraction through prompts, poison memory/relationships, manipulate NPC state, and consume paid model capacity. Memory extraction was not demonstrated. Global chat quotas reduce spending but allow outsiders to consume capacity intended for players; heartbeat has separate trigger/state throttling, rather than authenticated admission.

**Hardening:** Keep bartender chat/heartbeat server-only, using authenticated service requests and a proxy path allowlist. If dream chat stays browser-facing, verify a player token/capability and derive identity server-side. Bound history/message/snapshot sizes and all model calls with global spending/concurrency limits. Use one atomic limiter reservation instead of separate Check/Record operations. Trust forwarded addresses only across the configured proxy chain.

### 6 My Room has no per user isolation

**Evidence:** `server/src/index.ts:111–118` registers My Room without an owner filter or owner authorization. `NetworkManager.ts:273` calls `joinOrCreate`; `ClubMutant.onAuth` allows guests. A local SDK test with two different users requesting My Room returned the same room ID and two players in the shared room. `isPublic: false` is an application flag; it is not an authorization rule.

**Impact:** Users expecting a personal room can share state/chat/music with unrelated users. Knowing a room ID also does not trigger any owner-only join check.

**Hardening:** Bind personal-room ownership to a verified Nakama UID. Match on server-derived ownership and enforce it independently in `onAuth`. Define an explicit invitation policy if visitors are supported. Hide private rooms from listing, but retain authorization even when their IDs are known.

### 7 Cloudflare can be bypassed through the origin

**Evidence:** Compose publishes Caddy on all host addresses, and live listeners include IPv4/IPv6 80/443. An external HTTPS request using the normal API hostname/SNI pinned directly to the VPS IP returned HTTP 200 from `/health`. Cloudflare Tunnel is running, but the origin remains directly reachable.

**Impact:** Edge rate limits, bot controls, and other Cloudflare filtering cannot protect traffic arriving directly at Caddy. Caddy's own routing still applies. Large traffic volumes can consume the VPS connection/bandwidth budget.

**Hardening:** Make ingress tunnel-only where practical: remove public Caddy port publishing and deny inbound 80/443 on IPv4 and IPv6. Caddy certificate issuance/renewal currently uses public-hostname configuration; plan DNS challenge or a verified tunnel-origin TLS setup before closing ports. Restrict SSH by source/VPN and keep a tested recovery path. Verify Docker firewall behavior externally; published ports can bypass UFW's expected filtering. [Docker firewall documentation](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

## Medium severity findings

| Finding | Evidence and impact | Suggested hardening |
| --- | --- | --- |
| Guest identity can impersonate room owner | `ClubMutant.ts:1308–1317` trusts guest `options.playerId`; owner checks at 1099–1101 compare that value to schema-visible `creatorPlayerId`. A second guest spoofed it and enabled the rotation NPC in a local test. Current demonstrated privilege is NPC room settings. | Assign guests a server-generated identity/capability. Separate authenticated UID from display/persistent client identifiers; bind ownership to the verified principal. |
| Any visitor can remove jukebox tracks | `ClubMutant.ts:1224–1231` admits completion from any client; `JukeboxCommand.ts:248–275` makes stream ID optional and removes the head item. Local test emptied a track with `{}`. | Require a valid current stream ID, playing state, and authorized reporter; preferably advance against server time/watchdog. Require reasonable elapsed playback before accepting completion. |
| Nakama runtime HTTP key is also a public client key | Compose line 152 reuses `NAKAMA_SERVER_KEY` for `runtime.http_key`; the frontend ships the socket/server key in its bundle. Several RPCs omit an explicit authenticated-user guard. This exposes HTTP-key invocation, although arbitrary account takeover was not demonstrated. | Give runtime HTTP calls a separate random secret, restrict their routes, and require `ctx.userId` for user RPCs. [Nakama headless authentication](https://heroiclabs.com/docs/nakama/guides/concepts/headless-server-auth/) explains this key's server-to-server role. |
| Native storage writes bypass playlist constraints | `nakama/modules/index.js:358–364` sets `permissionWrite: 1`; no before-write storage hook protects collections. Owners can call native storage APIs without the RPC's track/string/quota validation. New arbitrary collection writes need guarding too. | Use server-only writes for protected collections and before-write/delete hooks to reject client mutations/creation there. Apply quotas across native APIs, RPCs, and all enabled account creation methods. [Nakama access controls](https://heroiclabs.com/docs/nakama/concepts/storage/permissions/) defines owner-write access. |
| Secrets readable by other local users | Live `.env` and YouTube cookies permissions were `0664`, which includes world read. This is a local disclosure condition, not proof of remote access. | Restrict directory/file ownership and permissions, generally 0700/0600 or a narrowly scoped service group. Check ACLs and backups. Rotate secrets if their exposure cannot be ruled out. |
| Arbitrary proxied HTML shares the YouTube admin origin | `/browse` preserves upstream scripts and strips CSP/X-Frame-Options. `/admin` stores its token in same-origin sessionStorage. An admin opening attacker HTML in the same tab can expose that token; no admin-session exploit was attempted. | Host browsing on a separate isolated origin with suitable sandboxing; protect admin routes with Access/VPN and separate origin/token handling. |
| Socket admission and session lifetime are insufficient | CORS headers do not reject WebSocket origins. The installed upgrade handler lacks an origin check. JWT expiry is verified only at join; the room has no expiry/revocation timer. Room passwords have no attempt budget. | Enforce a production origin allowlist at upgrade, finite per-IP/account connections, bounded password attempts, and expiry/revocation policy for long-lived authenticated sockets. Origin checks supplement authentication. Cookie-based session hijacking was not demonstrated. |
| Container privilege and network separation are weak | Most live images have no configured user, writable roots, and a shared default Compose network. An empty Docker user value does not prove every process remains root: images such as Postgres may drop privileges. Custom service Dockerfiles do not define a nonroot runtime user. | Run custom services as nonroot; drop unnecessary capabilities, add no-new-privileges, and make roots read-only with explicit writable mounts. Separate database/backend/frontend/egress networks; arbitrary browse workers must not reach Postgres/Nakama/internal control endpoints. |
| HTTP servers and credential logs need hardening | Image-upload uses `http.ListenAndServe`; YouTube's `http.Server` specifies no read-header/idle timeout. `main.go:263` logs the entire proxy URL, which can contain credentials. Long-lived proxy streams need different timeouts from uploads. | Set appropriate header/body/idle limits per endpoint, bounded workers and cancellation. Redact URL userinfo and secrets from logs. Apply log retention and keep runtime telemetry free of sensitive payloads. |

## Lower severity risks and operational checks

- Nakama access and 30-day refresh tokens are in localStorage (`client-3d/src/stores/authStore.ts`). This increases the impact of a future frontend XSS. Keep React escaping, validate profile link schemes, add a frontend CSP compatible with WASM/media, and consider shorter sessions or an HttpOnly-cookie gateway if the auth architecture supports it.
- Chat storage validates CDN image URLs, but the live broadcast sends the original URL (`ClubMutant.ts:1030`). ChatBubble3D loads it without the history panel's CDN check. The local test confirmed this disagreement; external image requests can track viewers or consume their resources. Broadcast the validated payload and enforce the same rule at the texture loader.
- Production origin lists still include localhost. Move dev origins into nonproduction configuration. Profile URLs are only length-checked; allow only approved schemes on both write and rendering paths.
- A reboot-required marker exists on the VPS. Exact pending security updates, unattended-upgrades policy, SSH authentication settings, host/Hetzner firewall rules, Cloudflare WAF/Tunnel policies, R2 IAM scope, and backup/restore procedures remain unverified. Sudo-only reads required a password; no elevation or settings change was attempted.
- Add tested encrypted off-host Postgres/NPC backups and restore drills. Monitor process crashes, connection/message rejection rates, RSS/CPU, queue depth, disk/log growth, and AI/R2/proxy spending. Set actionable alerts rather than logging every payload.

## Dependency scan interpretation

`pnpm audit --prod --json` reported 3 critical, 69 high, 57 moderate and 10 low workspace advisories. This includes legacy root dependencies and blog/build paths, so these scores do not establish three critical remote production vulnerabilities. Examples: tar sits under native-module installation tooling; Astro's image-optimization advisory needs an exposed affected server path; proxy-addr impact depends on trust-proxy use. No such production exploit path was established here. Remove unused root/server dependencies and upgrade affected runtime/build packages with focused compatibility tests. Raw results are retained under `artifacts/security-audit/pnpm-audit.json`.

Go source scans found nine symbol-reachable advisories in upload; YouTube had no findings, and NPC had no called-symbol findings while retaining package/module findings. The tool auto-selected Go 1.26.9; the deployed upload/NPC binaries report Go 1.24.13. These source scans therefore do not clear the deployed standard libraries, OS packages, ffmpeg, yt-dlp, Nakama or base images. Scan the actual rebuilt images and binaries, update the Go build images and pin reproducible dependency/image revisions.

## Recommended implementation order

1. **First:** stop the server crash paths, disable/isolate browse, protect upload and update its decoders, and make bartender/heartbeat internal.
2. **Next:** enforce My Room ownership and server-issued guest identity; implement payload/collection/room/queue limits and aggregate socket budgets. Add container resource limits.
3. **Then:** close direct-origin ingress after preparing certificate renewal, split the Nakama runtime key, protect native storage APIs, restrict secret file permissions, isolate containers/networks, and protect admin.
4. **Before wider launch:** verify SSH/firewalls, restore backups, patch/reboot the host during a maintenance window, add dependency/image scans to CI, and test malformed/expired/replayed messages and resource saturation against staging.

## Reproduction artifacts

- `artifacts/security-audit/room-reproductions.test.ts`: seven local behavior checks. Run `pnpm exec vitest run artifacts/security-audit/room-reproductions.test.ts` from the repository root. These tests expect vulnerable behavior and must not become permanent security regression expectations.
- `artifacts/security-audit/browse-reproduction.go.txt`: local-only redirect fixture; temporarily place it as a `_test.go` file in `services/youtube-api`, run its named test, then remove the temporary file.
- Room/browse outputs, WebSocket child crash output, and dependency scanner results are saved beside them. `http-abort-reproduction.py` and its result capture the local HTTP-abort crash (exit 1 with the getter-only `writableEnded` TypeError).

No application hardening has been applied by this audit.
