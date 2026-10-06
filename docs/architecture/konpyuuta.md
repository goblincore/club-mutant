# KonpyuuTA — In-World Social Portal

KonpyuuTA v2 is a React package consumed directly by `client-3d`. Its NEETscape home and social apps run in the same React tree as the game. There is no package build step, app iframe bridge, or postMessage API. Embedded YouTube video still uses an iframe inside TinyTubes.

## Integration

The main client imports only `client-3d/src/ui/konpyuuta/KonpyuuTALauncher.tsx`, a small gate around `React.lazy`. `panelStore.osActive` triggers the first dynamic import of `KonpyuuTAShell.tsx`; Vite loads its desktop JS and separate CSS at that point. Loading and failed imports have a return-to-club control; failed loads also offer retry. Club-only visits do not initialize OS stores or services. After first use, the shell remains mounted and renders null when closed, preserving its service lifecycle and app identities for reopening. Shutdown clears `osActive`.

`KonpyuuTAShell.tsx` injects the reactive account username plus playlist, social, messenger, and mail services through `KonpyuuTAProvider`, then renders `KonpyuuTADesktop`. The production build runs `tools/check-konpyuuta-bundle.mjs` against Vite's manifest to ensure desktop JS, CSS, and visual assets stay outside the main entry's static import graph. Shared host dependencies (React, networking, auth, playlists) remain shared.

`KonpyuuTADesktop` now renders NEETscape as the full-screen home, with six floating shortcuts and the liquid wallpaper. The ASCII devil boot sequence plays on entry; Skip, Enter, or Escape advances to home, and reduced motion skips it automatically. The upper bar exposes power, friends online, interface sound, and time. Apps use a resizable reading surface with a Home control; Messenger is an independent narrow buddy-list companion, open by default. There is no taskbar, workspace switcher, browser address bar, desktop utility launcher, or draggable window chrome.

`lib/portalApps.ts` owns the six app IDs and labels. `openPortalApp` reuses an existing app identity in `windowStore`; `showHome` clears the active identity without deleting it. The active reading-surface app unmounts on returning home, stopping embedded playback and its view subscriptions. Messenger remains mounted while hidden or closed to receive messages and presence; Messenger drafts/history and Postbox drafts live in their stores. `windowStore` retains its older position/workspace APIs for compatibility with existing consumers, but the portal does not render those controls. `portalStore` owns companion visibility/focus independently of the main app identity. Opening Messenger returns to the buddy list without replacing the active app or discarding a draft. Read acknowledgment requires the companion to be visible and focused and the browser to be visible/focused. At widths below 980px, a main app hides the companion until the Friends control opens it as an overlay.

| File | Responsibility |
| --- | --- |
| `packages/konpyuuta/src/types.ts` | App and injected service contracts |
| `client-3d/src/ui/konpyuuta/KonpyuuTALauncher.tsx` | First-use lazy loading and loading/error recovery |
| `packages/konpyuuta/src/context/KonpyuuTAContext.tsx` | Provider and service access |
| `packages/konpyuuta/src/components/KonpyuuTADesktop.tsx` | Portal composition and active app |
| `packages/konpyuuta/src/components/AppRouter.tsx` | Social apps, Help, and Guides routing |
| `packages/konpyuuta/src/components/PortalHome.tsx` | Floating shortcuts and return focus |
| `packages/konpyuuta/src/components/PortalAppFrame.tsx` | One app surface with Home navigation |
| `packages/konpyuuta/src/components/PortalWallpaper.tsx` | Animated wallpaper texture refraction |
| `packages/konpyuuta/src/stores/windowStore.ts` | App identities and active app; legacy window APIs |
| `packages/konpyuuta/src/stores/desktopStore.ts` | Notifications; legacy desktop settings |
| `packages/konpyuuta/src/lib/xpmParser.ts` | Legacy XPM wallpaper helper (not in the portal) |
| `packages/konpyuuta/src/styles/cde.css` | Root, top bar, notifications, and social app layouts |

## Account identity

The host subscribes to `authStore.username` and supplies it through the provider. `useCurrentUsername()` resolves this value, falls back to the injected social service for older consumers, and uses `guest` when no account is available. The development preview follows the same auth store.

