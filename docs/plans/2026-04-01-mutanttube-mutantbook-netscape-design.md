# MutantTube & MutantBook — Netscape Sites with Real Nakama Data

**Date:** 2026-04-01  
**Branch:** feat/konpyuuta-foundation  
**Status:** Approved, ready for implementation

---

## Overview

Wire real Nakama auth and live data into MutantTube and MutantBook as dedicated Astro pages served inside the Netscape Navigator's external iframe. This is Plan 2 of the KonpyuuTA migration, following the completed foundation work (PR #55).

---

## Architecture

### How it fits together

```
React app (client-3d)
  └── KonpyuuTAShell.tsx  [iframe src=/konpyuuta/]
        │  postMessage({ type:'boot', nakamaToken, youtubeApiUrl, ... })
        ▼
  KonpyuuTA Astro app  [/konpyuuta/]
    bridge.ts listens → window.nakamaSession = { token, host, port, ssl, youtubeApiUrl }
        │
        └── NetscapeNavigator  [nsExternalView iframe]
              navigates to /konpyuuta/mutanttube/ or /konpyuuta/mutantbook/
              (same-origin: sub-pages read window.parent.nakamaSession)
                    │
                    ├── MutantTube  →  YouTube API service (search)
                    │                  Nakama HTTP API (playlists)
                    │
                    └── MutantBook  →  Nakama HTTP API (profile, wall posts)
```

### Key constraint: same-origin iframe

`nsExternalView` has `sandbox="allow-scripts allow-forms allow-popups allow-downloads allow-same-origin allow-modals"`. Because MutantTube/MutantBook are served from the same origin as KonpyuuTA (`/konpyuuta/...`), sub-pages can safely access `window.parent.nakamaSession`.

---

## Section 1: Auth Propagation

### Files changed

**`client-3d/src/ui/konpyuuta/KonpyuuTAShell.tsx`**

Add `youtubeApiUrl` to the existing boot postMessage payload:
```ts
youtubeApiUrl: import.meta.env.VITE_YOUTUBE_API_URL ?? 'http://localhost:8081',
```

**`packages/konpyuuta/src/scripts/boot/bridge.ts`** (new)

Receives the boot postMessage and stores the session on `window.nakamaSession`:
```ts
interface NakamaSession {
  token: string;
  refreshToken: string;
  host: string;
  port: string;
  ssl: boolean;
  youtubeApiUrl: string;
}

declare global {
  interface Window { nakamaSession?: NakamaSession }
}

window.addEventListener('message', (e: MessageEvent) => {
  if (e.data?.type === 'boot') {
    window.nakamaSession = {
      token:         e.data.nakamaToken    ?? '',
      refreshToken:  e.data.refreshToken   ?? '',
      host:          e.data.nakamaHost     ?? 'localhost',
      port:          e.data.nakamaPort     ?? '7350',
      ssl:           e.data.useSSL         ?? false,
      youtubeApiUrl: e.data.youtubeApiUrl  ?? 'http://localhost:8081',
    };
  }
});
```

**`packages/konpyuuta/src/scripts/core/index.ts`**

Add at the top:
```ts
import '../boot/bridge';
```

**`packages/konpyuuta/src/env.d.ts`**

Add window extension:
```ts
interface NakamaSession {
  token: string;
  refreshToken: string;
  host: string;
  port: string;
  ssl: boolean;
  youtubeApiUrl: string;
}
interface Window {
  nakamaSession?: NakamaSession;
}
```

---

## Section 2: Netscape Local-Iframe Page Type

The Netscape engine gains a third navigation mode alongside `internal` (HTML div) and `external` (Wayback proxy iframe): **local-iframe** — loads an Astro sub-page directly in `nsExternalView` with no proxy.

### Files changed

**`packages/konpyuuta/src/scripts/features/netscape/netscape-types.ts`**

Extend `NSPage`:
```ts
export interface NSPage {
  title: string;
  url: string;           // display URL shown in address bar
  content: () => string;
  type?: 'local-iframe';
  localPath?: string;    // actual src path, e.g. /konpyuuta/mutanttube/
}
```

**`packages/konpyuuta/src/data/netscape-pages.json`**

