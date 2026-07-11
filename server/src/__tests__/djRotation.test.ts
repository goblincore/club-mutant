import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RoomState, Player, DJQueueEntry, RoomQueuePlaylistItem } from '@club-mutant/types/RoomState'
import {
  advanceRotation,
  markTrackAsPlayed,
  removeDJFromQueue,
  joinDjQueue,
} from '../rooms/commands/djHelpers'
import { DJTurnCompleteCommand } from '../rooms/commands/DJQueueCommand'
import type { ClubMutant } from '../rooms/ClubMutant'

// djHelpers.playTrackForCurrentDJ prefetches the next DJ's track — stub the
// network call out (module id resolves to server/src/youtubeService).
vi.mock('../youtubeService', () => ({
  prefetchVideo: vi.fn(),
}))

function makeRoom(): ClubMutant {
  const room = {
    state: new RoomState(),
    broadcast: vi.fn(),
    notifyNpcMusicStarted: vi.fn(),
    // F2: the helpers own the watchdog lifecycle — stubbed here since the
    // real timers live on the Colyseus room, not under rotation test.
    clearTrackWatchdog: vi.fn(),
    startWatchdogIfPlaying: vi.fn(),
  }
  return room as unknown as ClubMutant
}

function addPlayer(room: ClubMutant, sessionId: string, name: string, trackTitles: string[] = []) {
  const player = new Player()
  player.name = name
  for (const title of trackTitles) {
    const item = new RoomQueuePlaylistItem()
    item.id = `${sessionId}-${title}`
    item.title = title
    item.link = `https://youtu.be/${title}`
    item.duration = 180
    player.roomQueuePlaylist.push(item)
  }
  room.state.players.set(sessionId, player)
  return player
}

function addToQueue(room: ClubMutant, sessionId: string, name: string, slotIndex: number) {
  const entry = new DJQueueEntry()
  entry.sessionId = sessionId
  entry.name = name
  entry.joinedAtMs = Date.now()
  entry.queuePosition = room.state.djQueue.length
  entry.slotIndex = slotIndex
  room.state.djQueue.push(entry)
  return entry
}

function queueIds(room: ClubMutant): string[] {
  return room.state.djQueue.toArray().map((e) => e.sessionId)
}

function runTurnComplete(room: ClubMutant, sessionId: string, streamId?: number) {
  const cmd = new DJTurnCompleteCommand()
  ;(cmd as any).room = room
  ;(cmd as any).state = room.state
  cmd.execute({ client: { sessionId } as any, streamId })
}

describe('advanceRotation — F1: rotates the CURRENT DJ, not djQueue[0]', () => {
  let room: ClubMutant

  beforeEach(() => {
    room = makeRoom()
  })

  it('moves the entry matching currentDjSessionId to the end when it is not at index 0', () => {
    addPlayer(room, 'A', 'Alice', ['track-a'])
    addPlayer(room, 'B', 'Bob', ['track-b'])
    addPlayer(room, 'C', 'Carol') // no tracks
    addToQueue(room, 'A', 'Alice', 0)
    addToQueue(room, 'B', 'Bob', 1)
    addToQueue(room, 'C', 'Carol', 2)

    // B is current despite sitting at index 1 (join/DJ_PLAY promotion paths do this)
    room.state.currentDjSessionId = 'B'

    advanceRotation(room)

    // B (the current DJ) rotated to the end — A must NOT be starved
    expect(queueIds(room)).toEqual(['A', 'C', 'B'])
    expect(room.state.currentDjSessionId).toBe('A')
    expect(room.state.musicStream.status).toBe('playing')
    expect(room.state.musicStream.currentTitle).toBe('track-a')
    // queuePosition re-numbered contiguously
    expect(room.state.djQueue.toArray().map((e) => e.queuePosition)).toEqual([0, 1, 2])
  })

  it('drops a disconnected current DJ instead of re-queueing them', () => {
    addPlayer(room, 'A', 'Alice', ['track-a'])
    addToQueue(room, 'A', 'Alice', 0)
    addToQueue(room, 'B', 'Bob', 1) // entry exists but player left (no players entry)
    room.state.currentDjSessionId = 'B'

    advanceRotation(room)

    expect(queueIds(room)).toEqual(['A'])
    expect(room.state.currentDjSessionId).toBe('A')
  })

  // F8: a full cycle through every DJ's playlist must loop, not strand the
  // rotation in silence until a human presses ▶.
  it('loops the rotation by resetting played flags when every queued DJ is exhausted (F8)', () => {
    const alice = addPlayer(room, 'A', 'Alice', ['track-a'])
    const bob = addPlayer(room, 'B', 'Bob', ['track-b'])
    alice.roomQueuePlaylist[0].played = true
    bob.roomQueuePlaylist[0].played = true
    addToQueue(room, 'A', 'Alice', 0)
    addToQueue(room, 'B', 'Bob', 1)
    room.state.currentDjSessionId = 'A'

    advanceRotation(room)

    // Rotation continues: A rotated to the back, B starts a fresh cycle
    expect(queueIds(room)).toEqual(['B', 'A'])
    expect(room.state.currentDjSessionId).toBe('B')
    expect(room.state.musicStream.status).toBe('playing')
    expect(room.state.musicStream.currentTitle).toBe('track-b')
    // Both flags were reset by the loop; marking happens via markTrackAsPlayed
    // on turn completion, not at playback start — so both are false here
    expect(bob.roomQueuePlaylist[0].played).toBe(false)
    expect(alice.roomQueuePlaylist[0].played).toBe(false)
  })

  it('still stops the stream when queued DJs have no tracks at all (nothing to loop)', () => {
    addPlayer(room, 'A', 'Alice') // empty playlist — no flags to reset
    addToQueue(room, 'A', 'Alice', 0)
    room.state.currentDjSessionId = 'A'

    advanceRotation(room)

    expect(room.state.currentDjSessionId).toBeNull()
    expect(room.state.musicStream.status).toBe('waiting')
    expect(room.state.musicStream.currentLink).toBeNull()
  })
})