Social profile and account labels use this identity. Boot and retired File Manager/Process Monitor sources also resolve the account rather than a hardcoded name. System process owners retain their service names. File Manager navigation is stored relative to the home directory, so changing accounts rebases `/home/<username>/` without breaking folder lookup. Bundled tutorial and boot JSON use `{{username}}` placeholders and are personalized when viewed; replacement preserves literal usernames and valid JSON.

## Assets and development

Package exports point at TypeScript source; Vite compiles it with the client. Run `pnpm --filter club-mutant-3d dev` or `pnpm --filter club-mutant-3d build`. Do not run a KonpyuuTA build prerequisite: the package has no build script.

`konpyuutaStaticPlugin` in `client-3d/vite.config.ts` serves `packages/konpyuuta/public/` in development and copies its contents to the production output. Legacy assets remain available under `/icons/` and `/backdrops/`, but the portal does not request utility icons or XPM backdrops. Social app icons are imported through `lib/socialIcons.ts` so Vite includes their assets in the bundle and supplies the URLs consistently. The portal and social app headers use these shared URLs; retired utility icons are excluded from the runtime import graph.

The development-only `/__social-toy-review.html?app=mutanttube` entry mounts the real `KonpyuuTAShell` and opens the requested app (`mutanttube`, `messenger`, `mutantbook`, `mutantmail`, `help`, or `guides`). `?app=home` opens the floating home; `?app=netscape` remains a home alias. `&capture=1` hides the development banner. Search/import responses come from `VITE_YOUTUBE_SERVICE_URL` or the local YouTube service on port 8081 (run `go run .` from `services/youtube-api`). It does not substitute sample results or bypass authentication; Messenger, Guestbook, and delivery use the current signed-in session. Vite’s production entry remains `index.html`.

## TinyTubes

TinyTubes uses the existing `mutanttube` app ID and `components/apps/MutantTube.tsx`; it implements discovery, search, category shelves, a paginated video grid, playlist management, and an embedded watch view. Its liquid Y2K direction combines dark reading surfaces, acid-green refracted light, serif titles, and a rendered glass tube/play icon. Numbered channels and video cards retain their existing layout and interactions.

`lib/mutantTube.ts` provides video normalization, playlist URL validation, track-to-video resolution, random query selection, duration parsing, and cancellable HTTP requests with a 30-second timeout.

### Daily feature

Home begins with a shared “Unpopular video of the day” card from `GET /featured`, independently of the audience toggle and random discovery shelves. `services/youtube-api/featured.go` keeps one UTC-day pick in `<DISK_CACHE_DIR>/daily/featured.json` (override with `FEATURED_STATE_FILE`). Each request verifies its current count through InnerTube watch-page metadata; counts of 100+, unknown counts, and failed verification never serve a cached eligible feature. The pick stays stable across refreshes, Random, and service restarts, unless it becomes ineligible. Selection uses a bounded, coalesced job and a small low-view candidate pool. No popular fallback is allowed.

Home rechecks every minute while visible, on returning to Home, and when the browser tab becomes visible. Failed verification clears the card; `normalizeDailyFeature` rejects expired dates, stale checks, and counts outside 0–99. The card opens the existing watch view and playlist-saving flow. The featured route and client must be deployed together.

### Browsing

- Home and Random select three random queries from the discovery term pool.
- Category shelves select two queries from that shelf's terms.
- Home, categories, Random, and search default to **Under 100 views**, requesting `maxViews=99&limit=50`. The Go service scans up to three pages of ordinary search and three of this month's uploads concurrently within 24 seconds, then deduplicates, excludes unknown/live counts, filters before limiting, and sorts lowest first. The client also enforces 0–99 known views. Empty searches stay empty, with an explicit All videos option.
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

**Messenger** uses `client-3d/src/services/messengerService.ts` for Nakama message storage, conversation lists, history, and conversation read state. Its dark contact list and opaque green reading pane have searchable contacts, per-conversation drafts, sent/pending/failed states with retry, date separators, typing, and a single-pane buddy-list/conversation layout. The companion starts at 300px wide, groups contacts by Online/Offline, and uses Back to return from a conversation. It can be resized up to 540px wide. `styles/buddy.css` gives the companion an asymmetric pale-green molded shell, a recessed screen, and small irregular controls inspired by desktop audio-player skins. List, chat, inputs, and status text use a light green palette with dark ink; the resize grip sits inside the curved lower edge. A 360px minimum height leaves room for the shell and composer (bounded by the available viewport).