Update mutanttube and mutantbook entries:
```json
"mutanttube": {
  "title": "MutantTube - Club Mutant",
  "url": "http://mutanttube.clubmutant.net/",
  "type": "local-iframe",
  "localPath": "/konpyuuta/mutanttube/",
  "content": ""
},
"mutantbook": {
  "title": "MutantBook - Club Mutant",
  "url": "http://mutantbook.clubmutant.net/",
  "type": "local-iframe",
  "localPath": "/konpyuuta/mutantbook/",
  "content": ""
}
```

**`packages/konpyuuta/src/scripts/features/netscape/netscape-navigator-engine.ts`**

Add two new methods:
```ts
public isLocalPage(target: string): string | undefined {
  const key = Object.keys(this.nsPages).find(
    k => k === target || this.nsPages[k].url === target
  );
  if (key && this.nsPages[key].type === 'local-iframe') return key;
  return undefined;
}

public getLocalPath(key: string): string {
  return this.nsPages[key].localPath ?? `/konpyuuta/${key}/`;
}
```

**`packages/konpyuuta/src/scripts/features/netscape.ts`**

1. Update `initPages()` to copy `type` and `localPath` from JSON:
```ts
this.nsPages[key] = {
  title:     value.title,
  url:       value.url,
  content:   () => (value as any).content ?? '',
  type:      (value as any).type,
  localPath: (value as any).localPath,
};
```

2. Update `renderPage()` to check `isLocalPage` before `isInternalPage`:
```ts
private renderPage(target: string, animate: boolean): void {
  this.currentPage = target;

  const localKey = this.engine.isLocalPage(target);
  if (localKey) {
    const page = this.nsPages[localKey];
    const localPath = this.engine.getLocalPath(localKey);
    this.renderer.updateUIForExternal(page.url); // show friendly URL
    if (animate) {
      this.startLoadingLocal(localPath);
    } else {
      if (this.elements.externalView) this.elements.externalView.src = localPath;
      this.renderer.setStatus('Document: Done');
    }
    this.renderer.updateNavButtons(this.history.canGoBack(), this.history.canGoForward());
    return;
  }

  // ... existing internalKey / external logic unchanged
}
```

3. Add `startLoadingLocal(path)`:
```ts
private startLoadingLocal(path: string): void {
  if (this.isLoading) this.stopLoading();
  this.isLoading = true;
  this.toggleLoadingUI(true);
  this.renderer.setStatus('Connecting...');
  this.renderer.setProgress(10);

  setTimeout(() => {
    if (!this.isLoading) return;
    this.renderer.setStatus('Receiving data...');
    this.renderer.setProgress(50);
    if (this.elements.externalView) {
      this.elements.externalView.src = path;
      const onLoad = () => {
        this.renderer.setStatus('Document: Done');
        this.renderer.setProgress(100);
        setTimeout(() => this.stopLoading(), 200);
        this.elements.externalView?.removeEventListener('load', onLoad);
      };
      this.elements.externalView.addEventListener('load', onLoad);
    }
  }, 300);

  // Fallback in case load event doesn't fire
  setTimeout(() => {
    if (this.isLoading) {
      this.renderer.setStatus('Document: Done');
      this.renderer.setProgress(100);
      this.stopLoading();
    }
  }, 5000);
}
```

---

## Section 3: MutantTube (`src/pages/mutanttube.astro`)

Served at `/konpyuuta/mutanttube/`. Fully client-side (static Astro page). All data fetched from `window.parent.nakamaSession`.

### Data access

```ts
const session = window.parent.nakamaSession;
const nakamaBase = `${session.ssl ? 'https' : 'http'}://${session.host}:${session.port}`;
const userId = JSON.parse(atob(session.token.split('.')[1])).sub;

