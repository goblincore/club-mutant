import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { Message } from '@club-mutant/types/Messages'
// The server rejects (and kicks the sender for) any payload this validator refuses, so
// the client's real payloads must always pass it. This test is the contract between them.
import { validRoomMessage } from '../../../../server/src/lib/roomMessageValidation'

// NetworkManager touches browser globals at construction; stub the few it reads.
vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
vi.stubGlobal('window', { location: { hostname: 'localhost', protocol: 'http:', port: '5173' }, addEventListener: vi.fn(), removeEventListener: vi.fn() })
const { NetworkManager } = await import('../NetworkManager')
const { TimeSync } = await import('../TimeSync')

type Sent = { type: Message; payload: unknown }

function harness() {
  const sent: Sent[] = []
  const room = { send: (type: Message, payload?: unknown) => sent.push({ type, payload }), onMessage: vi.fn() }
  const network = new NetworkManager('ws://localhost:2567') as any
  network.room = room
  return { sent, network, room }
}

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

// One entry per message the client can send. Calls go through `any` so the test does not
// depend on the exact signature of each sender, only on the payload it puts on the wire.
const senders: Array<[Message, (n: any) => void]> = [
  [Message.ADD_CHAT_MESSAGE, (n) => n.sendChat('hello')],
  [Message.ADD_CHAT_MESSAGE, (n) => n.sendChat('with image', 'https://cdn.mutante.club/chat/abc_DEF-123.jpg')],
  [Message.CHAT_HISTORY, (n) => n.requestChatHistory()],
  [Message.UPDATE_PLAYER_ACTION, (n) => n.sendPosition(12.5, -40, 'run')],
  [Message.READY_TO_CONNECT, (n) => n.sendReady()],
  [Message.UPDATE_PLAYER_NAME, (n) => n.sendPlayerName('mutant')],
  [Message.CONNECT_TO_MUSIC_BOOTH, (n) => n.connectToBooth(0)],
  [Message.DISCONNECT_FROM_MUSIC_BOOTH, (n) => n.disconnectFromBooth()],
  [Message.DJ_QUEUE_JOIN, (n) => n.joinDJQueue(1)],
  [Message.DJ_QUEUE_JOIN, (n) => n.joinDJQueue()],
  [Message.DJ_QUEUE_LEAVE, (n) => n.leaveDJQueue()],
  [Message.NPC_DJ_SET_STANDBY, (n) => n.setNpcDjStandby(true)],
  [Message.NPC_DJ_SET_MODE, (n) => n.setNpcDjMode('rotation')],
  [Message.DJ_PLAY, (n) => n.djPlay()],
  [Message.DJ_STOP, (n) => n.djStop()],
  [Message.DJ_SKIP_TURN, (n) => n.djSkipTurn(3)],
  [Message.DJ_TURN_COMPLETE, (n) => n.djTurnComplete(3)],
  [Message.DJ_TURN_COMPLETE, (n) => n.djTurnComplete(0)],
  [Message.PLAYER_JUMP, (n) => n.sendJump()],
  [Message.ROOM_QUEUE_PLAYLIST_ADD, (n) => n.addToQueuePlaylist('A track', YT, 215)],
  [Message.ROOM_QUEUE_PLAYLIST_ADD, (n) => n.addToQueuePlaylist('Pasted link, unknown duration', YT, 0)],
  [Message.ROOM_QUEUE_PLAYLIST_ADD, (n) => n.addToQueuePlaylist('x'.repeat(100), YT, 3600)],
  [Message.ROOM_QUEUE_PLAYLIST_REMOVE, (n) => n.removeFromQueuePlaylist('3f2b8c1e-aaaa-bbbb-cccc-1234567890ab')],
  [Message.ROOM_QUEUE_PLAYLIST_REORDER, (n) => n.reorderQueuePlaylist(0, 2)],
  [Message.JUKEBOX_CONNECT, (n) => n.jukeboxConnect()],
  [Message.JUKEBOX_DISCONNECT, (n) => n.jukeboxDisconnect()],
  [Message.JUKEBOX_ADD, (n) => n.addToJukebox('A track', YT, 215)],
  [Message.JUKEBOX_REMOVE, (n) => n.removeFromJukebox('3f2b8c1e-aaaa-bbbb-cccc-1234567890ab')],
  [Message.JUKEBOX_PLAY, (n) => n.jukeboxPlay()],
  [Message.JUKEBOX_STOP, (n) => n.jukeboxStop()],
  [Message.JUKEBOX_SKIP, (n) => n.jukeboxSkip()],
  [Message.JUKEBOX_TRACK_COMPLETE, (n) => n.jukeboxTrackComplete(7)],
  [Message.DREAM_SLEEP, (n) => n.sendDreamSleep()],
  [Message.DREAM_WAKE, (n) => n.sendDreamWake()],
  [Message.DREAM_COLLECT, (n) => n.sendDreamCollect('static_flower')],
]

// Sent from inside larger flows (upload, token refresh loop) rather than a one-line method.
const inlinePayloads: Array<[Message, unknown]> = [
  [Message.SERVICE_AUTH, undefined],
  [Message.AUTH_REFRESH, { token: 'header.payload.signature' }],
]

describe('client messages pass the server validator', () => {
  it.each(senders.map(([type, call], i) => [Message[type] + ` #${i}`, type, call] as const))(
    '%s',
    (_name, type, call) => {
      const { sent, network } = harness()
      call(network)
      expect(sent).toHaveLength(1)
      expect(sent[0].type).toBe(type)
      // A msgpack round trip drops `undefined` fields, exactly as on the wire.
      const wire = sent[0].payload === undefined ? undefined : JSON.parse(JSON.stringify(sent[0].payload))
      expect(validRoomMessage(type, wire), `payload: ${JSON.stringify(wire)}`).toBe(true)
    },
  )

  it.each(inlinePayloads.map(([type, payload]) => [Message[type], type, payload] as const))('%s', (_name, type, payload) => {
    expect(validRoomMessage(type, payload)).toBe(true)
  })

  it('time sync probes are valid', () => {
    const sent: Sent[] = []
    const room = { send: (type: Message, payload?: unknown) => sent.push({ type, payload }), onMessage: vi.fn() }
    const sync = new TimeSync(room as any) as any
    sync.sendProbe()
    expect(sent[0].type).toBe(Message.TIME_SYNC_REQUEST)
    expect(validRoomMessage(sent[0].type, sent[0].payload)).toBe(true)
  })

  it('covers every message the client sends', () => {
    const covered = new Set<Message>([
      ...senders.map(([type]) => type),
      ...inlinePayloads.map(([type]) => type),
      Message.TIME_SYNC_REQUEST,
    ])
    const sources = ['../NetworkManager.ts', '../TimeSync.ts'].map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
    const used = new Set<string>()
    for (const source of sources) for (const m of source.matchAll(/\.send\(\s*Message\.([A-Z_]+)/g)) used.add(m[1])
    const missing = [...used].filter((name) => !covered.has((Message as any)[name]))
    expect(missing, 'add these messages to the contract test').toEqual([])
  })
})
