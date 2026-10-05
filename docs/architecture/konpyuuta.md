# KonpyuuTA — In-World Operating System

KonpyuuTA v2 is a React package consumed directly by `client-3d`. Its desktop, window manager, and apps run in the same React tree as the game. There is no package build step, app iframe bridge, or postMessage API. Embedded video and external browser content still use iframes inside their respective apps.

## Integration

`client-3d/src/ui/konpyuuta/KonpyuuTAShell.tsx` renders when `panelStore.osActive` is true. It injects the reactive account username plus playlist, social, and messenger services through `KonpyuuTAProvider`, then renders `KonpyuuTADesktop`. Shutdown clears `osActive`.

The desktop runs a boot sequence, then renders the top bar, desktop icons, windows, notifications, and CDE panel. `windowStore` owns positions, sizes, z-order, shading, minimization, and four workspaces. `AppRouter` resolves an app ID to its React component. Closing a window unmounts that app.

| File | Responsibility |
| --- | --- |
| `packages/konpyuuta/src/types.ts` | App and injected service contracts |
| `packages/konpyuuta/src/context/KonpyuuTAContext.tsx` | Provider and service access |
| `packages/konpyuuta/src/components/KonpyuuTADesktop.tsx` | Desktop composition and boot |
| `packages/konpyuuta/src/components/AppRouter.tsx` | App routing |
| `packages/konpyuuta/src/stores/windowStore.ts` | Window/workspace state |
| `packages/konpyuuta/src/stores/desktopStore.ts` | Desktop icons, wallpaper, notifications |
| `packages/konpyuuta/src/lib/xpmParser.ts` | Converts `.pm` XPM wallpaper to browser images |
| `packages/konpyuuta/src/styles/cde.css` | Desktop chrome and scoped app styles |

## Account identity

The host subscribes to `authStore.username` and supplies it through the provider. `useCurrentUsername()` resolves this value, falls back to the injected social service for older consumers, and uses `guest` when no account is available. The development preview follows the same auth store.

Boot/profile messages and login text, File Manager home labels/breadcrumbs, and user-owned Process Monitor rows use this identity. System process owners retain their service names. File Manager navigation is stored relative to the home directory, so changing accounts rebases `/home/<username>/` without breaking folder lookup. Bundled tutorial and boot JSON use `{{username}}` placeholders and are personalized when viewed; replacement preserves literal usernames and valid JSON.

## Assets and development

Package exports point at TypeScript source; Vite compiles it with the client. Run `pnpm --filter club-mutant-3d dev` or `pnpm --filter club-mutant-3d build`. Do not run a KonpyuuTA build prerequisite: the package has no build script.

`konpyuutaStaticPlugin` in `client-3d/vite.config.ts` serves `packages/konpyuuta/public/` in development and copies its contents to the production output. Existing desktop chrome uses paths such as `/icons/` and `/backdrops/`. Social app icons are imported through `lib/socialIcons.ts` so Vite includes their assets in the bundle and supplies the URLs consistently. Desktop, panel, and Application Manager use these shared URLs.

The development-only `/__social-toy-review.html` entry opens TinyTubes directly. It uses real search/import responses from `VITE_YOUTUBE_SERVICE_URL` or the local YouTube service on port 8081 (run `go run .` from `services/youtube-api`), plus the shared playlist adapter in `client-3d/src/ui/konpyuuta/playlistService.ts`. It does not replace `fetch` with sample results. Use the game desktop for authenticated social apps. Vite’s production entry remains `index.html`.

## TinyTubes

TinyTubes uses the existing `mutanttube` app ID and `components/apps/MutantTube.tsx`; it implements discovery, search, category shelves, a paginated video grid, playlist management, and an embedded watch view. Its visual direction is a miniature castle broadcast station: a crooked stone tower, pennant antenna, and goblin signal keeper. The interface mixes serif lettering, paper textures, numbered channels, and collectible video cards. The station’s signal pulses while loading; Netscape's own loading indicator uses immediate pixel stars. Both respect reduced-motion settings.

`lib/mutantTube.ts` provides video normalization, playlist URL validation, track-to-video resolution, random query selection, duration parsing, and cancellable HTTP requests with a 30-second timeout.

### Daily feature

Home begins with a shared “Unpopular video of the day” card from `GET /featured`, independently of the audience toggle and random discovery shelves. `services/youtube-api/featured.go` keeps one UTC-day pick in `<DISK_CACHE_DIR>/daily/featured.json` (override with `FEATURED_STATE_FILE`). Each request verifies its current count through InnerTube watch-page metadata; counts of 100+, unknown counts, and failed verification never serve a cached eligible feature. The pick stays stable across refreshes, Surprise Me, and service restarts, unless it becomes ineligible. Selection uses a bounded, coalesced job and a small low-view candidate pool. No popular fallback is allowed.

