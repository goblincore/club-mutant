import { describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  user: { userId: 'me', username: 'me', token: 'token', refreshToken: 'refresh', setAuth: vi.fn(), logout: vi.fn() },
  subscribe: null as ((state: any, previous: any) => void) | null,
  sockets: [] as any[],
}))
vi.mock('../../stores/authStore', () => ({ useAuthStore: {
  getState: () => mock.user,
  subscribe: (cb: any) => { mock.subscribe = cb },
} }))
vi.mock('../../stores/presenceStore', () => ({ usePresenceStore: { getState: () => ({ clear: vi.fn(), addOnline: vi.fn(), removeOnline: vi.fn() }) } }))
vi.mock('@heroiclabs/nakama-js', () => ({
  Session: { restore: () => ({ isexpired: () => false, isrefreshexpired: () => false, user_id: 'me' }) },
  Client: class {
    createSocket() {
      const socket = { connect: vi.fn(async () => {}), disconnect: vi.fn(), ondisconnect: () => {}, onchannelmessage: (_m: unknown) => {}, onnotification: (_n: unknown) => {} }
      mock.sockets.push(socket)
      return socket
    }
  },
}))
import { connectSocket, disconnectSocket, getSocket, onChannelMessage, onSocketChange } from '../nakamaClient'

describe('shared Nakama socket lifecycle', () => {
  it('deduplicates simultaneous connection and restore calls, and routes channel events after replacement', async () => {
    const changes = vi.fn()
    const messages = vi.fn()
    const stopChanges = onSocketChange(changes)
    const stopMessages = onChannelMessage(messages)
    await Promise.all([connectSocket(), connectSocket()])
    expect(mock.sockets).toHaveLength(1)
    const first = mock.sockets[0]
    first.onchannelmessage({ content: { type: 'typing' } })
    expect(messages).toHaveBeenCalledTimes(1)
    disconnectSocket()
    expect(getSocket()).toBeNull()
    await connectSocket()
    const second = mock.sockets[1]
    second.onchannelmessage({ content: { type: 'typing' } })
    expect(messages).toHaveBeenCalledTimes(2)
    expect(changes.mock.calls.map((args) => !!args[0])).toEqual([false, true, false, true])
    stopChanges(); stopMessages(); disconnectSocket()
  })
  it('closes the old socket and clears its session when the account changes', async () => {
    await connectSocket()
    const socket = mock.sockets.at(-1)
    mock.subscribe?.({ userId: 'other' }, { userId: 'me' })
    expect(socket.disconnect).toHaveBeenCalledWith(false)
    expect(getSocket()).toBeNull()
  })
})
