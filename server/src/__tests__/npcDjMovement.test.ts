import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RoomState, Player, DJQueueEntry } from '@club-mutant/types/RoomState'
import type { ClubMutant } from '../rooms/ClubMutant'
import {
  NpcDjManager,
  NPC_DJ_WANDER_BOUNDS,
  NPC_DJ_HANDOVER_TEMPLATES,
  sanitizeNpcDjOptions,
} from '../rooms/NpcDjManager'
import { Message } from '@club-mutant/types/Messages'
import { DJ_SLOT_SERVER_X, BEHIND_BOOTH_SERVER_Y } from '../rooms/commands/djHelpers'

// playTrackForCurrentDJ prefetches via the network — stub it out.
vi.mock('../youtubeService', () => ({
  prefetchVideo: vi.fn(),
}))

function makeRoom(): ClubMutant {
  const room = {
    roomId: 'testroom',
    state: new RoomState(),
    broadcast: vi.fn(),
    notifyNpcMusicStarted: vi.fn(),
    clearTrackWatchdog: vi.fn(),
    startWatchdogIfPlaying: vi.fn(),
    stopAmbientIfNeeded: vi.fn(),
  }
  return room as unknown as ClubMutant
}

function npcOf(room: ClubMutant, manager: NpcDjManager) {
  const npc = room.state.players.get(manager.sessionId)
  if (!npc) throw new Error('NPC player missing from state')
  return npc
}

// A queued human keeps the fallback watcher from re-joining the queue while
// we drive the NPC's floor behavior under fake timers.
function addHumanDj(room: ClubMutant, sessionId: string, slotIndex: number) {
  const player = new Player()
  player.name = sessionId
  room.state.players.set(sessionId, player)
  const entry = new DJQueueEntry()
  entry.sessionId = sessionId
  entry.name = sessionId
  entry.joinedAtMs = Date.now()
  entry.queuePosition = room.state.djQueue.length
  entry.slotIndex = slotIndex
  room.state.djQueue.push(entry)
}

const inWanderBounds = (x: number, y: number) =>
  x >= NPC_DJ_WANDER_BOUNDS.minX &&
  x <= NPC_DJ_WANDER_BOUNDS.maxX &&
  y >= NPC_DJ_WANDER_BOUNDS.minY &&
  y <= NPC_DJ_WANDER_BOUNDS.maxY