Home rechecks every minute while visible, on returning to Home, and when the browser tab becomes visible. Failed verification clears the card; `normalizeDailyFeature` rejects expired dates, stale checks, and counts outside 0–99. The card opens the existing watch view and playlist-saving flow. The featured route and client must be deployed together.

### Browsing

- Home and Surprise Me select three random queries from the discovery term pool.
- Category shelves select two queries from that shelf's terms.
- Home, categories, Surprise Me, and search default to **Under 100 views**, requesting `maxViews=99&limit=50`. The Go service scans up to three pages of ordinary search and three of this month's uploads concurrently within 24 seconds, then deduplicates, excludes unknown/live counts, filters before limiting, and sorts lowest first. The client also enforces 0–99 known views. Empty searches stay empty, with an explicit All videos option.
- The audience toggle preserves the active search/category. All videos retains API relevance for search and lowest-view ordering for discovery.
- View parsing handles comma-separated and K/M/B counts correctly; missing or hidden counts stay unknown. Filtered caches expire within five minutes. Deploy the updated YouTube service along with the client for full low-view discovery.
- If one discovery query fails, results from successful queries still render.
- Each new view request aborts its predecessor. Request IDs prevent stale results from changing the selected view.
- Missing thumbnails fall back to the standard YouTube image URL; failed images render a play symbol.

Requests go to the injected `env.youtubeApiUrl`. The shell uses `VITE_YOUTUBE_SERVICE_URL` when set, otherwise localhost port 8081 in local development or `https://yt.mutante.club` in production. The frontend domain's `/youtube` path does not proxy the service.

| Endpoint | Use |
| --- | --- |
| `GET /search?q=...&limit=...` | Video search (`items` array) |
| `GET /playlist/{playlistId}` | Public playlist import, up to 500 available videos |

Video playback uses a titled `youtube-nocookie.com` embed with autoplay permission and an Open on YouTube link for unavailable embeds. Playlist watch views offer explicit previous/next controls; they do not automatically advance at the end of a video.

### Playlists

The injected `PlaylistService` adapts `client-3d/src/stores/playlistStore.ts`. The same library is used by the game's playlist panel:

- Local edits persist synchronously to localStorage.
- Authenticated edits schedule Nakama saves after 500 ms.
- `loadFromServer` fetches metadata; `ensureItemsLoaded` hydrates tracks before editing or opening a lazy playlist.
- `createPlaylist` returns the actual created ID. Track IDs are local UUIDs; YouTube IDs are resolved from track links.
- TinyTubes subscribes to store changes and derives its selected playlist from the current list.
- Metadata is loaded once per app session, including before saving a video. Mutations refresh from the local store rather than reloading server data, avoiding races with pending saves/deletes.
- The app supports create, rename, delete, import, add/remove videos, duplicate prevention, and manual reordering.
- Store limits mirror Nakama: 100 playlists, 500 tracks per playlist, 60-character names.
- Sync errors display a local-save/online-sync notice. Authenticated persistence still depends on Nakama connectivity.

Imports reject mixes (`RD*`), Watch Later, Liked Videos, private lists, and unrelated hosts. Import feedback distinguishes available tracks from the playlist's declared total and reports partial imports.

## Other social apps

**Guestbook** retains the `mutantbook` app ID and `components/apps/MutantBook.tsx`. It uses `SocialService` for account/profile lookup, friends, and wall posts. The host adapter calls Nakama through `client-3d/src/network/nakamaClient.ts`.

**Messenger** uses `client-3d/src/services/messengerService.ts` for Nakama message storage, conversation lists, history, and conversation read state. Its lavender console, mint buddy list, and cream chat paper have searchable contacts, per-conversation drafts, sent/pending/failed states with retry, date separators, typing, and a single-pane layout for windows narrower than 580px.

