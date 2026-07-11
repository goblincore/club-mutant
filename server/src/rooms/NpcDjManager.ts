// NPC automaton DJ (Phase 1) — a headless server-side Player that occupies a
// DJ booth slot and plays a curated playlist.
// See docs/plans/2026-07-05-npc-dj-design.md + docs/plans/2026-07-05-npc-dj-implementation.md
//
// CRITICAL: the NPC has NO Colyseus Client. It must never flow through Command
// objects that call client.send(...) — it only uses the client-free helpers in
// commands/djHelpers.ts.
//
// Timing authority: the manager's own track timer is the SOLE authority for
// advancing NPC tracks. The room track watchdog is not a reliable backstop
// (it never re-arms after auto-advancing and isn't cleared on leave — see
// docs/plans/2026-07-05-dj-queue-audit.md), so the manager defensively clears
// it whenever it arms its own timer or advances the rotation.

import { ChatMessage, Player } from '@club-mutant/types/RoomState'
import { RoomQueuePlaylistItem } from '@club-mutant/types/RoomState'
import { Message } from '@club-mutant/types/Messages'
import type { INpcDjConfig } from '@club-mutant/types/Rooms'
import { TEXTURE_IDS, sanitizeTextureId } from '@club-mutant/types/AnimationCodec'

import type { ClubMutant } from './ClubMutant'
import {
  BEHIND_BOOTH_SERVER_Y,
  DJ_SLOT_SERVER_X,
  advanceRotation,
  hasUnplayedTracks,
  joinDjQueue,
  markTrackAsPlayed,
  playTrackForCurrentDJ,
  removeDJFromQueue,
} from './commands/djHelpers'
import { NpcPlaylist, loadNpcPlaylist } from './npcPlaylists'

// Reserved session ID prefix — no real Colyseus sessionId can collide with it,
// and guards (punch targeting, BOT badge) key off it.
export const NPC_DJ_SESSION_PREFIX = 'npc-dj:'

const WATCH_INTERVAL_MS = 1000

// Where the NPC stands when not behind the booth (fallback mode, waiting).
const NPC_DJ_STANDBY_X = 220
const NPC_DJ_STANDBY_Y = 500

// ── Movement (cosmetic layer) ────────────────────────────────────────────────
// The NPC's body is server-driven: we mutate Player.x/y and the client lerps
// (REMOTE_LERP) and derives walk/dance/idle animation from visual velocity +
// music state. Movement NEVER gates queue or playback logic — state changes
// are instant and the body walks to catch up.
const NPC_DJ_MOVE_INTERVAL_MS = 200 // Lily parity (NPC_UPDATE_INTERVAL)
const NPC_DJ_SPEED = 60 // server px/s (Lily parity)
// Dancefloor rectangle in front of the booth (slots sit at y=430). Provisional —
// tuned during the runtime smoke test. Must stay within the client's ±550 clamp.
export const NPC_DJ_WANDER_BOUNDS = { minX: -250, maxX: 250, minY: 150, maxY: 380 }
const NPC_DJ_IDLE_MIN_MS = 3000
const NPC_DJ_IDLE_RANGE_MS = 5000 // idle window: 3–8s

// While walking the client shows 'walk'; while standing with music playing it
// shows 'dance' automatically. 'stationed' = parked at the booth slot (no
// jitter — jitter would flip the client's auto-dance into 'walk').
type NpcDjMoveState =
  | { kind: 'stationed' }
  | { kind: 'walking'; targetX: number; targetY: number; arrive: 'booth' | 'floor' }
  | { kind: 'hangingOut'; timerMs: number }

const NPC_DJ_NAME_POOL = ['DJ Automaton', 'Unit-33', 'The Resident', 'Vinyl Golem', 'MC Circuit']

const TRACK_START_TEMPLATES = [
  '🎧 now spinning: {title}',
  'up next on the decks — {title}',
  '{title}. enjoy.',
]

// Fired when the fallback NPC hands the booth to waiting humans.
export const NPC_DJ_HANDOVER_TEMPLATES = [
  "booth's yours 🎛️",
  'passing the decks — keep it moving',
  "warmed 'em up for you",
]

// Fired when the fallback NPC (re-)takes an empty booth.
export const NPC_DJ_FALLBACK_JOIN_TEMPLATES = [
  "taking over while the booth's empty.",
  'back to the decks 🎧',
  'no DJ? i got this.',
]

