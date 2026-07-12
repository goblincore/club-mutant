import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { boot, ColyseusTestServer } from '@colyseus/testing'
import { Server } from '@colyseus/core'
import { ClubMutant } from '../rooms/ClubMutant'
import { Message } from '@club-mutant/types/Messages'
import { RoomType } from '@club-mutant/types/Rooms'

// Public room: onJoin populates player.name from options (use for join/move/chat tests).
const PUBLIC_ROOM_OPTIONS = {
  name: 'Test Room',
  description: 'integration test',
  password: null,
  autoDispose: true,
  isPublic: true,
  musicMode: 'djqueue' as const,
}

// Private room: no auto-ambient stream (use for DJ tests so we can drive the
// musicStream ourselves without interference). Player name stays empty.
const PRIVATE_ROOM_OPTIONS = {
  ...PUBLIC_ROOM_OPTIONS,
  isPublic: false,
}

const GUEST_AUTH = { password: null }

// Note: @colyseus/testing monkey-patches the SDK Room prototype to add
// `client.waitForNextPatch()` / `client.waitForMessage()`. Those patches do
// not survive vitest's module loader (the patched prototype lives in a
// different realm than the one the SDK creates client instances from), so
// we use the server-side `room.waitForNextPatch()` plus brief setTimeout
// waits to let the client SDK propagate state. Server state is the source
// of truth for assertions anyway.
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Shared server across the file: each test creates its own room (so they
// don't share state) but reuses the listening port. Avoids port-rebind
// races we'd hit by spinning up a new Server per test.
describe('ClubMutant room integration', () => {
  let testServer: ColyseusTestServer

  beforeAll(async () => {
    const gameServer = new Server()
    gameServer.define(RoomType.CUSTOM, ClubMutant)
    testServer = await boot(gameServer)
  }, 30000)

  afterAll(async () => {
    await testServer.shutdown()
  })

  it('player joins, state syncs, player leaves', { timeout: 15000 }, async () => {
    const room = await testServer.createRoom<ClubMutant>(RoomType.CUSTOM, PUBLIC_ROOM_OPTIONS)

    const client = await testServer.connectTo(room, {
      ...GUEST_AUTH,
      name: 'Alice',
      playerId: 'guest-alice',
      textureId: 0,
      spawnX: 50,
      spawnY: 60,
    })

    expect(room.state.players.size).toBe(1)
    const serverPlayer = room.state.players.get(client.sessionId)
    expect(serverPlayer).toBeDefined()
    expect(serverPlayer!.name).toBe('Alice')
    expect(serverPlayer!.x).toBe(50)
    expect(serverPlayer!.y).toBe(60)
    expect(serverPlayer!.connected).toBe(true)

    await client.leave()
    // Last client leaves an autoDispose room → room disposes; player is gone.
    await wait(50)
    expect(room.state.players.size).toBe(0)
  })

  it('player movement updates state within speed cap', { timeout: 15000 }, async () => {
    const room = await testServer.createRoom<ClubMutant>(RoomType.CUSTOM, PUBLIC_ROOM_OPTIONS)
    const client = await testServer.connectTo(room, {
      ...GUEST_AUTH, name: 'Bob', playerId: 'guest-bob', textureId: 0, spawnX: 0, spawnY: 0,
    })

    // Wait past the 100ms minIntervalMs throttle (lastAt was set at onJoin).
    await wait(120)

    // Small delta well within the 240px/s + 40px buffer cap.
    client.send(Message.UPDATE_PLAYER_ACTION, { x: 10, y: 20, textureId: 0, animId: 0 })
    await room.waitForNextPatch()

    const player = room.state.players.get(client.sessionId)
    expect(player!.x).toBe(10)
    expect(player!.y).toBe(20)

    await client.leave()
  })

  it('chat message broadcasts to other clients', { timeout: 15000 }, async () => {
    const room = await testServer.createRoom<ClubMutant>(RoomType.CUSTOM, PUBLIC_ROOM_OPTIONS)
    const alice = await testServer.connectTo(room, {
      ...GUEST_AUTH, name: 'Alice', playerId: 'a', textureId: 0, spawnX: 0, spawnY: 0,
    })
    const bob = await testServer.connectTo(room, {
      ...GUEST_AUTH, name: 'Bob', playerId: 'b', textureId: 0, spawnX: 0, spawnY: 0,
    })

    // Standard SDK onMessage works (no monkey-patch involved).
    const received = new Promise<{ clientId: string; content: string }>((resolve) => {
      bob.onMessage(Message.ADD_CHAT_MESSAGE, (msg: any) => resolve(msg))
    })

    alice.send(Message.ADD_CHAT_MESSAGE, { content: 'hello!' })

    const msg = await received
    expect(msg.content).toBe('hello!')
    expect(msg.clientId).toBe(alice.sessionId)

    expect(room.state.chatMessages.length).toBeGreaterThanOrEqual(1)
    expect(room.state.chatMessages[room.state.chatMessages.length - 1].content).toBe('hello!')

    await alice.leave()
    await bob.leave()
  })

  it('DJ queue: two DJs join, first plays, turn complete advances rotation', { timeout: 15000 }, async () => {
    const room = await testServer.createRoom<ClubMutant>(RoomType.CUSTOM, PRIVATE_ROOM_OPTIONS)
    const dj1 = await testServer.connectTo(room, {
      ...GUEST_AUTH, name: 'DJ1', playerId: 'dj1', textureId: 0, spawnX: 0, spawnY: 0,
    })
    const dj2 = await testServer.connectTo(room, {
      ...GUEST_AUTH, name: 'DJ2', playerId: 'dj2', textureId: 0, spawnX: 0, spawnY: 0,
    })

    dj1.send(Message.DJ_QUEUE_JOIN, { slotIndex: 0 })
    await wait(80)
    dj2.send(Message.DJ_QUEUE_JOIN, { slotIndex: 1 })
    await wait(80)

    expect(room.state.djQueue.length).toBe(2)
    expect(room.state.currentDjSessionId).toBe(dj1.sessionId)

    // Both DJs add a track. ROOM_QUEUE_PLAYLIST_ADD writes to server-only
    // roomQueuePlaylist (no schema patch fires), so we wait on each send.
    // We need dj2 to have a track so rotation actually advances to them
    // when dj1's turn completes (otherwise findNextDJWithTracks returns null).
    dj1.send(Message.ROOM_QUEUE_PLAYLIST_ADD, {
      title: 'DJ1 Track',
      link: 'dQw4w9WgXcQ',
      duration: 213,
    })
    await wait(80)
    dj2.send(Message.ROOM_QUEUE_PLAYLIST_ADD, {
      title: 'DJ2 Track',
      link: 'oHg5SJYRHA0',
      duration: 213,
    })
    await wait(80)

    dj1.send(Message.DJ_PLAY)
    await wait(80)

    expect(room.state.musicStream.status).toBe('playing')
    expect(room.state.musicStream.currentTitle).toBe('DJ1 Track')
    expect(room.state.musicStream.currentDj.sessionId).toBe(dj1.sessionId)

    dj1.send(Message.DJ_TURN_COMPLETE)
    await wait(80)

    expect(room.state.currentDjSessionId).toBe(dj2.sessionId)

    await dj1.leave()
    await dj2.leave()
  })

  it('NPC_DJ_SET_STANDBY waves the fallback NPC off the decks and summons it back', { timeout: 15000 }, async () => {
    const room = await testServer.createRoom<ClubMutant>(RoomType.CUSTOM, {
      ...PRIVATE_ROOM_OPTIONS,
      npcDj: { mode: 'fallback' },
    })
    const npcSessionId = `npc-dj:${room.roomId}`

    // Fallback NPC spawns with an empty queue → takes the booth immediately.
    expect(room.state.djQueue.some((e) => e.sessionId === npcSessionId)).toBe(true)

    const client = await testServer.connectTo(room, {
      ...GUEST_AUTH,
      playerId: 'guest-heckler',
      textureId: 0,
    })

    client.send(Message.NPC_DJ_SET_STANDBY, { standby: true })
    await wait(80)
    expect(room.state.djQueue.some((e) => e.sessionId === npcSessionId)).toBe(false)

    // Past the per-client throttle, then summon — the NPC rejoins on its next
    // watcher tick (1s interval).
    await wait(1100)
    client.send(Message.NPC_DJ_SET_STANDBY, { standby: false })
    await wait(1300)
    expect(room.state.djQueue.some((e) => e.sessionId === npcSessionId)).toBe(true)

    await client.leave()
  })

  it('NPC_DJ_SET_MODE: room creator toggles the NPC DJ live; others are ignored', { timeout: 20000 }, async () => {
    // Custom djqueue room created WITHOUT an NPC DJ.
    const room = await testServer.createRoom<ClubMutant>(RoomType.CUSTOM, PRIVATE_ROOM_OPTIONS)
    const npcSessionId = `npc-dj:${room.roomId}`
    expect(room.state.npcDjMode).toBe('off')

    // First joiner is the creator/owner.
    const creator = await testServer.connectTo(room, {
      ...GUEST_AUTH,
      playerId: 'guest-creator',
      textureId: 0,
    })
    await wait(80)
    expect(room.state.creatorPlayerId).toBe('guest-creator')

    const guest = await testServer.connectTo(room, {
      ...GUEST_AUTH,
      playerId: 'guest-other',
      textureId: 0,
    })
    await wait(80)

    // Non-creator cannot summon an NPC.
    guest.send(Message.NPC_DJ_SET_MODE, { mode: 'fallback' })
    await wait(120)
    expect(room.state.npcDjMode).toBe('off')
    expect(room.state.players.has(npcSessionId)).toBe(false)

    // Creator turns it on (fallback): NPC spawns and takes the empty booth.
    creator.send(Message.NPC_DJ_SET_MODE, { mode: 'fallback' })
    await wait(120)
    expect(room.state.npcDjMode).toBe('fallback')
    expect(room.state.players.has(npcSessionId)).toBe(true)
    expect(room.state.djQueue.some((e) => e.sessionId === npcSessionId)).toBe(true)

    // Non-creator cannot dismiss it either.
    await wait(1100)
    guest.send(Message.NPC_DJ_SET_MODE, { mode: 'off' })
    await wait(120)
    expect(room.state.npcDjMode).toBe('fallback')

    // Creator turns it off: NPC fully despawns.
    creator.send(Message.NPC_DJ_SET_MODE, { mode: 'off' })
    await wait(120)
    expect(room.state.npcDjMode).toBe('off')
    expect(room.state.players.has(npcSessionId)).toBe(false)
    expect(room.state.djQueue.some((e) => e.sessionId === npcSessionId)).toBe(false)

    await creator.leave()
    await guest.leave()
  })
})
