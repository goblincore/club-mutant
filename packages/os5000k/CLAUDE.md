# os5000k

In-world mini operating system. Rendered as an iframe inside the 3D client.

## Architecture

- Runs inside an iframe in client-3d
- Communicates with the parent app via **postMessage bridge**
- Parent side: `client-3d/src/ui/os5000k/OS5000kBridgeHost.ts`
- Client side: `src/bridge-sdk.ts` (provides `sendToParent()`, `playVideo()`, `stopVideo()`, etc.)

## Directory Map

- `src/bridge-sdk.ts` — Bridge SDK used by apps to communicate with parent
- `src/types.ts` — TypeScript type definitions
- `static/os5k-components.js` — Shared component library (vanilla JS, used by all apps)
- `static/apps/` — Individual apps, each a self-contained HTML file:
  - `profile.html` — User profiles
  - `friends.html` — Friends list
  - `mail.html` — DM system
  - `mutantbook.html` — Social wall (early Facebook style)
  - `mutanttube.html` — Video browser/player (syncs with main jukebox)
  - `camera.html`, `timer.html`, `console.html`, `graphingCalculator.html`, `spriteGenerator.html`, `webBrowser.html`

## Adding a New App

1. Create `static/apps/yourapp.html` (use existing apps as templates)
2. Include the bridge SDK: `<script src="../bridge-sdk.js"></script>`
3. Use `os5k-components.js` for shared UI components
4. Register the app in `client-3d/src/ui/os5000k/os5kAppRegistry.ts`
5. Add a window entry in `client-3d/src/stores/os5000kStore.ts`

## Important Notes

- `static/` files are **vanilla JS** (NOT ES5-restricted like Nakama)
- Apps run in iframes — each is isolated, communicates only via bridge
- Must build os5000k before client-3d: `pnpm build`

## Build

```bash
pnpm build  # esbuild, outputs to dist/
```