/**
 * Parse the NPC_DJ_LOBBY env var ("<mode>" or "<mode>:<playlistId>",
 * e.g. "fallback:default"). Returns null when unset or invalid.
 */
export function parseNpcDjLobbyEnv(raw: string | undefined): INpcDjConfig | null {
  if (!raw) return null
  const [mode, playlistId] = raw.split(':').map((part) => part.trim())
  if (mode !== 'fallback' && mode !== 'rotation') {
    console.warn('[NpcDj] Ignoring NPC_DJ_LOBBY with invalid mode:', raw)
    return null
  }
  return { mode, playlistId: playlistId || undefined }
}

/**
 * Sanitize a client-supplied room-creation npcDj option. Only the mode is
 * accepted — playlist/name/texture stay server-controlled (random defaults)
 * so room creators can't impersonate players or reference arbitrary
 * playlists. Returns null when the shape is invalid (no NPC spawns).
 */
export function sanitizeNpcDjOptions(raw: unknown): INpcDjConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const mode = (raw as { mode?: unknown }).mode
  if (mode !== 'fallback' && mode !== 'rotation') return null
  return { mode }
}

export class NpcDjManager {
  readonly sessionId: string

  private room: ClubMutant
  private config: INpcDjConfig
  private name: string
  private playlist: NpcPlaylist | null = null

  private watchIntervalId: NodeJS.Timeout | null = null
  private moveIntervalId: NodeJS.Timeout | null = null
  private moveState: NpcDjMoveState = { kind: 'hangingOut', timerMs: NPC_DJ_IDLE_MIN_MS }
  private trackTimerId: NodeJS.Timeout | null = null
  private trackTimerStreamId = -1
  private lastAnnouncedStreamId = -1
  private leaveAfterTrack = false
  private disposed = false

  constructor(room: ClubMutant, config: INpcDjConfig) {
    this.room = room
    this.config = config
    this.sessionId = `${NPC_DJ_SESSION_PREFIX}${room.roomId}`
    this.name =
      config.name?.trim() ||
      NPC_DJ_NAME_POOL[Math.floor(Math.random() * NPC_DJ_NAME_POOL.length)]
  }

  /**
   * Load the playlist and spawn the NPC player entity.
   * Returns false (and does NOT spawn) when the playlist is missing/invalid.
   */
  spawn(): boolean {
    const playlistId = this.config.playlistId ?? 'default'
    const playlist = loadNpcPlaylist(playlistId)
    if (!playlist) {
      console.error('[NpcDj] Refusing to spawn — playlist missing or invalid:', playlistId)
      return false
    }
    this.playlist = playlist

    const npc = new Player()
    npc.name = this.name
    npc.isNpc = true
    npc.textureId =
      typeof this.config.textureId === 'number'
        ? sanitizeTextureId(this.config.textureId)
        : this.randomTextureId()
    npc.x = NPC_DJ_STANDBY_X
    npc.y = NPC_DJ_STANDBY_Y
    npc.readyToConnect = true
    npc.connected = true
    npc.roomQueuePlaylist = this.buildQueuePlaylist()
    this.room.state.players.set(this.sessionId, npc)

    console.log(
      '[NpcDj] Spawned:',
      this.name,
      `mode=${this.config.mode}`,
      `playlist=${playlist.name} (${playlist.tracks.length} tracks)`
    )

    // Movement loop must exist before the first tick() — a successful
    // joinQueue() inside it sets the walk target to the claimed booth slot.
    this.moveIntervalId = setInterval(() => this.moveTick(), NPC_DJ_MOVE_INTERVAL_MS)

    // Join/play immediately (rotation always joins; fallback joins while no
    // humans are queued), then keep watching.
    this.tick()
    this.watchIntervalId = setInterval(() => this.tick(), WATCH_INTERVAL_MS)
    return true
  }

  /** Tear down timers and remove the NPC from queue/booth/state (room dispose). */
  dispose() {
    if (this.disposed) return
    this.disposed = true

    if (this.watchIntervalId !== null) {
      clearInterval(this.watchIntervalId)
      this.watchIntervalId = null
    }
    if (this.moveIntervalId !== null) {
      clearInterval(this.moveIntervalId)
      this.moveIntervalId = null
    }
    this.clearTrackTimer()

    if (this.room.state.djQueue.some((e) => e.sessionId === this.sessionId)) {
      removeDJFromQueue(this.room, this.sessionId)
    }
    this.disconnectBooth()
    this.room.state.players.delete(this.sessionId)
    console.log('[NpcDj] Disposed:', this.sessionId)
  }

