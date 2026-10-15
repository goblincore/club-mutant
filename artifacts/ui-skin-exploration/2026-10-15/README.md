# CRT terminal HUD prototype

Work in progress: a compact, worn CRT/Winamp material treatment for the existing game HUD. The current pass covers the mini-player, icon dock, chat composer, and basic panel chrome. The original skin remains the default; choose **Settings → Interface → CRT terminal preview** in a room to try it. Skin and volume choices last for the current session.

## Preview

Run `pnpm dev` from `client-3d`, then open `/ui-terminal-preview.html`. This development-only fixture uses the existing game scene with local HUD controls and does not join a live room. The dock selects preview states; full playlist/settings/chat windows still need their own design pass. The preview entry is not part of the production build.

- `crt-service-idle.png` and `crt-service-playlist.png`: preferred concept direction, not implementation screenshots. The playlist layout is still a design reference.
- `current-room.jpg`: existing interface for context.
- `implemented-terminal-v2-desktop.jpg`: current implementation.
- `implemented-player-v2-detail.jpg`: image-backed player with live HTML controls.
- `implemented-terminal-v2-mobile.jpg` and `implemented-terminal-v2-muted.jpg`: responsive and muted states.

## Asset sources

`player-v2-source.png` is the generated blank faceplate; `player-v2-prompt.json` records the prompt and reference. Live text, transport glyphs, progress, and the volume control are HTML layered over that image. Regenerate its slices with Python and Pillow:

```sh
python3 tools/prepare-terminal-player.py artifacts/ui-skin-exploration/2026-10-15/player-v2-source.png
```

The knob/button crop coordinates in that script and percentage positions in `client-3d/src/ui/skin/terminal.css` are calibrated to this source. Update them together if the artwork changes.

The nine animated icons are procedural Blender renders: flower, playlist cards, settings, chat, speaker, muted speaker, exit, video, and share. Each WebP has 24 frames at 6 fps, with a PNG still for reduced motion. Rebuild them with Blender and Python/Pillow:

```sh
blender -b --python tools/render-terminal-ui.py -- --output /tmp/club-mutant-terminal-ui
python3 tools/render-terminal-ui.py --package-from /tmp/club-mutant-terminal-ui
```

Generated runtime assets live in `client-3d/public/ui/terminal/`. `animation-v2-validation.json` records the frame-count/distinct-frame checks.

## Validation and remaining work

The client build and NowPlaying tests passed. Browser checks covered playback controls, local volume, mute/unmute, listener controls, skin switching, and layouts at 320 px and 390 px. The skin preserves the existing playback and DJ authority handlers.

Continue iterating on scale, materials, typography, and icon readability. Login/lobby, playlist contents, DJ queue, chat history, preference controls, and modal windows still need a coordinated pass. Keep the room and its CRT frame visually dominant, with subtle wires/insects and small prerendered details.
