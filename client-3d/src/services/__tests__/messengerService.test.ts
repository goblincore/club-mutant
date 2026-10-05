import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { ChannelMessage, Socket } from '@heroiclabs/nakama-js'

const mock = vi.hoisted(() => ({
  socket: null as unknown,
  notifications: new Set<(n: any) => void>(), channels: new Set<(m: any) => void>(), sockets: new Set<(s: any) => void>(),
  history: vi.fn(), conversations: vi.fn(), send: vi.fn(), read: vi.fn(),
}))
vi.mock('../../network/nakamaClient', () => ({
  sendDirectMessage: mock.send, getDirectMessages: mock.history, listConversations: mock.conversations, markMessagesRead: mock.read,
  getSocket: () => mock.socket, connectSocket: vi.fn(async () => {}),
  onNotification: (cb: any) => { mock.notifications.add(cb); return () => mock.notifications.delete(cb) },
  onChannelMessage: (cb: any) => { mock.channels.add(cb); return () => mock.channels.delete(cb) },
  onSocketChange: (cb: any) => { mock.sockets.add(cb); cb(mock.socket); return () => mock.sockets.delete(cb) },
}))
vi.mock('../../stores/authStore', () => ({ useAuthStore: { getState: () => ({ userId: 'me' }) } }))
import { createMessengerService } from '../messengerService'

const socket = () => ({ joinChat: vi.fn(async (partner) => ({ id: `channel:${partner}` })), writeChatMessage: vi.fn(async () => {}), leaveChat: vi.fn(async () => {}) })
beforeEach(() => {
  vi.useFakeTimers()
  mock.socket = null
  mock.notifications.clear(); mock.channels.clear(); mock.sockets.clear()
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('Messenger transport', () => {
  it('walks empty history pages, deduplicates, and orders the complete thread', async () => {
    const m = (id: string, time: number) => ({ messageId: id, createdAt: time, senderId: 'friend', senderUsername: 'Friend', body: id })
    mock.history.mockResolvedValueOnce({ messages: [m('old', 1)], cursor: 'a' })
      .mockResolvedValueOnce({ messages: [], cursor: 'b' })
      .mockResolvedValueOnce({ messages: [m('new', 3), m('old', 1), m('middle', 2)] })
    const result = await createMessengerService().getMessages('friend')
    expect(result.messages.map((m) => m.messageId)).toEqual(['old', 'middle', 'new'])
    expect(mock.history.mock.calls.map((args) => args[1])).toEqual([undefined, 'a', 'b'])
  })
  it('includes contacts beyond the first storage page', async () => {
    mock.conversations.mockResolvedValueOnce({ conversations: [{ otherUserId: 'a', lastMessageAt: 1 }], cursor: 'next' })
      .mockResolvedValueOnce({ conversations: [{ otherUserId: 'b', lastMessageAt: 2 }] })
    expect((await createMessengerService().listConversations()).map((c) => c.otherUserId)).toEqual(['b', 'a'])
  })
  it('rejects repeating cursors instead of looping indefinitely', async () => {
    mock.history.mockResolvedValue({ messages: [], cursor: 'same' })
    await expect(createMessengerService().getMessages('friend')).rejects.toThrow('retry')
    expect(mock.history).toHaveBeenCalledTimes(2)
  })
  it('delivers full notification bodies and labels legacy previews', () => {
    const service = createMessengerService()
    const received = vi.fn()
    service.onMessageReceived(received)
    service.connect(); service.connect()
    expect(mock.notifications.size).toBe(1)
    mock.notifications.forEach((cb) => cb({ code: 100, content: { messageId: 'full', senderId: 'friend', body: 'x'.repeat(250), createdAt: 123, preview: 'x'.repeat(80) } }))
    expect(received.mock.calls[0][0]).toMatchObject({ body: 'x'.repeat(250), createdAt: 123, isPreview: false })
    mock.notifications.forEach((cb) => cb({ code: 100, content: { messageId: 'legacy', senderId: 'friend', preview: 'short' } }))
    expect(received.mock.calls[1][0].isPreview).toBe(true)
    service.disconnect()
  })
  it('joins after late login and rejoins after reconnect without clobbering listeners', async () => {
    const service = createMessengerService()
    const typing = vi.fn()
    service.onTypingIndicator(typing)
    service.connect()
    await service.joinConversationChannel('friend')
    const first = socket()
    mock.socket = first
    mock.sockets.forEach((cb) => cb(first))
    await Promise.resolve(); await Promise.resolve()
    expect(first.joinChat).toHaveBeenCalledWith('friend', 2, false, true)
    mock.channels.forEach((cb) => cb({ channel_id: 'channel:friend', sender_id: 'friend', content: { type: 'typing' } } as unknown as ChannelMessage))
    expect(typing).toHaveBeenLastCalledWith('friend', true)
    mock.socket = null
    mock.sockets.forEach((cb) => cb(null))
    expect(typing).toHaveBeenLastCalledWith('friend', false)
    const second = socket()
    mock.socket = second
    mock.sockets.forEach((cb) => cb(second as unknown as Socket))
    await Promise.resolve(); await Promise.resolve()
    expect(second.joinChat).toHaveBeenCalledTimes(1)
    service.disconnect()
    expect(mock.channels.size).toBe(0)
    expect(second.leaveChat).toHaveBeenCalledWith('channel:friend')
    service.connect()
    expect(mock.channels.size).toBe(1)
    // Consumer subscriptions survive lifecycle replay; their unsubscribe owns them.
    await service.joinConversationChannel('friend')
    mock.channels.forEach((cb) => cb({ channel_id: 'channel:friend', sender_id: 'friend', content: { type: 'typing' } }))
    expect(typing).toHaveBeenLastCalledWith('friend', true)
    service.disconnect()
  })
})