describe('DJTurnCompleteCommand — F4: stale/duplicate completions are rejected', () => {
  let room: ClubMutant

  beforeEach(() => {
    room = makeRoom()
    addPlayer(room, 'A', 'Alice', ['track-a'])
    addPlayer(room, 'B', 'Bob', ['track-b'])
    addToQueue(room, 'A', 'Alice', 0)
    addToQueue(room, 'B', 'Bob', 1)
    room.state.currentDjSessionId = 'A'
    room.state.musicStream.status = 'playing'
    room.state.musicStream.streamId = 5
    room.state.musicStream.currentTitle = 'track-a'
  })

  it('ignores a turn-complete carrying a stale streamId', () => {
    runTurnComplete(room, 'A', 4) // stale — current stream is 5

    expect(room.state.currentDjSessionId).toBe('A')
    expect(queueIds(room)).toEqual(['A', 'B'])
    const alice = room.state.players.get('A')!
    expect(alice.roomQueuePlaylist[0].played).toBe(false)
  })

  it('processes a turn-complete with the matching streamId', () => {
    runTurnComplete(room, 'A', 5)

    // A's track marked played, rotation advanced to B
    expect(room.state.currentDjSessionId).toBe('B')
    expect(queueIds(room)).toEqual(['B', 'A'])
    const alice = room.state.players.get('A')!
    expect(alice.roomQueuePlaylist.some((t) => t.played)).toBe(true)
    expect(room.state.musicStream.currentTitle).toBe('track-b')
  })

  it('still accepts a payload without streamId (watchdog/legacy senders)', () => {
    runTurnComplete(room, 'A', undefined)
    expect(room.state.currentDjSessionId).toBe('B')
  })

  it('rejects a turn-complete from a non-current DJ even with matching streamId', () => {
    runTurnComplete(room, 'B', 5)
    expect(room.state.currentDjSessionId).toBe('A')
    expect(queueIds(room)).toEqual(['A', 'B'])
  })
})

describe('removeDJFromQueue — F5: leave-promotion skips exhausted DJs', () => {
  let room: ClubMutant

  beforeEach(() => {
    room = makeRoom()
  })

  it('promotes the next DJ with UNPLAYED tracks, not blindly djQueue[0]', () => {
    addPlayer(room, 'A', 'Alice', ['track-a'])
    const bob = addPlayer(room, 'B', 'Bob', ['track-b'])
    bob.roomQueuePlaylist[0].played = true // B exhausted their playlist
    addPlayer(room, 'C', 'Carol', ['track-c'])
    addToQueue(room, 'A', 'Alice', 0)
    addToQueue(room, 'B', 'Bob', 1)
    addToQueue(room, 'C', 'Carol', 2)
    room.state.currentDjSessionId = 'A'
    room.state.musicStream.status = 'playing'

    removeDJFromQueue(room, 'A')

    // C (first with unplayed tracks) is current and playing; B was skipped
    expect(room.state.currentDjSessionId).toBe('C')
    expect(queueIds(room)).toEqual(['C', 'B'])
    expect(room.state.musicStream.status).toBe('playing')
    expect(room.state.musicStream.currentTitle).toBe('track-c')
    // B's played flags untouched — they were skipped, not reset
    expect(bob.roomQueuePlaylist[0].played).toBe(true)
  })

  it('loop-resets an exhausted playlist when nobody has unplayed tracks', () => {
    addPlayer(room, 'A', 'Alice', ['track-a'])
    const bob = addPlayer(room, 'B', 'Bob', ['track-b'])
    bob.roomQueuePlaylist[0].played = true
    addToQueue(room, 'A', 'Alice', 0)
    addToQueue(room, 'B', 'Bob', 1)
    room.state.currentDjSessionId = 'A'
    room.state.musicStream.status = 'playing'

    removeDJFromQueue(room, 'A')

    // B promoted; their fully-played playlist was reset and playback resumed
    // instead of stalling silently (the old length>0 check no-opped here)
    expect(room.state.currentDjSessionId).toBe('B')
    expect(room.state.musicStream.status).toBe('playing')
    expect(room.state.musicStream.currentTitle).toBe('track-b')
  })

  it('promotes a trackless DJ as waiting current without crashing', () => {
    addPlayer(room, 'A', 'Alice', ['track-a'])
    addPlayer(room, 'B', 'Bob') // no tracks at all
    addToQueue(room, 'A', 'Alice', 0)
    addToQueue(room, 'B', 'Bob', 1)
    room.state.currentDjSessionId = 'A'
    room.state.musicStream.status = 'playing'

    removeDJFromQueue(room, 'A')

    expect(room.state.currentDjSessionId).toBe('B')
    expect(room.state.musicStream.status).toBe('waiting')
    expect(room.state.musicStream.currentLink).toBeNull()
  })
})