- Notification code 100 carries the full body, server message ID, and server timestamp. Preview-only notifications from older deployments are explicitly marked and hydrated from history when opened. `notificationSend` takes content before code; both DM and wall notifications use this order.
- `TopBar` derives the online count from accepted Nakama friend IDs and their live presence, excluding unrelated DM contacts. Unknown membership, disconnects, and account transitions show an unavailable count rather than stale presence. Presence updates received during the REST contact refresh are reapplied after merging contacts.
- The shared Nakama client owns socket event registries. Messenger subscribes to channel and socket changes, rejoins typing channels after reconnect, and clears typing timers when disconnected. Simultaneous connection/restore calls share one promise. Account changes close the old socket and clear Messenger's messages and drafts.
- History requests are tracked by conversation. Merging deduplicates real message IDs, orders by server time, preserves failed/pending messages, and replaces previews with complete bodies. A successful send replaces its temporary UUID with the returned server ID; failed sends retain their text and expose a retry control.
- The current `dm_messages` storage collection is shared across all of an owner's partners, ordered by timestamp keys. The RPC scans at most five raw pages per call and returns every matching message from those pages; it must never trim the matches after advancing its cursor. The host follows every cursor, including empty filtered pages, before returning chronological history. Long account histories therefore require multiple RPCs per open; conversation-specific storage would be needed to reduce that cost at scale.
- All conversation-summary pages are loaded. Friend presence follows Nakama status updates and is re-established after socket replacement.
- Read state clears only after history loads and `mark_read` succeeds while the companion and conversation are visible/focused and the browser is visible/focused. Typing channels are transient; durable messages remain in Nakama storage.
- The message composer enforces the server's 2,000-character limit and respects IME composition. The viewport renders the latest 80 messages initially; “Show earlier messages” reveals older loaded history while preserving scroll position. Incoming messages do not force a reader away from older history.

**Postbox** (internal app ID `mutantmail`) sends subject/body letters to Club Mutant usernames. `mailService.ts` uses the shared Nakama auth/socket and `send_letter`, `list_letters`, `update_letter` RPCs. Letters use `postbox_letters`, separate from Messenger DMs; notification code 101 refreshes mail without opening a chat. The server owns Inbox/Sent copies and read/trash/restore/delete state. A create-only receipt in `postbox_receipts` makes each draft request idempotent, including concurrent retries and retries after the Sent copy is deleted. Receipts contain only an ID/timestamp, not letter content. Deleting a letter affects only the caller’s copy.

`stores/mailStore.ts` keeps drafts and a mail cache per account ID in `konpyuuta-postbox`. Draft fields save on each edit; sending only removes the draft after server acknowledgment. Refresh preserves local drafts, stale account results are ignored, and failures leave the draft available. The former unowned `konpyuuta-mail` prototype archive stays intact and can be explicitly imported as local, undelivered copies. Guests can keep drafts but cannot send. This is in-world correspondence, not external email.

Verification: `pnpm --filter club-mutant-3d test` covers Postbox storage and transport; `node nakama/tests/postbox.integration.mjs` uses disposable local accounts to verify delivery, notifications, retry deduplication, account isolation, permission checks, full content, and folder operations.

## Adding an app

1. Add a React component in `packages/konpyuuta/src/components/apps/`.
2. Register its ID in `AppRouter.tsx`, `lib/portalApps.ts`, and the portal icon maps in `lib/socialIcons.ts`.
3. Define new service contracts in `src/types.ts` before using host data.
4. Inject host implementations from `KonpyuuTAShell.tsx` and access them with `useKonpyuuTA`.
5. Scope CSS to the app root and verify wide and narrow app surfaces.

## Verification

`pnpm --filter club-mutant-3d test` includes TinyTubes parsing/API tests, playlist store regressions, Messenger state/transport regressions, companion independence/friend-count/resize regressions, socket lifecycle checks, and VM tests of the Nakama DM runtime. `pnpm --filter club-mutant-3d build` type-checks the host and package and builds the production client. Browser checks should include live search/import, changing categories while a search is pending, first-video saving, and playlist navigation.

