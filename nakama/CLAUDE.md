# nakama

Nakama auth sidecar — handles authentication, user profiles, playlists, DMs, and wall posts.

## CRITICAL: ES5 ONLY

The Nakama runtime uses the **goja** JavaScript engine which only supports ES5. **Do NOT use:**
- `const` or `let` (use `var`)
- Arrow functions (use `function() {}`)
- Template literals (use string concatenation)
- Destructuring
- `for...of` loops
- Default parameters
- Spread operator
- Classes
- Promises/async/await

Code will **silently fail** or produce cryptic errors if you use modern JS syntax.

## Structure

- `modules/index.js` — All runtime RPCs in a single file

## RPCs (registered in InitModule)

- `update_profile` / `get_profile` — User metadata (bio, favorite_song, links, background_url)
- `save_playlist` / `delete_playlist` / `list_playlists` — Playlist CRUD (Nakama Storage Engine)
- `send_message` / `list_conversations` / `get_messages` / `mark_read` — Direct messaging
- `create_wall_post` / `get_wall_posts` / `delete_wall_post` — Wall posts (friends-only)

## Adding a New RPC

1. Write handler function in `modules/index.js` using ES5 syntax
2. Register in `InitModule`: `initializer.registerRpc('your_rpc_name', yourHandler)`
3. Test by restarting Nakama: `docker compose -f docker-compose.dev.yml restart nakama`

## Auth Flow

1. Client authenticates with Nakama (email or device auth) → gets JWT
2. JWT passed as `nakamaToken` in Colyseus room join options
3. Server verifies JWT via `server/src/lib/verifyNakamaToken.ts`

## Unauthenticated RPCs

Use `--runtime.http_key` for RPCs that don't require auth (configured in docker-compose).