describe('NpcDjManager movement', () => {
  let room: ClubMutant
  let manager: NpcDjManager

  beforeEach(() => {
    vi.useFakeTimers()
    room = makeRoom()
  })

  afterEach(() => {
    manager?.dispose()
    vi.useRealTimers()
  })

  it('joins the queue instantly but walks to the booth slot instead of teleporting', () => {
    manager = new NpcDjManager(room, { mode: 'rotation' })
    expect(manager.spawn()).toBe(true)

    // Queue membership is instant (spawn ticks synchronously)…
    const entry = room.state.djQueue.find((e) => e.sessionId === manager.sessionId)
    expect(entry).toBeDefined()

    // …but the body is still at the spawn/standby point, not the slot.
    const npc = npcOf(room, manager)
    const slotX = DJ_SLOT_SERVER_X[entry!.slotIndex] ?? 0
    expect(npc.x).toBe(220)
    expect(npc.y).toBe(500)

    // Walk partway: after 1s it has moved toward the slot but not arrived.
    const startDist = Math.hypot(slotX - npc.x, BEHIND_BOOTH_SERVER_Y - npc.y)
    vi.advanceTimersByTime(1000)
    const midDist = Math.hypot(slotX - npc.x, BEHIND_BOOTH_SERVER_Y - npc.y)
    expect(midDist).toBeLessThan(startDist)
    expect(midDist).toBeGreaterThan(0)

    // After 10s total it has settled exactly on the slot.
    vi.advanceTimersByTime(9000)
    expect(npc.x).toBe(slotX)
    expect(npc.y).toBe(BEHIND_BOOTH_SERVER_Y)

    // Stationed: it does not drift afterwards (no jitter — the client's
    // auto-dance requires a stationary player).
    vi.advanceTimersByTime(5000)
    expect(npc.x).toBe(slotX)
    expect(npc.y).toBe(BEHIND_BOOTH_SERVER_Y)
  })

  it('leaveQueue removes it from the queue instantly and walks it into the wander bounds', () => {
    manager = new NpcDjManager(room, { mode: 'fallback' })
    expect(manager.spawn()).toBe(true)
    expect(room.state.djQueue.some((e) => e.sessionId === manager.sessionId)).toBe(true)

    // Let it reach the booth first.
    vi.advanceTimersByTime(10_000)

    // A queued human prevents the fallback watcher from re-joining while we
    // advance timers below.
    addHumanDj(room, 'human-1', 1)
    ;(manager as any).leaveQueue()

    // Queue exit is instant…
    expect(room.state.djQueue.some((e) => e.sessionId === manager.sessionId)).toBe(false)

    // …and the body is still at the booth, then walks to the floor.
    const npc = npcOf(room, manager)
    expect(npc.y).toBe(BEHIND_BOOTH_SERVER_Y)

    // Max walk: booth corner to far corner of bounds < 500px @ 60px/s < 9s.
    vi.advanceTimersByTime(9000)
    expect(inWanderBounds(npc.x, npc.y)).toBe(true)
  })

  it('wanders within bounds indefinitely once on the floor', () => {
    manager = new NpcDjManager(room, { mode: 'fallback' })
    expect(manager.spawn()).toBe(true)
    vi.advanceTimersByTime(10_000)
    addHumanDj(room, 'human-1', 1) // keep the fallback watcher from re-joining
    ;(manager as any).leaveQueue()
    vi.advanceTimersByTime(9000) // arrive on the floor

    const npc = npcOf(room, manager)
    const visited: Array<{ x: number; y: number }> = []
    // Bounds form a convex rectangle, so every point on a walk between two
    // in-bounds targets is also in bounds — safe to sample mid-walk.
    for (let i = 0; i < 24; i++) {
      vi.advanceTimersByTime(5000)
      visited.push({ x: npc.x, y: npc.y })
      expect(inWanderBounds(npc.x, npc.y)).toBe(true)
    }
    // It actually moves (idle windows are 3–8s, so 2 minutes must include walks).
    const distinct = new Set(visited.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`))
    expect(distinct.size).toBeGreaterThan(1)
  })

  it('announces a handover line when leaving the queue', () => {
    manager = new NpcDjManager(room, { mode: 'fallback' })
    expect(manager.spawn()).toBe(true)
    vi.advanceTimersByTime(10_000)
    ;(room.broadcast as any).mockClear()

    ;(manager as any).leaveQueue()

    const chatCalls = (room.broadcast as any).mock.calls.filter(
      (c: any[]) => c[0] === Message.ADD_CHAT_MESSAGE
    )
    expect(chatCalls.length).toBe(1)
    expect(NPC_DJ_HANDOVER_TEMPLATES).toContain(chatCalls[0][1].content)
  })
})

describe('sanitizeNpcDjOptions — untrusted client input', () => {
  it('accepts valid modes and strips every other field', () => {
    expect(sanitizeNpcDjOptions({ mode: 'fallback' })).toEqual({ mode: 'fallback' })
    expect(
      sanitizeNpcDjOptions({
        mode: 'rotation',
        name: 'impersonator',
        playlistId: '../../etc/passwd',
        textureId: 99,
      })
    ).toEqual({ mode: 'rotation' })
  })

  it('rejects anything without a valid mode', () => {
    expect(sanitizeNpcDjOptions(undefined)).toBeNull()
    expect(sanitizeNpcDjOptions(null)).toBeNull()
    expect(sanitizeNpcDjOptions('rotation')).toBeNull()
    expect(sanitizeNpcDjOptions({})).toBeNull()
    expect(sanitizeNpcDjOptions({ mode: 'evil' })).toBeNull()
    expect(sanitizeNpcDjOptions({ mode: 42 })).toBeNull()
  })
})