// Nakama RPC helper
async function rpc(id: string, payload: object) {
  const res = await fetch(`${nakamaBase}/v2/rpc/${id}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ payload: JSON.stringify(payload) }),
  });
  const json = await res.json();
  return JSON.parse(json.payload);
}

// YouTube search
async function ytSearch(q: string, limit = 20) {
  const res = await fetch(`${session.youtubeApiUrl}/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  return res.json(); // { items: VideoResult[] }
}
```

### Views

| View | Trigger | Data |
|---|---|---|
| `homepage` | Initial load | 3 random weird search terms → merge → sort by `viewCount` asc → show ≤12 |
| `search` | Search bar submit | `ytSearch(query)` |
| `playlists` | "My Playlists" tab | `rpc('list_playlists', {})` |
| `playlist-detail` | Click playlist | Stored in playlist object from list |
| `watch` | Click video | YouTube `youtube-nocookie.com/embed/{id}` iframe inline |

### Homepage weird search terms

A curated list rotated randomly on each page load:
```ts
const WEIRD_TERMS = [
  '1996 local TV commercial',
  'forgotten VHS home video 1993',
  'obscure public access show 1998',
  'weird internet video 2002',
  'rare 90s cartoon pilot',
  'lost TV special 1995',
  'public access cable 1997',
  'strange music video 1994',
];
```

Pick 3 at random, fetch each, merge results, sort by `viewCount` ascending.

### Playlist CRUD

- **List:** `rpc('list_playlists', {})`
- **Create:** `rpc('save_playlist', { id: crypto.randomUUID(), name, items: [] })`
- **Delete:** `rpc('delete_playlist', { id })`
- **Add video:** read-modify-write — fetch playlist, push video to `items`, call `save_playlist`
- **Remove video:** read-modify-write — filter out video from `items`, call `save_playlist`

### Video watch

Inline `<iframe src="https://www.youtube-nocookie.com/embed/{videoId}?autoplay=1" allowfullscreen>` rendered inside the MutantTube page. If nested sandbox causes playback issues (discovered during E2E test), fall back to `window.open('https://youtube.com/watch?v={id}', '_blank')`.

### Styling

Early YouTube (2005-era): white background, `#cc0000` header bar, `#e8e8e8` sidebar, thumbnails in a 3-column grid, `Arial`/`Helvetica` sans-serif. Minimal CSS, no external fonts. Contained entirely in the Astro page's `<style>` tag.

---

## Section 4: MutantBook (`src/pages/mutantbook.astro`)

Served at `/konpyuuta/mutantbook/`. Early Facebook (2004-era) aesthetic.

### Data access

Same `session`/`nakamaBase`/`rpc` pattern as MutantTube. `userId` decoded from JWT.

### Views

Single-page layout: left column = profile card, right column = wall.

| Feature | RPC |
|---|---|
| Own profile | `rpc('get_profile', { userId })` |
| Wall posts | `rpc('get_wall_posts', { target_user_id: userId })` |
| Post to wall | `rpc('create_wall_post', { target_user_id: userId, content })` |
| Delete post | `rpc('delete_wall_post', { post_id: postId })` — shown only for own posts |

### Profile data

`get_profile` returns `{ userId, displayName, username, avatarUrl, metadata }`. Display name, username, and any metadata fields rendered in a card. Avatar shown as `<img>` if `avatarUrl` is set, otherwise a placeholder initial.

### Styling

Classic early Facebook: `#3b5998` blue header, white body, `#f7f7f7` sidebar card, `#3b5998` profile name link color, `Arial` 13px, blue left border on wall posts, timestamp shown as `MM/DD/YYYY at HH:MM`.

---

## File Inventory

| File | Change |
|---|---|
| `client-3d/src/ui/konpyuuta/KonpyuuTAShell.tsx` | Add `youtubeApiUrl` to boot payload |
| `packages/konpyuuta/src/scripts/boot/bridge.ts` | **NEW** — boot message listener |
| `packages/konpyuuta/src/scripts/core/index.ts` | Import bridge |
| `packages/konpyuuta/src/env.d.ts` | Add `NakamaSession` + window extension |
| `packages/konpyuuta/src/scripts/features/netscape/netscape-types.ts` | Extend `NSPage` |
| `packages/konpyuuta/src/data/netscape-pages.json` | Add `type`/`localPath` to mutanttube/mutantbook |
| `packages/konpyuuta/src/scripts/features/netscape/netscape-navigator-engine.ts` | Add `isLocalPage`, `getLocalPath` |
| `packages/konpyuuta/src/scripts/features/netscape.ts` | Update `initPages`, `renderPage`, add `startLoadingLocal` |
| `packages/konpyuuta/src/pages/mutanttube.astro` | **NEW** — MutantTube app |
| `packages/konpyuuta/src/pages/mutantbook.astro` | **NEW** — MutantBook app |

Total: 10 files (2 new pages, 1 new script, 7 existing files modified).

---

## Out of Scope

- Friend list browsing in MutantBook (other users' profiles/walls)
- DM integration in MutantBook
- Video playback in the club jukebox from MutantTube (separate feature)
- Importing YouTube playlists (existing TODO in the Go service)
- `VITE_YOUTUBE_API_URL` — must already be set in `client-3d/.env`; no new env var setup required