For Messenger integration verification, start `docker compose -f docker-compose.dev.yml up -d`, restart Nakama after runtime edits, then run `node nakama/tests/messenger.integration.mjs`. It creates and deletes its own local device accounts on `127.0.0.1:7350`, checking full realtime bodies, storage history, unread/read state, typing, reconnect, and pagination without gaps. It never targets production. Browser review should cover contact search, drafts when switching chats, delayed/failed history, failed-send retry, incoming full bodies, focus-dependent unread counts, and narrow-window back navigation.

## Liquid signal visuals

`styles/liquid.css` scopes the desktop and social theme under `.cde-root.liquid-signal`, retaining the existing layout/container queries in `cde.css`. The home uses `src/assets/liquid-signal.webp` (quality 92, 176KB); its original JPEG remains an authoring source and is not imported into the client. The retired wallpaper picker is not exposed. The original wallpaper was generated with built-in imagegen: dark liquid glass, acid-green caustics, a dark upper-left void, violet edges, photographic bloom and fine grain, with no text or logos.

`tools/render-social-icons.py` authors the six active Blender icons: TinyTubes' glass tube/play symbol, Messenger's paired speech bubbles, Postbox's envelope, Guestbook's book, Help's question-mark ring, and Guides' folded route map. The script also retains three retired utility scenes for reproducibility. `lib/socialIcons.ts` bundles PNG posters and transparent animated WebP loops. Home shortcuts animate; app headers use stills. Native `<picture>` sources select the poster for reduced motion or lack of WebP support. Each loop is 24 frames at 6 fps (exactly four seconds), rendered at 128px without runtime 3D geometry. The six active loops total 362KB. PNG posters are losslessly recompressed; runtime APNG delivery files are removed.

Regenerate with Blender 5.x and Python/Pillow with WebP support:

```sh
blender -b --python tools/render-social-icons.py -- --frames 24
blender -b --python tools/render-sword-cursor.py
python3 tools/optimize-konpyuuta-assets.py
```

`SignalOrgan.tsx` supplies the loading animation and deterministic user-ID avatars; uploaded Guestbook profile pictures take precedence. `AnalogAccents.tsx` supplies serif wordmarks and small light flares, and `PixelSymbol.tsx` now draws smooth control symbols.

`SignalTransition.tsx` uses `lib/mojibake.ts` for a decorative 980ms corruption/resolve pass limited to explicitly marked headings (`data-signal-text`). TinyTubes marks its browse/collection heading after loading; Postbox marks its folder heading. Controls, video titles, profile content, letter bodies, and wordmarks stay steady. TinyTubes uses custom SVG tubular lettering in `TinyTubesWordmark.tsx`. Inputs, stored data, live announcements, and alerts are never re-encoded. Interaction, scrolling, asynchronous content changes, resizing, and reduced-motion preferences restore readable originals immediately. `mojibake.test.ts` verifies Unicode resolution, whitespace, bounded progress, and changing noise.

Messenger additionally uses `IncomingMessageText.tsx` for a 630ms corruption/resolve pass on a newly received full message. The store issues a short-lived, consumable visual arrival token only from `receiveMessage`, never history loading or optimistic sends. Duplicate notifications and reopened threads do not replay it. Pending tokens are capped at 80 and expire after three seconds; account changes clear them. The original message remains intact in the polite live log, while an `aria-hidden` visual copy animates. Reduced motion, pointer/keyboard/focus interaction, and hidden documents restore readable text. Store regression tests cover deduplication, preview upgrades, history isolation, token expiry/bounds, and account changes.

The liquid desktop uses a gothic sword sprite rendered by `tools/render-sword-cursor.py` with Blender 5.x: worn metal, curled guard filigree, a faceted skull pommel, strong specular contrast, and a passing blade glint. Its 24-frame axial spin runs at 12fps; the lossless 64px animated WebP (47KB) is displayed at 48px with a fixed blade-tip hotspot `(6, 6)`. Pixels, alpha and two-second timing are preserved; static 48px PNG normal/link variants back up the animation.

