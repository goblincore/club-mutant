import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ColyseusTestServer } from '@colyseus/testing'
import { Server, CloseCode } from '@colyseus/core'
import { uWebSocketsTransport } from '@colyseus/uwebsockets-transport'
import jwt from 'jsonwebtoken'
import { ClubMutant } from '../rooms/ClubMutant'
import { RoomType } from '@club-mutant/types/Rooms'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const key = 'c'.repeat(64)
const roomOptions = { name: 'Duplicate session', musicMode: 'jukebox', autoDispose: false, isPublic: true }
const deviceKey = (tag: string) => `${tag}`.padEnd(32, 'x')
const token = (uid: string) => jwt.sign({ uid, usn: uid }, key, { expiresIn: 300 })

// Closing a tab or reloading drops the socket. The server holds that seat for 60s so a flaky
// connection can resume, so the reloaded page used to show up as a second copy of the player.
describe('a returning player replaces their own dropped session', () => {
  let server: ColyseusTestServer
  beforeAll(async () => {
    process.env.NAKAMA_ENCRYPTION_KEY = key
    const transport = new uWebSocketsTransport({ maxPayloadLength: 64 * 1024 })
    await transport.getExpressApp()
    const game = new Server({ transport })
    game.define(RoomType.CUSTOM, ClubMutant)
    await game.listen(2571)
    server = new ColyseusTestServer(game)
  })
  afterAll(async () => {
    await server?.shutdown()
    delete process.env.NAKAMA_ENCRYPTION_KEY
  })

  /** Drop the socket the way a closed tab does, without the client trying to resume. */
  async function dropWithoutResuming(room: ClubMutant, client: any) {
    client.reconnection.maxRetries = 0
    client.connection.close(CloseCode.MAY_TRY_RECONNECT, 'tab closed')
    for (let i = 0; i < 40 && room.state.players.get(client.sessionId)?.connected !== false; i++) await wait(25)
  }

  // The room seeds its own NPC characters; only real players matter here.
  const humans = (room: ClubMutant) => [...room.state.players.keys()].filter((id) => !id.startsWith('npc'))
  const playerIds = humans

  it('guest: reloading replaces the held seat instead of adding a second player', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, roomOptions)
    const before = await server.connectTo(room, { name: 'guest', deviceKey: deviceKey('guest-a') })
    await dropWithoutResuming(room, before)
    expect(room.state.players.get(before.sessionId)?.connected).toBe(false) // seat is being held

    const after = await server.connectTo(room, { name: 'guest', deviceKey: deviceKey('guest-a') })
    for (let i = 0; i < 40 && humans(room).length > 1; i++) await wait(25)
    expect(playerIds(room)).toEqual([after.sessionId])
  })

  it('logged-in user: the same Nakama user replaces their held seat', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, roomOptions)
    const before = await server.connectTo(room, { name: 'user', nakamaToken: token('user-1') })
    await dropWithoutResuming(room, before)

    const after = await server.connectTo(room, { name: 'user', nakamaToken: token('user-1') })
    for (let i = 0; i < 40 && humans(room).length > 1; i++) await wait(25)
    expect(playerIds(room)).toEqual([after.sessionId])
  })

  it('never touches another person\'s held seat', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, roomOptions)
    const alice = await server.connectTo(room, { name: 'alice', deviceKey: deviceKey('guest-alice') })
    await dropWithoutResuming(room, alice)

    const bob = await server.connectTo(room, { name: 'bob', deviceKey: deviceKey('guest-bob') })
    const keyless = await server.connectTo(room, { name: 'old client' })
    await wait(300)
    expect(playerIds(room).sort()).toEqual([alice.sessionId, bob.sessionId, keyless.sessionId].sort())
    expect(room.state.players.get(alice.sessionId)?.connected).toBe(false)
  })

  it('a malformed device key is ignored rather than rejected or used as an identity', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, roomOptions)
    const first = await server.connectTo(room, { name: 'a', deviceKey: 'short' })
    await dropWithoutResuming(room, first)
    const second = await server.connectTo(room, { name: 'b', deviceKey: 'short' })
    await wait(300)
    expect(playerIds(room).sort()).toEqual([first.sessionId, second.sessionId].sort())
  })

  it('keeps the grace period: a dropped player with no new session can still resume', { timeout: 15000 }, async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, roomOptions)
    const client = await server.connectTo(room, { name: 'flaky', deviceKey: deviceKey('guest-flaky') })
    client.reconnection.minUptime = 0
    client.reconnection.minDelay = 300
    client.reconnection.maxDelay = 300
    const reconnected = new Promise<void>((resolve) => client.onReconnect(() => resolve()))
    client.connection.close(CloseCode.MAY_TRY_RECONNECT, 'network blip')
    await reconnected
    expect(playerIds(room)).toEqual([client.sessionId])
    expect(room.state.players.get(client.sessionId)?.connected).toBe(true)
  })

  it('reload race: the new session joins before the old socket is noticed as dropped', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, roomOptions)
    const oldTab = await server.connectTo(room, { name: 'tab', deviceKey: deviceKey('guest-race') })
    const newTab = await server.connectTo(room, { name: 'tab', deviceKey: deviceKey('guest-race') })
    expect(humans(room).length).toBe(2) // both live: second tab is allowed

    oldTab.reconnection.maxRetries = 0
    oldTab.connection.close(CloseCode.MAY_TRY_RECONNECT, 'old tab closed')
    for (let i = 0; i < 40 && humans(room).length > 1; i++) await wait(25)
    // the old tab is not held for 60s: its newer twin already exists
    expect(playerIds(room)).toEqual([newTab.sessionId])
  })
})