describe('markTrackAsPlayed — F7: marks the track that actually played', () => {
  let room: ClubMutant

  beforeEach(() => {
    room = makeRoom()
  })

  it('marks the track matching the given id even at index > 0', () => {
    const alice = addPlayer(room, 'A', 'Alice', ['old-track', 'actual-track'])
    alice.roomQueuePlaylist[0].played = true // played track reordered to index 0

    markTrackAsPlayed(alice, 'A-actual-track')

    // The actually-playing track (index 1) got marked and moved to the bottom
    const titles = alice.roomQueuePlaylist.map((t) => t.title)
    expect(titles).toEqual(['old-track', 'actual-track'])
    const actual = alice.roomQueuePlaylist.find((t) => t.id === 'A-actual-track')!
    expect(actual.played).toBe(true)
  })

  it('marks nothing when the id is no longer in the playlist', () => {
    const alice = addPlayer(room, 'A', 'Alice', ['bystander'])

    markTrackAsPlayed(alice, 'A-gone-track')

    expect(alice.roomQueuePlaylist[0].played).toBe(false)
    expect(alice.roomQueuePlaylist.length).toBe(1)
  })

  it('falls back to index 0 when no id is provided (legacy callers)', () => {
    const alice = addPlayer(room, 'A', 'Alice', ['first', 'second'])

    markTrackAsPlayed(alice, null)

    const first = alice.roomQueuePlaylist.find((t) => t.id === 'A-first')!
    expect(first.played).toBe(true)
    expect(alice.roomQueuePlaylist[alice.roomQueuePlaylist.length - 1].id).toBe('A-first')
  })

  it('turn-complete marks the currentTrackId track, not index 0', () => {
    const alice = addPlayer(room, 'A', 'Alice', ['old-track', 'actual-track'])
    alice.roomQueuePlaylist[0].played = true
    addPlayer(room, 'B', 'Bob', ['track-b'])
    addToQueue(room, 'A', 'Alice', 0)
    addToQueue(room, 'B', 'Bob', 1)
    room.state.currentDjSessionId = 'A'
    room.state.musicStream.status = 'playing'
    room.state.musicStream.streamId = 7
    room.state.musicStream.currentTrackId = 'A-actual-track'

    runTurnComplete(room, 'A', 7)

    const actual = alice.roomQueuePlaylist.find((t) => t.id === 'A-actual-track')!
    expect(actual.played).toBe(true)
    expect(room.state.currentDjSessionId).toBe('B')
  })
})

describe('joinDjQueue — teleport parameter', () => {
  let room: ClubMutant

  beforeEach(() => {
    room = makeRoom()
  })

  it('teleports the joining player to the slot by default', () => {
    const player = addPlayer(room, 'A', 'Alice', ['track-a'])
    player.x = 50
    player.y = 50

    const ok = joinDjQueue(room, 'A', 'Alice', 0)

    expect(ok).toBe(true)
    expect(player.x).toBe(100) // DJ_SLOT_SERVER_X[0]
    expect(player.y).toBe(430) // BEHIND_BOOTH_SERVER_Y
  })

  it('leaves the player position untouched when teleport=false (NPC walks instead)', () => {
    const player = addPlayer(room, 'A', 'Alice', ['track-a'])
    player.x = 50
    player.y = 50

    const ok = joinDjQueue(room, 'A', 'Alice', 0, false)

    expect(ok).toBe(true)
    // Queue membership is instant…
    expect(room.state.djQueue.some((e) => e.sessionId === 'A')).toBe(true)
    // …but the body has not moved.
    expect(player.x).toBe(50)
    expect(player.y).toBe(50)
  })
})