  // ── Watcher loop ───────────────────────────────────────────────────────────

  private tick() {
    if (this.disposed) return
    const state = this.room.state
    if (!state.players.has(this.sessionId)) return

    const musicStream = state.musicStream

    // Our advance timer is only valid for the exact stream it was armed for.
    if (
      this.trackTimerId !== null &&
      (musicStream.status !== 'playing' || musicStream.streamId !== this.trackTimerStreamId)
    ) {
      this.clearTrackTimer()
    }

    const npcQueued = state.djQueue.some((e) => e.sessionId === this.sessionId)
    const humanQueued = state.djQueue.some(
      (e) => !e.sessionId.startsWith(NPC_DJ_SESSION_PREFIX)
    )
    const npcPlaying =
      state.currentDjSessionId === this.sessionId &&
      musicStream.status === 'playing' &&
      !musicStream.isAmbient

    if (this.config.mode === 'fallback') {
      if (humanQueued) {
        if (npcQueued) {
          if (npcPlaying) {
            // Finish the current track first; hand over on track end.
            this.leaveAfterTrack = true
          } else {
            // Not mid-track — hand over immediately.
            this.leaveQueue()
            return
          }
        }
      } else {
        this.leaveAfterTrack = false
        if (!npcQueued) this.joinQueue()
      }
    } else if (!npcQueued) {
      // Rotation mode: permanent queue member — re-join whenever we fall out.
      this.joinQueue()
    }

    // Start playback when we're the current DJ and nothing is playing.
    const shouldPlay =
      state.currentDjSessionId === this.sessionId &&
      musicStream.status === 'waiting' &&
      state.djQueue.some((e) => e.sessionId === this.sessionId) &&
      !(this.config.mode === 'fallback' && humanQueued)

    if (shouldPlay) {
      this.startTrack()
      return
    }

    // An NPC track can also start outside our control (e.g. a human's
    // turn-complete promotes us via advanceRotation, which auto-plays).
    // Adopt it: arm our timer (and announce) for the running stream.
    if (npcPlaying && this.trackTimerId === null) {
      this.armTrackTimer()
    }
  }

  // ── Queue membership ───────────────────────────────────────────────────────

  private joinQueue(): boolean {
    const npc = this.room.state.players.get(this.sessionId)
    if (!npc) return false

    // Reset played flags BEFORE joining so the first playTrackForCurrentDJ
    // call can't hit its silent no-op (no unplayed tracks → room goes quiet).
    this.ensureUnplayedTracks(npc)

    const slot = this.findFreeSlot()
    if (slot === null) return false // queue/slots full — tick retries later

    if (!joinDjQueue(this.room, this.sessionId, this.name, slot, false)) return false

    // Body walks to the slot; queue membership above is already live.
    this.walkToBoothSlot()

    // Occupy a booth seat so ambient playback won't hijack the stream while
    // the NPC is DJing (startAmbientIfNeeded checks booth occupancy).
    this.connectBooth()
    this.room.stopAmbientIfNeeded()

    if (this.config.mode === 'fallback') {
      this.announce(this.pickTemplate(NPC_DJ_FALLBACK_JOIN_TEMPLATES))
    }
    return true
  }

  private leaveQueue() {
    // Only fallback mode ever leaves the queue (rotation leaves only via
    // dispose, which bypasses this method) — this is always a human handover.
    this.announce(this.pickTemplate(NPC_DJ_HANDOVER_TEMPLATES))
    this.leaveAfterTrack = false
    this.clearTrackTimer()
    // Watchdog lifecycle is owned by djHelpers (F2): removeDJFromQueue clears
    // it when stopping our stream, and playTrackForCurrentDJ re-arms it if a
    // promoted DJ's track auto-starts. No manual clear/re-arm needed here.
    removeDJFromQueue(this.room, this.sessionId)
    this.disconnectBooth()
    this.walkToFloor()
  }

  private findFreeSlot(): number | null {
    for (let slot = 0; slot < DJ_SLOT_SERVER_X.length; slot++) {
      if (!this.room.state.djQueue.some((e) => e.slotIndex === slot)) return slot
    }
    return null
  }

