import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
const runtime = runInNewContext(readFileSync(new URL('../../../../nakama/modules/index.js', import.meta.url), 'utf8') + '\n({getMessagesRpc: getMessagesRpc, sendMessageRpc: sendMessageRpc, updateConversationIndex: updateConversationIndex, createWallPostRpc: createWallPostRpc});')
const logger = { info: vi.fn(), warn: vi.fn() }
describe('Nakama Messenger runtime', () => {
  it('returns every scanned match so the cursor cannot skip an overflow', () => {
    const nk = { storageList: vi.fn().mockReturnValueOnce({ objects: Array.from({ length: 50 }, (_, i) => ({ value: { messageId: String(i), senderId: i < 49 ? 'friend' : 'other' } })), cursor: 'page-2' })
      .mockReturnValueOnce({ objects: Array.from({ length: 50 }, (_, i) => ({ value: { messageId: String(i + 50), senderId: 'friend' } })), cursor: 'page-3' }) }
    const result = JSON.parse(runtime.getMessagesRpc({ userId: 'me' }, logger, nk, JSON.stringify({ other_user_id: 'friend' })))
    expect(result.messages).toHaveLength(99)
    expect(result.cursor).toBe('page-3')
  })
  it('preserves the sender unread count when updating their outgoing preview', () => {
    const nk = { storageRead: () => [{ value: { unreadCount: 4 } }], storageWrite: vi.fn() }
    runtime.updateConversationIndex(nk, 'me', 'friend', 'Friend', 'hello', 1, 0)
    expect(nk.storageWrite.mock.calls[0][0][0].value.unreadCount).toBe(4)
  })
  it('uses the same correct notification signature for MutantBook wall posts', () => {
    const nk = {
      storageRead: () => [], storageWrite: vi.fn(), accountGetId: (id: string) => ({ user: { username: id } }),
      friendsList: () => ({ friends: [{ user: { id: 'friend' } }] }), uuidv4: () => 'post-id', notificationSend: vi.fn(),
    }
    runtime.createWallPostRpc({ userId: 'me' }, logger, nk, JSON.stringify({ target_user_id: 'friend', content: 'hello wall' }))
    expect(nk.notificationSend.mock.calls[0][2]).toMatchObject({ postId: 'post-id', preview: 'hello wall' })
    expect(nk.notificationSend.mock.calls[0][3]).toBe(101)
  })
  it('includes the complete body and authoritative time in realtime notifications', () => {
    const nk = {
      storageRead: () => [], storageWrite: vi.fn(), accountGetId: (id: string) => ({ user: { username: id } }),
      uuidv4: () => 'message-id', notificationSend: vi.fn(),
    }
    const body = 'A long message with a real ending. '.repeat(8)
    const result = JSON.parse(runtime.sendMessageRpc({ userId: 'me' }, logger, nk, JSON.stringify({ recipient_id: 'friend', subject: 'dm', body })))
    const payload = nk.notificationSend.mock.calls[0][2]
    expect(nk.notificationSend.mock.calls[0][3]).toBe(100)
    expect(payload.body).toBe(body.trim())
    expect(payload.preview).toHaveLength(80)
    expect(payload.createdAt).toBe(result.createdAt)
  })
})