`AnimatedSwordCursor.tsx` displays a pointer-transparent, `aria-hidden` sprite in a body portal. Mouse movement is coalesced through one animation frame; placement updates the element transform without React rerenders. Only the desktop's sword cursor states enable it. Text fields, disabled controls, pressed-button drags, resize, iframes, touch, reduced motion, hidden documents, keyboard navigation, and leaving the desktop restore native cursors. Native fallback stays visible until the sprite loads; asset errors and unmount also restore it. The sprite rolls around the blade axis, so the tip stays fixed through every frame. Asset identity checks use imported URLs, including Vite's inlined production PNGs.

The optimization command above packages the runtime sword loop. For an enlarged review APNG:

```bash
ffmpeg -framerate 12 -i /tmp/club-mutant-gothic-sword/review/%03d.png -plays 0 -f apng artifacts/liquid-social/sword-spin.png
```

### NEETscape home and screen treatment

`PortalHome.tsx` fills the screen with six floating, named shortcuts: TinyTubes, Messenger, Guestbook, Postbox, Help, and Guides. Their drift pauses when any shortcut is hovered or keyboard focused; the target gains a soft light halo. Home returns keyboard focus to the last shortcut. Reduced motion disables drift and uses static icon posters. Help explains the current controls; Guides is a minimal placeholder pending the user's manually drafted tutorial structure. Directory and Field guide are not exposed.

`PortalWallpaper.tsx` refracts the approved liquid wallpaper using a small WebGL texture shader, with slow UV ripples and mild barrel distortion toward the edges. There is no ray-marched 3D blob or external graphics library. The shader caps its buffer at 1200px wide / 1x device scale and draws at up to 24fps on home. It holds a static frame while an app is open or reduced motion is enabled, suspends when hidden or outside the viewport, and releases resources/listeners on unmount. CSS uses the same WebP wallpaper as the fallback when WebGL is unavailable or its context is lost. The canvas preserves its drawing buffer for in-world capture.

`styles/portal.css` adds a pointer-transparent CRT scanline/phosphor overlay, vignette, and rounded screen edge across home and apps. Fisheye refraction affects the wallpaper; text and click targets remain clear and aligned. Legacy panel, window, utility, and browser styling is removed from the runtime stylesheets. `styles/boot.css` supplies the restored terminal sequence. `PanelResizeHandle.tsx` provides pointer capture and keyboard resizing (arrows, Shift for larger steps) for every reading surface and the buddy panel. Sizes are bounded by the viewport; the main app reserves the companion’s actual width on wide screens. `PortalAppFrame` passes a typed app identity to `styles/appSkins.css`: TinyTubes uses a glossy bubble TV, Postbox a rounded letter terminal with a lid slot, Guestbook a lilac clamshell with a narrow spine, and Help/Guides translucent reference pads. The shells use CSS gradients and borders, adding no runtime 3D or image assets. Inner reading surfaces remain undistorted; main windows have a 340×380px minimum where the viewport permits it.

`TopBar.tsx` keeps power (return to Club Mutant), interface-sound toggle, and time. Sound is persisted in `settingsStore`; `AudioManager` respects it before creating/playing tones and mutes already-playing notes when switched off. This control does not change game music or embedded video volume.

### UI copy

Social apps use direct labels and brief functional status messages. Header slogans, decorative transmission/frequency text, sidebar pitches, welcome monologues, and duplicate empty-pane calls to action are removed. TinyTubes keeps categories, video metadata, the daily feature, search/filter feedback, and playlist instructions; its sidebar has no blob or tagline. Postbox leaves its reading pane blank until a letter or draft is selected. Messenger uses a short conversation-selection prompt and keeps connection/typing/send status. Sign-in requirements, errors, retry actions, local draft-save confirmation, and delivery warnings remain explicit.

TinyTubes keeps a sparse image-link layout and muted monospace metadata inside a glossy bubble-TV shell. Its controls use small rounded presets, the daily feature has a miniature shiny TV casing, and video playback sits within a curved screen bezel. The liquid wallpaper, tubular wordmark, and rendered icons remain. Japanese is used sparingly for section labels: 今日の一本 (daily video), 映像 (videos), 分類 (categories), and 読込中 (loading). Postbox folder headings, Messenger’s contacts heading, and Guestbook’s wall tab also use Japanese; `lang="ja"` marks these strings and English hover titles explain them. Search, playback, delivery, and error controls stay in English. System font fallbacks add no font downloads.
