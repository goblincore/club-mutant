# Voice Chat (LiveKit) — Design Overview

**Status**: Planned (experimental)
**Branch**: `feature/voice-chat` (not yet created)
**Plan**: `.claude/plans/purrfect-plotting-knuth.md`

## Summary

Real-time voice chat via self-hosted LiveKit SFU. Audio-only to start, with proximity-based volume and karaoke support for the DJ queue system.

## Phases

### Phase 1: Proximity Voice Chat
- LiveKit server as Docker container (separate VPS or same box)
- Token generated server-side in `ClubMutant.onJoin` via `livekit-server-sdk`
- Client-side proximity: `VoiceManager` subscribes/unsubscribes based on Colyseus-synced positions
- Volume falloff: linear 1.0→0.0 over 200 server px, subscribe radius 250px
- Schema additions: `Player.isMuted`, `Player.isTalking`, `Player.inVoice`
- UI: mic toggle button, avatar talk indicator

### Phase 2: Karaoke
- DJ enables karaoke mode → `MusicStream.karaokeActive = true`
- DJ voice bypasses proximity — heard room-wide at full volume
- Karaoke toggle only visible to current DJ while music is playing
- Resets automatically on track end / DJ rotation

### Phase 3 (Future): Lo-Fi Video
- Intentionally low-res (320x240 @ 15fps, ~100-150kbps) as an aesthetic choice
- Render on in-world CRT/screen mesh at DJ booth
- Builds on Phase 1/2 infrastructure — same VoiceManager, same proximity logic

## Key Design Decisions

- **1 LiveKit room = 1 Colyseus room** — auto-cleanup when empty
- **Token pushed via Colyseus `onJoin`** — piggybacks on existing Nakama auth
- **Client-side proximity** — no server coordination needed, positions already sync at 10Hz
- **Mic starts muted** — users opt in
- **`karaokeActive` on `MusicStream`** not `Player` — resets naturally on DJ rotation
- **VAD from LiveKit's `ActiveSpeakersChanged`** — no custom Web Audio analysis needed

## Resource Estimates (Audio-Only)

| Scenario | CPU | RAM | Egress |
|----------|-----|-----|--------|
| 50 players, proximity culled (~8 subs each) | 1 core | ~300MB | 8-15 Mbps |
| Karaoke (1 DJ → 50 listeners) | minimal | minimal | ~2.5 Mbps |

## Files Involved

- `server/src/rooms/ClubMutant.ts` — token gen in onJoin, voice message handlers
- `server/src/rooms/schema/OfficeState.ts` — Player + MusicStream schema additions
- `server/src/lib/liveKitTokens.ts` — new: token generation wrapper
- `client-3d/src/audio/VoiceManager.ts` — new: LiveKit connection + proximity loop
- `client-3d/src/stores/voiceStore.ts` — new: Zustand voice state
- `client-3d/src/ui/VoiceControls.tsx` — new: mic/karaoke UI
- `client-3d/src/network/NetworkManager.ts` — wire VoiceManager lifecycle
- `types/Messages.ts` — VOICE_TOKEN, VOICE_MUTE_CHANGED, VOICE_TALKING_CHANGED, VOICE_KARAOKE_TOGGLE
- `deploy/hetzner/docker-compose.yml` — LiveKit container
- `deploy/hetzner/Caddyfile` — voice.mutante.club subdomain
