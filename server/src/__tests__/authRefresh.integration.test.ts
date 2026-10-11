import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ColyseusTestServer } from '@colyseus/testing'
import { Server } from '@colyseus/core'
import { uWebSocketsTransport } from '@colyseus/uwebsockets-transport'
import jwt from 'jsonwebtoken'
import { ClubMutant } from '../rooms/ClubMutant'
import { Message } from '@club-mutant/types/Messages'
import { RoomType } from '@club-mutant/types/Rooms'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const key = 'b'.repeat(64)
const token = (uid: string, lifetimeSec: number) =>
  jwt.sign({ uid, usn: uid }, key, { expiresIn: lifetimeSec })
const options = { name: 'Auth refresh', musicMode: 'jukebox', autoDispose: false, isPublic: true }

// The server drops a client when its Nakama token expires. AUTH_REFRESH extends the
// session with a newer token for the same user so long-lived rooms do not kick players.
describe('authenticated session expiry and refresh', () => {
  let server: ColyseusTestServer
  beforeAll(async () => {
    process.env.NAKAMA_ENCRYPTION_KEY = key
    const transport = new uWebSocketsTransport({ maxPayloadLength: 64 * 1024 })
    await transport.getExpressApp()
    const game = new Server({ transport })
    game.define(RoomType.CUSTOM, ClubMutant)
    await game.listen(2570)
    server = new ColyseusTestServer(game)
  })
  afterAll(async () => {
    await server?.shutdown()
    delete process.env.NAKAMA_ENCRYPTION_KEY
  })

  it('disconnects a client at token expiry', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, options)
    const client = await server.connectTo(room, { name: 'expiring', nakamaToken: token('user-a', 1) })
    let code: number | undefined
    client.onLeave((c) => (code = c))
    await wait(1800)
    expect(code).toBe(1008)
  })

  it('keeps a client connected when it sends a refreshed token for the same user', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, options)
    const client = await server.connectTo(room, { name: 'refreshing', nakamaToken: token('user-b', 1) })
    let code: number | undefined
    client.onLeave((c) => (code = c))
    client.send(Message.AUTH_REFRESH, { token: token('user-b', 60) })
    await wait(1800)
    expect(code).toBeUndefined()
    expect(room.clients.length).toBe(1)
  })

  it('rejects a refresh token that belongs to another user', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, options)
    const client = await server.connectTo(room, { name: 'swapper', nakamaToken: token('user-c', 60) })
    const left = new Promise<number>((resolve) => client.onLeave((c) => resolve(c)))
    client.send(Message.AUTH_REFRESH, { token: token('user-d', 60) })
    expect(await left).toBe(1008)
  })

  it('rejects an expired or forged refresh token', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, options)
    const client = await server.connectTo(room, { name: 'forger', nakamaToken: token('user-e', 60) })
    const left = new Promise<number>((resolve) => client.onLeave((c) => resolve(c)))
    client.send(Message.AUTH_REFRESH, { token: jwt.sign({ uid: 'user-e', usn: 'user-e' }, 'wrong-key', { expiresIn: 60 }) })
    expect(await left).toBe(1008)
  })

  it('ignores refresh from guests', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, options)
    const guest = await server.connectTo(room, { name: 'guest' })
    let code: number | undefined
    guest.onLeave((c) => (code = c))
    guest.send(Message.AUTH_REFRESH, { token: token('user-f', 60) })
    await wait(500)
    expect(code).toBeUndefined()
  })
})
