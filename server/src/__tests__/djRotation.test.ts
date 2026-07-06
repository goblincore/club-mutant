import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RoomState, Player, DJQueueEntry, RoomQueuePlaylistItem } from '@club-mutant/types/RoomState'
import { advanceRotation } from '../rooms/commands/djHelpers'
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

  it('stops the stream when no DJ has unplayed tracks', () => {
    const alice = addPlayer(room, 'A', 'Alice', ['track-a'])
    alice.roomQueuePlaylist[0].played = true
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