- Notification code 100 carries the full body, server message ID, and server timestamp. Preview-only notifications from older deployments are explicitly marked and hydrated from history when opened. `notificationSend` takes content before code; both DM and wall notifications use this order.
- The shared Nakama client owns socket event registries. Messenger subscribes to channel and socket changes, rejoins typing channels after reconnect, and clears typing timers when disconnected. Simultaneous connection/restore calls share one promise. Account changes close the old socket and clear Messenger's messages and drafts.
- History requests are tracked by conversation. Merging deduplicates real message IDs, orders by server time, preserves failed/pending messages, and replaces previews with complete bodies. A successful send replaces its temporary UUID with the returned server ID; failed sends retain their text and expose a retry control.
- The current `dm_messages` storage collection is shared across all of an owner's partners, ordered by timestamp keys. The RPC scans at most five raw pages per call and returns every matching message from those pages; it must never trim the matches after advancing its cursor. The host follows every cursor, including empty filtered pages, before returning chronological history. Long account histories therefore require multiple RPCs per open; conversation-specific storage would be needed to reduce that cost at scale.
- All conversation-summary pages are loaded. Friend presence follows Nakama status updates and is re-established after socket replacement.
- Read state clears only after history loads and `mark_read` succeeds while the conversation is in the focused OS window and the browser is visible/focused. Typing channels are transient; durable messages remain in Nakama storage.
- The message composer enforces the server's 2,000-character limit and respects IME composition. The viewport renders the latest 80 messages initially; “Show earlier messages” reveals older loaded history while preserving scroll position. Incoming messages do not force a reader away from older history.

**Postbox** (internal app ID `mutantmail`) sends subject/body letters to Club Mutant usernames. `mailService.ts` uses the shared Nakama auth/socket and `send_letter`, `list_letters`, `update_letter` RPCs. Letters use `postbox_letters`, separate from Messenger DMs; notification code 101 refreshes mail without opening a chat. The server owns Inbox/Sent copies and read/trash/restore/delete state. A create-only receipt in `postbox_receipts` makes each draft request idempotent, including concurrent retries and retries after the Sent copy is deleted. Receipts contain only an ID/timestamp, not letter content. Deleting a letter affects only the caller’s copy.

`stores/mailStore.ts` keeps drafts and a mail cache per account ID in `konpyuuta-postbox`. Draft fields save on each edit; sending only removes the draft after server acknowledgment. Refresh preserves local drafts, stale account results are ignored, and failures leave the draft available. The former unowned `konpyuuta-mail` prototype archive stays intact and can be explicitly imported as local, undelivered copies. Guests can keep drafts but cannot send. This is in-world correspondence, not external email.

Verification: `pnpm --filter club-mutant-3d test` covers Postbox storage and transport; `node nakama/tests/postbox.integration.mjs` uses disposable local accounts to verify delivery, notifications, retry deduplication, account isolation, permission checks, full content, and folder operations.

## Adding an app

1. Add a React component in `packages/konpyuuta/src/components/apps/`.
2. Register its ID in `AppRouter.tsx` and its launchers in desktop/panel/Application Manager as needed.
3. Define new service contracts in `src/types.ts` before using host data.
4. Inject host implementations from `KonpyuuTAShell.tsx` and access them with `useKonpyuuTA`.
5. Scope CSS to the app root and verify normal and narrow window sizes.

## Verification

`pnpm --filter club-mutant-3d test` includes TinyTubes parsing/API tests, playlist store regressions, Messenger state/transport regressions, socket lifecycle checks, and VM tests of the Nakama DM runtime. `pnpm --filter club-mutant-3d build` type-checks the host and package and builds the production client. Browser checks should include live search/import, changing categories while a search is pending, first-video saving, and playlist navigation.

For Messenger integration verification, start `docker compose -f docker-compose.dev.yml up -d`, restart Nakama after runtime edits, then run `node nakama/tests/messenger.integration.mjs`. It creates and deletes its own local device accounts on `127.0.0.1:7350`, checking full realtime bodies, storage history, unread/read state, typing, reconnect, and pagination without gaps. It never targets production. Browser review should cover contact search, drafts when switching chats, delayed/failed history, failed-send retry, incoming full bodies, focus-dependent unread counts, and narrow-window back navigation.

The social launcher SVGs live in `public/icons/apps/`: TinyTubes has a castle broadcast tower and goblin keeper, Messenger a goblin letter courier, Guestbook a notebook, and Postbox a stamped envelope. `lib/socialIcons.ts` imports them as Vite assets for consistent launcher URLs.

`AnalogAccents.tsx` supplies serif wordmarks and crayon stars; `PixelSymbol.tsx` supplies small control symbols. `WeeBeastie.tsx` draws four distinct inhabitants (goblin, moth courier, one-eyed troll, and imp), assigned deterministically from user IDs. These appear in Messenger and Guestbook; uploaded Guestbook profile pictures take precedence. `LittleKingdom.tsx` supplies the broadcast station and Messenger’s illustrated castle gate. Guestbook retains ruled notebook paper, tab dividers, and sticker details. Blinking, courier motion, and pennants respect reduced-motion preferences. App styles remain scoped in `cde.css`; container queries adapt to the OS window width.
