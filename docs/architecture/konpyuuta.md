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

The development-only `/__social-toy-review.html?app=mutanttube` entry mounts the real `KonpyuuTAShell` and opens the requested app (`mutanttube`, `messenger`, `mutantbook`, `mutantmail`, or `netscape` for NEETscape). Search/import responses come from `VITE_YOUTUBE_SERVICE_URL` or the local YouTube service on port 8081 (run `go run .` from `services/youtube-api`). It does not substitute sample results or bypass authentication; Messenger, Guestbook, and delivery use the current signed-in session. Vite’s production entry remains `index.html`.

## TinyTubes

TinyTubes uses the existing `mutanttube` app ID and `components/apps/MutantTube.tsx`; it implements discovery, search, category shelves, a paginated video grid, playlist management, and an embedded watch view. Its liquid Y2K direction combines dark reading surfaces, acid-green refracted light, serif titles, and a rendered glass tube/play icon. Numbered channels and video cards retain their existing layout and interactions.

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

**Messenger** uses `client-3d/src/services/messengerService.ts` for Nakama message storage, conversation lists, history, and conversation read state. Its dark contact list and opaque green reading pane have searchable contacts, per-conversation drafts, sent/pending/failed states with retry, date separators, typing, and a single-pane layout for windows narrower than 580px.

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

## Liquid signal visuals

`styles/liquid.css` scopes the desktop and social theme under `.cde-root.liquid-signal`, retaining the existing layout/container queries in `cde.css`. The default desktop uses `src/assets/liquid-signal.jpg`; custom image wallpapers remain supported. The original wallpaper was generated with built-in imagegen: dark liquid glass, acid-green caustics, a dark upper-left void, violet edges, photographic bloom and fine grain, with no text or logos.

`tools/render-social-icons.py` authors seven Blender scenes: TinyTubes' glass tube/play symbol, Messenger's paired speech bubbles, Postbox's envelope, Guestbook's book, NEETscape's orbital sphere, Style Manager's gear, and File Manager's folder. `lib/socialIcons.ts` bundles their PNG posters and transparent APNG loops. Desktop icons animate; headers and dock use stills. A native `<picture>` media source selects the poster for reduced motion. Each loop is 24 frames at 6 fps (four seconds), rendered at 128px without runtime WebGL.

Regenerate with Blender 5.x and ffmpeg:

```sh
blender -b --python tools/render-social-icons.py -- --frames 24
# Repeat packaging for each scene name; its 000.png is the static poster.
ffmpeg -framerate 6 -i /tmp/club-mutant-liquid-icons/mutanttube/%03d.png -plays 0 -f apng packages/konpyuuta/public/icons/apps/mutanttube.apng
```

`SignalOrgan.tsx` supplies a slowly breathing refractive membrane and deterministic user-ID avatars; uploaded Guestbook profile pictures take precedence. `AnalogAccents.tsx` supplies serif wordmarks and small light flares, and `PixelSymbol.tsx` now draws smooth control symbols.

`SignalTransition.tsx` uses `lib/mojibake.ts` for a decorative 980ms corruption/resolve pass limited to explicitly marked headings (`data-signal-text`). TinyTubes marks its browse/collection heading after loading; Messenger and Guestbook mark their introductory heading; Postbox marks its folder heading; NEETscape marks the current page heading. Controls, video titles, profile content, letter bodies, and wordmarks stay steady. TinyTubes uses custom SVG tubular lettering in `TinyTubesWordmark.tsx`. Inputs, stored data, live announcements, and alerts are never re-encoded. Interaction, scrolling, asynchronous content changes, resizing, and reduced-motion preferences restore readable originals immediately. `mojibake.test.ts` verifies Unicode resolution, whitespace, bounded progress, and changing noise.

Messenger additionally uses `IncomingMessageText.tsx` for a 630ms corruption/resolve pass on a newly received full message. The store issues a short-lived, consumable visual arrival token only from `receiveMessage`, never history loading or optimistic sends. Duplicate notifications and reopened threads do not replay it. Pending tokens are capped at 80 and expire after three seconds; account changes clear them. The original message remains intact in the polite live log, while an `aria-hidden` visual copy animates. Reduced motion, pointer/keyboard/focus interaction, and hidden documents restore readable text. Store regression tests cover deduplication, preview upgrades, history isolation, token expiry/bounds, and account changes.

### Desktop taskbar

`Panel.tsx` renders a single floating glass rail: Applications, six shared glass app posters, four numbered workspace selectors, and a Desktop tools tray. Smooth vector symbols replace the old camera/activity bitmaps and duplicate gears. Running apps show a small light; the active app has a brighter underline. Tooltips also appear on keyboard focus. The tools tray contains Style Manager, Screenshot, Calendar, and Process Monitor; outside clicks and Escape dismiss it, with Escape restoring focus to the trigger.

App shortcuts reuse the most recent matching window in the current workspace, restoring minimized or shaded windows before focusing them. Other workspaces keep their own windows. On narrow screens the shortcut group scrolls horizontally while the launcher, workspaces, and tools stay available.

### NEETscape

`components/apps/NEETscape.tsx` replaces the Netscape imitation while retaining the `netscape` app ID for existing callers. Its orbital glass identity is shared by the desktop, taskbar, and Application Manager. Lynx has been removed from the active router, desktop, launcher, and bundled data/assets.

NEETscape is a local network portal. Start, Directory, Field guide, and About are real React pages at `neet://home`, `neet://directory`, `neet://guide`, and `neet://about`; navigation supports Back/Forward, branch replacement, Home, Reload, and address selection with Ctrl/Command+L while focused inside the app. Directory filtering and its four app destinations use current social windows rather than stale iframe paths.

`lib/neetNavigation.ts` validates addresses. HTTP(S) destinations display an explicit Open website link to the user's web browser; they are not embedded or claimed to be loaded within KonpyuuTA. Executable protocols, credential-bearing URLs, unknown local routes, and malformed addresses are rejected. Parser tests cover those boundaries. The dev review accepts `?app=netscape`.