  // ── Movement (cosmetic layer — see NpcDjMoveState) ─────────────────────────

  private walkToBoothSlot() {
    const entry = this.room.state.djQueue.find((e) => e.sessionId === this.sessionId)
    if (!entry) return
    this.moveState = {
      kind: 'walking',
      targetX: DJ_SLOT_SERVER_X[entry.slotIndex] ?? 0,
      targetY: BEHIND_BOOTH_SERVER_Y,
      arrive: 'booth',
    }
  }

  private walkToFloor() {
    const { minX, maxX, minY, maxY } = NPC_DJ_WANDER_BOUNDS
    this.moveState = {
      kind: 'walking',
      targetX: minX + Math.random() * (maxX - minX),
      targetY: minY + Math.random() * (maxY - minY),
      arrive: 'floor',
    }
  }

  private randomIdleMs(): number {
    return NPC_DJ_IDLE_MIN_MS + Math.random() * NPC_DJ_IDLE_RANGE_MS
  }

  private moveTick() {
    if (this.disposed) return
    const npc = this.room.state.players.get(this.sessionId)
    if (!npc) return

    const state = this.moveState
    switch (state.kind) {
      case 'stationed':
        // Parked at the booth. Standing still is deliberate: the client plays
        // the dance animation for stationary players while music is playing.
        return

      case 'walking': {
        const dx = state.targetX - npc.x
        const dy = state.targetY - npc.y
        const dist = Math.hypot(dx, dy)
        const step = (NPC_DJ_SPEED * NPC_DJ_MOVE_INTERVAL_MS) / 1000
        if (dist <= step) {
          npc.x = state.targetX
          npc.y = state.targetY
          this.moveState =
            state.arrive === 'booth'
              ? { kind: 'stationed' }
              : { kind: 'hangingOut', timerMs: this.randomIdleMs() }
        } else {
          npc.x += (dx / dist) * step
          npc.y += (dy / dist) * step
        }
        return
      }

      case 'hangingOut': {
        state.timerMs -= NPC_DJ_MOVE_INTERVAL_MS
        if (state.timerMs <= 0) this.walkToFloor() // wander leg
        return
      }
    }
  }

  private connectBooth() {
    const booth = this.room.state.musicBooths[0]
    if (!booth) return
    if (booth.connectedUsers.some((id) => id === this.sessionId)) return
    const emptyIndex = booth.connectedUsers.findIndex((id) => id === '')
    if (emptyIndex < 0) return
    booth.connectedUsers.splice(emptyIndex, 1, this.sessionId)
  }

  private disconnectBooth() {
    const booth = this.room.state.musicBooths[0]
    if (!booth) return
    const index = booth.connectedUsers.findIndex((id) => id === this.sessionId)
    if (index >= 0) booth.connectedUsers.splice(index, 1, '')
  }

  // ── Playback ───────────────────────────────────────────────────────────────

  private startTrack() {
    const npc = this.room.state.players.get(this.sessionId)
    if (!npc) return

    // Loop behavior: reset + reshuffle when the playlist is exhausted, BEFORE
    // playTrackForCurrentDJ (which silently no-ops without unplayed tracks).
    this.ensureUnplayedTracks(npc)

    playTrackForCurrentDJ(this.room)

    if (this.room.state.musicStream.status === 'playing') {
      this.armTrackTimer()
    } else {
      console.warn('[NpcDj] startTrack: playTrackForCurrentDJ did not start playback')
    }
  }

  /**
   * Arm the manager's track-advance timer for the currently playing NPC
   * stream, clearing the room watchdog (we are the sole timing authority for
   * NPC tracks). Announces the track once per streamId.
   */
  private armTrackTimer() {
    const musicStream = this.room.state.musicStream
    if (musicStream.status !== 'playing' || !musicStream.currentLink) return
    if (musicStream.currentDj?.sessionId !== this.sessionId) return

    this.clearTrackTimer()
    // The watchdog would dispatch DJTurnCompleteCommand with a fake Client at
    // duration+grace — clear it while our timer owns this stream.
    this.room.clearTrackWatchdog()

    const streamId = musicStream.streamId
    const remainingMs = Math.max(
      0,
      musicStream.startTime + musicStream.duration * 1000 - Date.now()
    )
    this.trackTimerStreamId = streamId
    this.trackTimerId = setTimeout(() => this.onTrackComplete(streamId), remainingMs)

    if (this.lastAnnouncedStreamId !== streamId) {
      this.lastAnnouncedStreamId = streamId
      this.announceTrack(musicStream.currentTitle ?? '')
    }
  }

