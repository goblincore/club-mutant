import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ColyseusTestServer } from '@colyseus/testing'
import { Server } from '@colyseus/core'
import { uWebSocketsTransport } from '@colyseus/uwebsockets-transport'
import { ClubMutant } from '../rooms/ClubMutant'
import { Message } from '@club-mutant/types/Messages'
import { RoomType } from '@club-mutant/types/Rooms'
import { validRoomMessage } from '../lib/roomMessageValidation'
import jwt from 'jsonwebtoken'
import net from 'node:net'

const wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms))
const options = { name: 'Security test', musicMode: 'jukebox', autoDispose: false, isPublic: true }
describe('security boundaries on the deployed transport', () => {
  let server: ColyseusTestServer
  const key = 'a'.repeat(64)
  beforeAll(async () => {
    process.env.SERVICE_AUTH_KEY = key
    process.env.NAKAMA_ENCRYPTION_KEY = key
    const transport = new uWebSocketsTransport({ maxPayloadLength: 64 * 1024 })
    const app = await transport.getExpressApp()
    app.get('/health', (_req, res) => res.send('ok'))
    const game = new Server({ transport })
    game.define(RoomType.CUSTOM, ClubMutant)
    game.define(RoomType.MYROOM, ClubMutant)
    await game.listen(2569)
    server = new ColyseusTestServer(game)
  })
  afterAll(async () => { await server?.shutdown(); delete process.env.SERVICE_AUTH_KEY; delete process.env.NAKAMA_ENCRYPTION_KEY })

  it('rejects hostile payloads before dereferencing or broadcasting', () => {
    for (const payload of [null, [], {}, { content: 42 }, { content: 'a'.repeat(1001) }, { content: '', imageUrl: 'http://127.0.0.1/x' }]) {
      expect(validRoomMessage(Message.ADD_CHAT_MESSAGE, payload)).toBe(false)
    }
    expect(validRoomMessage(Message.DREAM_COLLECT, { collectibleId: 'arbitrary' })).toBe(false)
    expect(validRoomMessage(Message.ROOM_QUEUE_PLAYLIST_REORDER, { fromIndex: NaN, toIndex: 0 })).toBe(false)
    expect(validRoomMessage(Message.JUKEBOX_TRACK_COMPLETE, {})).toBe(false)
  })

  it('survives malformed chat over a real WebSocket', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, { ...options, musicMode: 'personal' })
    const attacker = await server.connectTo(room, { name: 'attacker' })
    const observer = await server.connectTo(room, { name: 'observer' })
    const left = new Promise<void>(resolve => attacker.onLeave(() => resolve()))
    attacker.send(Message.ADD_CHAT_MESSAGE, null)
    await left
    observer.send(Message.ADD_CHAT_MESSAGE, { content: 'still alive' })
    await wait()
    expect(room.state.chatMessages.at(-1)?.content).toBe('still alive')
    await observer.leave()
  })

  it('does not trust guest identity or client room lifecycle flags', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, { ...options, musicMode: 'djqueue' })
    const creator = await server.connectTo(room, { playerId: 'claimed-owner' })
    const actual = room.state.creatorPlayerId
    const attacker = await server.connectTo(room, { playerId: actual })
    expect(room.autoDispose).toBe(true)
    expect(actual).toMatch(/^guest:/)
    expect(room.state.players.get(attacker.sessionId)!.playerId).not.toBe(actual)
    attacker.send(Message.NPC_DJ_SET_MODE, { mode: 'rotation' })
    await wait()
    expect(room.state.npcDjMode).not.toBe('rotation')
    await attacker.leave(); await creator.leave()
  })

  it('issues an upload capability for a joined guest, bounded to five minutes', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, { ...options, musicMode: 'personal' })
    const client = await server.connectTo(room, {})
    const response = new Promise<any>(resolve => client.onMessage(Message.SERVICE_AUTH, resolve))
    client.send(Message.SERVICE_AUTH)
    const { token } = await response
    const claims = jwt.verify(token, key, { algorithms: ['HS256'], issuer: 'club-mutant-game', audience: 'club-mutant-services' }) as jwt.JwtPayload
    expect(claims.sub).toBe(room.state.players.get(client.sessionId)!.playerId)
    expect(claims.scope).toBe('upload')
    expect(claims.exp! - claims.iat!).toBeLessThanOrEqual(300)
    await client.leave()
  })

  it('requires authentication and checks the personal room owner', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.MYROOM, options)
    await expect(server.connectTo(room, {})).rejects.toThrow()
    const token = (uid: string) => jwt.sign({ uid, usn: uid }, key, { expiresIn: 60 })
    // Exercise auth before seat allocation as well as the maxClients safeguard.
    expect(room.maxClients).toBe(1)
    room.onAuth({ sessionId: 'owner' } as any, { password: null, nakamaToken: token('owner') })
    expect(() => room.onAuth({ sessionId: 'other' } as any, { password: null, nakamaToken: token('other') })).toThrow('Private room')
    await room.disconnect()
  })

  it('ignores forged premature completion reports without cancelling the watchdog', async () => {
    const room = await server.createRoom<ClubMutant>(RoomType.CUSTOM, { ...options, musicMode: 'jukebox' })
    const client = await server.connectTo(room, {})
    client.send(Message.JUKEBOX_CONNECT)
    await wait()
    client.send(Message.JUKEBOX_ADD, { title: 'Track', link: 'dQw4w9WgXcQ', duration: 213 })
    await wait()
    client.send(Message.JUKEBOX_PLAY)
    await wait()
    client.send(Message.JUKEBOX_TRACK_COMPLETE, { streamId: room.state.musicStream.streamId })
    await wait()
    expect(room.state.jukeboxPlaylist.length).toBe(1)
    expect(room.state.musicStream.status).toBe('playing')
    await client.leave()
  })

  it('limits matchmaking HTTP bodies before parsing', async () => {
    const response = await fetch('http://127.0.0.1:2569/matchmake/create/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(70000) }) })
    expect(response.status).toBe(413)
  })

  it('rejects browser WebSocket upgrades from an untrusted production origin', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const response = await new Promise<string>(resolve => {
        const socket = net.connect(2569, '127.0.0.1', () => socket.write('GET /unknown/unknown HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nOrigin: https://evil.example\r\n\r\n'))
        socket.on('data', data => { socket.destroy(); resolve(data.toString()) })
      })
      expect(response).toContain('403 Forbidden')
    } finally { process.env.NODE_ENV = previous }
  })

  it('survives an aborted request in the Express fallback', async () => {
    await new Promise<void>(resolve => {
      const socket = net.connect(2569, '127.0.0.1', () => {
        socket.write('POST /unknown HTTP/1.1\r\nHost: localhost\r\nContent-Length: 10000\r\n\r\nx')
        setTimeout(() => { socket.destroy(); resolve() }, 50)
      })
    })
    await wait()
    expect((await fetch('http://127.0.0.1:2569/health')).status).toBe(200)
  })
})