  private clearTrackTimer() {
    if (this.trackTimerId !== null) {
      clearTimeout(this.trackTimerId)
      this.trackTimerId = null
    }
    this.trackTimerStreamId = -1
  }

  private onTrackComplete(streamId: number) {
    this.trackTimerId = null
    this.trackTimerStreamId = -1
    if (this.disposed) return

    const state = this.room.state
    const musicStream = state.musicStream

    // Stale timer — a different stream started or playback stopped meanwhile.
    if (musicStream.status !== 'playing' || musicStream.streamId !== streamId) return
    if (state.currentDjSessionId !== this.sessionId) return

    // Defensive only: armTrackTimer already cleared the watchdog when it
    // claimed this stream, and the F2 centralization keeps clear/arm paired in
    // djHelpers — but clearing again here is a free guarantee that nothing can
    // double-advance behind us while we mutate rotation state.
    this.room.clearTrackWatchdog()

    const npc = state.players.get(this.sessionId)
    // F7: pass the playing track's id — the stream is still 'playing' with a
    // matching streamId here (checked above), so currentTrackId is valid.
    if (npc) markTrackAsPlayed(npc, musicStream.currentTrackId)

    if (this.config.mode === 'fallback' && this.leaveAfterTrack) {
      console.log('[NpcDj] Track finished with humans waiting — leaving the queue')
      this.leaveQueue()
      return
    }

    // Reset played flags BEFORE advanceRotation — it may promote us again
    // (solo rotation) and immediately call playTrackForCurrentDJ.
    if (npc) this.ensureUnplayedTracks(npc)

    // advanceRotation rotates the entry matching currentDjSessionId (F1 fix in
    // djHelpers.ts), so it is safe even if the queue was reordered under us.
    // Its play/stop paths arm/clear the watchdog themselves (F2); if the next
    // track is ours again, the next tick's armTrackTimer reclaims the stream
    // by clearing that watchdog and arming our own timer.
    advanceRotation(this.room)
  }

  // ── Playlist ───────────────────────────────────────────────────────────────

  /** Rebuild (reset played flags + reshuffle) when the playlist is exhausted. */
  private ensureUnplayedTracks(npc: Player) {
    if (npc.roomQueuePlaylist.length > 0 && hasUnplayedTracks(npc)) return
    console.log('[NpcDj] Playlist exhausted — resetting played flags and reshuffling')
    npc.roomQueuePlaylist = this.buildQueuePlaylist()
  }

  private buildQueuePlaylist(): RoomQueuePlaylistItem[] {
    const tracks = [...(this.playlist?.tracks ?? [])]
    // Fisher–Yates shuffle
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[tracks[i], tracks[j]] = [tracks[j], tracks[i]]
    }
    return tracks.map((track) => {
      const item = new RoomQueuePlaylistItem()
      item.id = track.id
      item.title = track.title
      item.link = track.link
      item.duration = track.duration
      item.addedAtMs = Date.now()
      item.played = false
      return item
    })
  }

  // ── Chat announcements ─────────────────────────────────────────────────────

  // Same path as ClubMutant.broadcastNpcMessage: store in the chatMessages
  // schema for late joiners + broadcast ADD_CHAT_MESSAGE to everyone.
  private announce(content: string) {
    const chatMessages = this.room.state.chatMessages
    if (chatMessages.length >= 25) chatMessages.shift()
    const msg = new ChatMessage()
    msg.author = this.name
    msg.content = content
    chatMessages.push(msg)

    this.room.broadcast(Message.ADD_CHAT_MESSAGE, {
      clientId: this.sessionId,
      content,
    })
  }

  private pickTemplate(pool: string[]): string {
    return pool[Math.floor(Math.random() * pool.length)]
  }

  private announceTrack(title: string) {
    if (!title) return
    const template =
      TRACK_START_TEMPLATES[Math.floor(Math.random() * TRACK_START_TEMPLATES.length)]
    this.announce(template.replace('{title}', title))
  }

  private randomTextureId(): number {
    const ids = Object.values(TEXTURE_IDS) as number[]
    return ids[Math.floor(Math.random() * ids.length)]
  }
}
